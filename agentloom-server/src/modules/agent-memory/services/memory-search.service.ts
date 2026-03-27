import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, lte, sql } from 'drizzle-orm';

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
  // PostgreSQL ts_rank 相关性分数
  relevanceScore: number;
  // ts_headline 生成的高亮摘要
  snippet: string;
  // 节点公开等级
  disclosureLevel: number;
}

// 记忆全文搜索服务
// 使用 PostgreSQL tsvector/tsquery 实现全文检索，
// 支持相关性排序、分页和公开等级过滤。
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
    const sanitized = this.sanitizeQuery(options.query);

    if (!sanitized) {
      return [];
    }

    const safeLimit = Math.min(Math.max(options.limit ?? 20, 1), 100);
    const safeOffset = Math.max(options.offset ?? 0, 0);

    const db = getTenantDb(this.db);

    const tsQuery = sql`to_tsquery('english', ${sanitized})`;
    const tsVector = sql`to_tsvector('english', ${memoryVersions.content})`;

    const relevanceScore = sql<number>`ts_rank_cd(${tsVector}, ${tsQuery})`;
    const snippet = sql<string>`ts_headline('english', ${memoryVersions.content}, ${tsQuery}, 'StartSel=<b>, StopSel=</b>, MaxWords=50, MinWords=20')`;

    const conditions = [
      eq(memoryNodes.instanceId, instanceId),
      eq(memoryVersions.deprecated, false),
      sql`${tsVector} @@ ${tsQuery}`,
    ];

    if (options.minDisclosure !== undefined) {
      conditions.push(lte(memoryNodes.disclosureLevel, options.minDisclosure));
    }

    const results = await db
      .select({
        nodeId: memoryNodes.id,
        content: memoryVersions.content,
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

    return results;
  }

  // 清理查询字符串以安全用作 tsquery 输入
  // - 移除 tsquery 特殊操作符和语法字符
  // - 提取有效的字母数字词汇
  // - 使用 & 连接多个词（AND 语义）
  // @returns 清理后的 tsquery 字符串，若无有效词则返回空字符串
  private sanitizeQuery(query: string): string {
    const trimmed = query.trim();

    if (!trimmed) {
      return '';
    }

    // 提取字母数字词汇（包括 Unicode），移除所有 tsquery 特殊字符
    const words = trimmed.match(/[\p{L}\p{N}]+/gu);

    if (!words || words.length === 0) {
      return '';
    }

    return words.join(' & ');
  }
}
