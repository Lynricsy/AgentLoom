import { createRequire } from 'node:module';
import { basename } from 'node:path';
import { type Artifact, code, doc, rel, repoPath, table, walk } from '../lib';

const SCHEMA_DIR = repoPath('agentloom-server/src/database/schema');

interface DrizzleColumn {
  name: string;
  notNull: boolean;
  hasDefault: boolean;
  default: unknown;
  defaultFn?: unknown;
  primary: boolean;
  getSQLType(): string;
}

/** 列默认值 → 可读文本；drizzle `sql\`…\`` 默认值拼接其字符串片段 */
function renderDefault(col: DrizzleColumn): string {
  if (!col.hasDefault) return '';
  const d = col.default;
  if (d === undefined) return col.defaultFn ? '（运行时生成）' : '';
  if (d !== null && typeof d === 'object' && 'queryChunks' in d && Array.isArray(d.queryChunks)) {
    const text = d.queryChunks
      .map((chunk: unknown) => {
        if (typeof chunk === 'string') return chunk;
        if (chunk !== null && typeof chunk === 'object' && 'value' in chunk && Array.isArray(chunk.value)) {
          return chunk.value.join('');
        }
        return '';
      })
      .join('')
      .trim();
    return code(text);
  }
  return code(JSON.stringify(d));
}

export interface TableInfo {
  name: string;
  file: string;
  columns: DrizzleColumn[];
}

export function collectTables(): TableInfo[] {
  // drizzle-orm 只装在 agentloom-server 下；`is()` 依赖同一份类实例，
  // 因此必须从 schema 所在包解析，而不是从仓库根解析。
  const serverRequire = createRequire(`${SCHEMA_DIR}/index.ts`);
  const { is, getTableName, getTableColumns } = serverRequire('drizzle-orm');
  const { PgTable } = serverRequire('drizzle-orm/pg-core');

  // schema 文件清单在运行时枚举，只能逐个 require；index.ts 的导出与之同源。
  const indexExports: Record<string, unknown> = serverRequire('./index.ts');
  const indexed = new Set(Object.values(indexExports).filter((v) => is(v, PgTable)));

  const seen = new Set<unknown>();
  const tables: TableInfo[] = [];
  for (const file of walk(SCHEMA_DIR, (f) => f.endsWith('.schema.ts') && !f.includes('__tests__'))) {
    const mod: Record<string, unknown> = serverRequire(file);
    for (const value of Object.values(mod)) {
      if (!is(value, PgTable) || seen.has(value) || !indexed.has(value)) continue;
      seen.add(value);
      tables.push({
        name: getTableName(value),
        file: rel(file),
        columns: Object.values(getTableColumns(value) as Record<string, DrizzleColumn>),
      });
    }
  }
  if (seen.size !== indexed.size) {
    throw new Error(`schema/index.ts 导出了 ${indexed.size} 张表，但 *.schema.ts 中只找到 ${seen.size} 张`);
  }
  return tables.sort((a, b) => a.file.localeCompare(b.file) || a.name.localeCompare(b.name));
}

export function tablesArtifact(tables: TableInfo[]): Artifact {
  const summary = table(
    ['表名', '列数', '含 `tenant_id`', '定义文件'],
    tables.map((t) => [
      code(t.name),
      String(t.columns.length),
      t.columns.some((c) => c.name === 'tenant_id') ? '是' : '否',
      code(basename(t.file)),
    ]),
  );
  const details = tables.map((t) =>
    [
      `### ${t.name}`,
      `定义：${code(t.file)}`,
      table(
        ['列', '类型', '非空', '默认值'],
        t.columns.map((c) => [
          code(c.name) + (c.primary ? '（主键）' : ''),
          code(c.getSQLType()),
          c.notNull ? '是' : '',
          renderDefault(c),
        ]),
      ),
    ].join('\n\n'),
  );
  return {
    path: 'tables.md',
    content: doc(
      '来源：`agentloom-server/src/database/schema/index.ts` 导出的全部 Drizzle `pgTable`，按定义文件排序。',
      summary,
      ...details,
    ),
  };
}
