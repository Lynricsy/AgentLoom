import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, lte, sql, type SQL } from 'drizzle-orm';

import { getTenantDb } from '../../../common/providers/tenant-aware-db.provider';
import { DRIZZLE, type DrizzleDB } from '../../../database/database.module';
import { memoryNodes, memoryVersions } from '../../../database/schema';

// 全文搜索查询选项
export interface MemorySearchOptions {
  // 搜索查询文本
  query: string;
  // 结果数量上限 (默认 20, 最大 100)
  limit?: number;
  // 分页偏移 (默认 0)
  offset?: number;
  // 最大公开等级过滤 (仅返回 disclosureLevel <= minDisclosure 的节点)
  minDisclosure?: number;
}

// 全文搜索结果条目
export interface MemorySearchResult {
  // 记忆节点 ID
  nodeId: string;
  // 版本内容全文
  content: string;
  // 相关性分数：ts_rank_cd 与 CJK 子串命中分之和
  relevanceScore: number;
  // 高亮摘要（命中词包在 <b></b> 中）
  snippet: string;
  // 节点公开等级
  disclosureLevel: number;
}

interface ParsedSearchQuery {
  // 走 english tsquery 的词（拉丁字母、数字等有空白分词的文字）
  tsTerms: string[];
  // 走 ILIKE 子串匹配的词（含 CJK 字符：english 解析器不切分，tsquery 只能整句命中）
  substringTerms: string[];
}

// 中日韩文字没有空格分词，english/simple 配置都会把整段 CJK 当成一个词。
const CJK_CHAR_PATTERN =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;

// 子串每命中一次的加分，与 ts_rank_cd 单次命中的量级（约 0.1）对齐，混合查询时两者可比。
const SUBSTRING_HIT_SCORE = 0.1;

// 无 tsquery 时摘要取首个命中词前后的字符数（对应 ts_headline 的 MinWords/MaxWords）。
const SUBSTRING_SNIPPET_LEAD = 20;
const SUBSTRING_SNIPPET_LENGTH = 80;

// 记忆全文搜索服务
// 拉丁文字走 PostgreSQL english tsvector/tsquery（词干化、相关性排序）；
// 含 CJK 的词走 ILIKE 子串匹配，不依赖分词扩展。多个词之间为 AND 语义。
@Injectable()
export class MemorySearchService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  // 在指定记忆实例中执行全文搜索
  // @param instanceId - 记忆实例 ID
  // @param options - 搜索选项
  // @returns 按相关性降序排列的搜索结果
  async search(
    instanceId: string,
    options: MemorySearchOptions,
  ): Promise<MemorySearchResult[]> {
    const { tsTerms, substringTerms } = this.parseQuery(options.query);

    if (tsTerms.length === 0 && substringTerms.length === 0) {
      return [];
    }

    const safeLimit = Math.min(Math.max(options.limit ?? 20, 1), 100);
    const safeOffset = Math.max(options.offset ?? 0, 0);

    const db = getTenantDb(this.db);
    const content = memoryVersions.content;

    const conditions = [
      eq(memoryNodes.instanceId, instanceId),
      eq(memoryVersions.deprecated, false),
    ];
    const scoreParts: SQL[] = [];
    // 没有 tsquery 时先取原文，摘要在内存中按子串命中位置截取。
    let snippet = sql<string>`${content}`;

    if (tsTerms.length > 0) {
      const tsQuery = sql`to_tsquery('english', ${tsTerms.join(' & ')})`;
      const tsVector = sql`to_tsvector('english', ${content})`;
      conditions.push(sql`${tsVector} @@ ${tsQuery}`);
      scoreParts.push(sql`ts_rank_cd(${tsVector}, ${tsQuery})`);
      snippet = sql<string>`ts_headline('english', ${content}, ${tsQuery}, 'StartSel=<b>, StopSel=</b>, MaxWords=50, MinWords=20')`;
    }

    // 词只含 \p{L}\p{N}（见 parseQuery），不会带入 LIKE 通配符 % _ 或转义符。
    for (const term of substringTerms) {
      conditions.push(sql`${content} ILIKE ${`%${term}%`}`);
      // 命中次数 = (原文长度 - 删去该词后的长度) / 词长
      scoreParts.push(
        sql`(char_length(lower(${content})) - char_length(replace(lower(${content}), lower(${term}::text), ''))) / char_length(${term}::text) * ${SUBSTRING_HIT_SCORE}::float8`,
      );
    }

    if (options.minDisclosure !== undefined) {
      conditions.push(lte(memoryNodes.disclosureLevel, options.minDisclosure));
    }

    const relevanceScore = sql<number>`(${scoreParts.reduce(
      (sum, part) => sql`${sum} + ${part}`,
    )})::float8`;

    const rows = await db
      .select({
        nodeId: memoryNodes.id,
        content,
        relevanceScore,
        snippet,
        disclosureLevel: memoryNodes.disclosureLevel,
      })
      .from(memoryVersions)
      .innerJoin(memoryNodes, eq(memoryVersions.nodeId, memoryNodes.id))
      .where(and(...conditions))
      .orderBy(desc(relevanceScore))
      .limit(safeLimit)
      .offset(safeOffset);

    if (substringTerms.length === 0) {
      return rows;
    }

    return rows.map((row) => ({
      ...row,
      snippet: this.highlightSubstrings(
        tsTerms.length > 0
          ? row.snippet
          : this.substringWindow(row.content, substringTerms),
        substringTerms,
      ),
    }));
  }

  // 提取查询中的词并按文字类型分流：
  // - 只保留 Unicode 字母数字，移除 tsquery 特殊操作符和 LIKE 通配符
  // - 含 CJK 字符的词走子串匹配，其余走 english tsquery
  private parseQuery(query: string): ParsedSearchQuery {
    const words = query.trim().match(/[\p{L}\p{N}]+/gu) ?? [];

    return {
      tsTerms: words.filter((word) => !CJK_CHAR_PATTERN.test(word)),
      substringTerms: words.filter((word) => CJK_CHAR_PATTERN.test(word)),
    };
  }

  // 截取首个子串命中位置附近的片段，作为无 ts_headline 时的摘要。
  private substringWindow(content: string, terms: string[]): string {
    const lowerContent = content.toLowerCase();
    const hits = terms
      .map((term) => lowerContent.indexOf(term.toLowerCase()))
      .filter((index) => index >= 0);
    const start = Math.max(Math.min(...hits) - SUBSTRING_SNIPPET_LEAD, 0);

    return content.slice(start, start + SUBSTRING_SNIPPET_LENGTH);
  }

  // 用与 ts_headline 相同的 <b></b> 标出子串命中，长词优先避免短词截断长词。
  private highlightSubstrings(text: string, terms: string[]): string {
    const alternation = [...terms]
      .sort((left, right) => right.length - left.length)
      .join('|');

    return text.replace(new RegExp(alternation, 'giu'), '<b>$&</b>');
  }
}
