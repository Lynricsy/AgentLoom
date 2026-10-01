import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

/** 仓库根目录（本文件位于 scripts/docs-reference/） */
export const REPO_ROOT = resolve(__dirname, '../..');
export const DOCS_ROOT = join(REPO_ROOT, 'agentloom-docs');
export const GENERATED_DIR = join(DOCS_ROOT, '_generated');

export const HEADER =
  '<!-- 由 scripts/docs-reference/generate.ts 生成，勿手改；运行 pnpm docs:gen -->';

/** 一个生成产物：相对 _generated/ 的路径 + 完整内容 */
export interface Artifact {
  path: string;
  content: string;
}

export function repoPath(...parts: string[]): string {
  return join(REPO_ROOT, ...parts);
}

export function rel(abs: string): string {
  return relative(REPO_ROOT, abs);
}

export function read(abs: string): string {
  return readFileSync(abs, 'utf8');
}

/** 递归列出目录下满足过滤条件的文件（绝对路径，排序后返回） */
export function walk(dir: string, filter: (abs: string) => boolean): string[] {
  const out: string[] = [];
  const visit = (d: string) => {
    for (const name of readdirSync(d)) {
      if (name === 'node_modules' || name.startsWith('.')) continue;
      const abs = join(d, name);
      if (statSync(abs).isDirectory()) visit(abs);
      else if (filter(abs)) out.push(abs);
    }
  };
  visit(dir);
  return out.sort();
}

/** 列出直接子目录名（排序） */
export function subdirs(dir: string): string[] {
  return readdirSync(dir)
    .filter((n) => !n.startsWith('.') && !n.startsWith('_') && statSync(join(dir, n)).isDirectory())
    .sort();
}

/** 非测试 TS 源文件 */
export function isSourceTs(abs: string): boolean {
  return /\.tsx?$/.test(abs) && !/\.(spec|test|e2e-spec)\.tsx?$/.test(abs) && !abs.includes('/__tests__/');
}

/** Markdown 表格单元格转义 */
export function cell(value: unknown): string {
  if (value === undefined || value === null || value === '') return '';
  return String(value).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim();
}

/** 行内代码单元格（空值保持为空） */
export function code(value: unknown): string {
  if (value === undefined || value === null || value === '') return '';
  return '`' + String(value).replace(/`/g, "'").replace(/\|/g, '\\|') + '`';
}

export function table(headers: string[], rows: string[][]): string {
  const head = `| ${headers.join(' | ')} |`;
  const sep = `| ${headers.map(() => '---').join(' | ')} |`;
  const body = rows.map((r) => `| ${r.join(' | ')} |`);
  return [head, sep, ...body].join('\n');
}

/** 拼装产物文件：头注释 + 段落，统一以单个换行结尾 */
export function doc(...blocks: string[]): string {
  return [HEADER, ...blocks].join('\n\n').trimEnd() + '\n';
}

export interface EnvEntry {
  key: string;
  value: string;
  comment: string;
}

/**
 * 解析 dotenv 风格文件：KEY=value 及其紧邻上方的连续 # 注释。
 * 纯分隔线注释（=、-、─ 等）不计入说明。
 */
export function parseEnvFile(abs: string): EnvEntry[] {
  const entries: EnvEntry[] = [];
  let pending: string[] = [];
  for (const raw of read(abs).split(/\r?\n/)) {
    const line = raw.trim();
    if (line === '') {
      pending = [];
      continue;
    }
    if (line.startsWith('#')) {
      const text = line.replace(/^#+\s?/, '').trim();
      if (text !== '' && !/^[=\-─━*#\s]+$/.test(text)) pending.push(text);
      continue;
    }
    const m = /^(?:export\s+)?([A-Z][A-Z0-9_]*)=(.*)$/.exec(line);
    if (m) {
      entries.push({ key: m[1], value: m[2], comment: pending.join(' ') });
      pending = [];
    }
  }
  return entries;
}
