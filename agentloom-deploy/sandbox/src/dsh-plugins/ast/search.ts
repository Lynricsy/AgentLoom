/**
 * ast_grep：在单个文件或目录树中按 ast-grep 模式做结构化搜索。
 * 文件收集逻辑（collectTargets）与 ast_edit 共用。
 */
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { parse, type SgNode } from '@ast-grep/napi';
import { capText } from '../shared/output-cap.js';
import { resolveWorkspacePath } from '../shared/workspace-path.js';
import { assertLanguageUsable, ensureLanguagesRegistered, languageForFile } from './languages.js';

/** 目录遍历时跳过的目录名 */
const SKIPPED_DIRECTORIES: Record<string, true> = {
  node_modules: true,
  '.git': true,
  dist: true,
  build: true,
  target: true,
  '.venv': true,
  __pycache__: true,
};

/** 单文件大小上限：超出跳过 */
export const MAX_FILE_BYTES = 1024 * 1024;

/** 目录遍历最多检查的文件数，防止误对巨型目录树发起搜索 */
const MAX_WALK_FILES = 20_000;

export interface TargetQuery {
  /** 文件或目录（相对 workdir 或绝对），默认 workdir */
  path?: string;
  /** 显式语言；省略时按扩展名推断 */
  lang?: string;
  /** 目录模式下的文件 glob；不含 / 时只匹配文件名 */
  include?: string;
}

export interface SourceTarget {
  /** 绝对路径 */
  absolute: string;
  /** 输出用路径（workdir 内为相对路径） */
  display: string;
  lang: string;
}

export interface TargetCollection {
  targets: SourceTarget[];
  /** 因语言不可用等原因跳过的说明（去重） */
  notes: string[];
}

/** 输出用路径：workdir 内显示相对路径，否则绝对路径 */
export function displayPath(workdir: string, absolute: string): string {
  const relative = path.relative(workdir, absolute);
  return relative === '' ? '.' : relative.startsWith('..') ? absolute : relative;
}

function matchesInclude(relative: string, include: string | undefined): boolean {
  if (include === undefined || include === '') return true;
  const subject = include.includes('/') ? relative : path.basename(relative);
  return path.matchesGlob(subject, include);
}

async function walk(root: string, visit: (file: string) => void): Promise<void> {
  let visited = 0;
  const pending = [root];
  while (pending.length > 0) {
    const dir = pending.pop()!;
    const entries = await readdir(dir, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    // 逆序压栈，使出栈顺序保持字典序
    for (const entry of entries.reverse()) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (SKIPPED_DIRECTORIES[entry.name] !== true) pending.push(full);
      } else if (entry.isFile()) {
        visited += 1;
        if (visited > MAX_WALK_FILES) {
          throw new Error(
            `directory has more than ${MAX_WALK_FILES} files; narrow path or include`,
          );
        }
        visit(full);
      }
      // 符号链接一律不跟随，避免逃出工作区
    }
  }
}

/**
 * 解析 path / lang / include，得到待处理文件列表（按路径排序）。
 * 单文件模式要求能确定语言；目录模式跳过无法确定语言或语言不可用的文件。
 */
export async function collectTargets(
  workdir: string,
  query: TargetQuery,
): Promise<TargetCollection> {
  const root = resolveWorkspacePath(workdir, query.path ?? '.');
  if (query.lang !== undefined) assertLanguageUsable(query.lang);
  const info = await stat(root).catch(() => undefined);
  if (!info) throw new Error(`path not found: ${displayPath(workdir, root)}`);

  if (info.isFile()) {
    const lang = query.lang ?? languageForFile(root);
    if (lang === undefined) {
      throw new Error(
        `cannot infer the language of ${displayPath(workdir, root)} from its extension; pass lang`,
      );
    }
    assertLanguageUsable(lang);
    return {
      targets: [{ absolute: root, display: displayPath(workdir, root), lang }],
      notes: [],
    };
  }
  if (!info.isDirectory()) throw new Error(`not a file or directory: ${displayPath(workdir, root)}`);

  const targets: SourceTarget[] = [];
  const notes = new Set<string>();
  const languages = ensureLanguagesRegistered();
  await walk(root, (file) => {
    const lang = languageForFile(file);
    if (lang === undefined) return;
    if (query.lang !== undefined && lang !== query.lang) return;
    if (!matchesInclude(path.relative(root, file), query.include)) return;
    const failure = languages.failures.get(lang);
    if (failure !== undefined) {
      notes.add(`skipped ${lang} files: ${failure}`);
      return;
    }
    targets.push({ absolute: file, display: displayPath(workdir, file), lang });
  });
  return { targets, notes: [...notes] };
}

/** 读取源文件；超过 1 MiB 或含 NUL（二进制）返回 undefined */
export async function readSource(file: string): Promise<string | undefined> {
  const info = await stat(file);
  if (info.size > MAX_FILE_BYTES) return undefined;
  const text = await readFile(file, 'utf8');
  return text.includes('\0') ? undefined : text;
}

/** 在一段源码中查找全部匹配节点 */
export function findMatches(lang: string, source: string, pattern: string): SgNode[] {
  return parse(lang, source).root().findAll(pattern);
}

export interface AstGrepArgs extends TargetQuery {
  pattern: string;
  limit?: number;
}

const DEFAULT_LIMIT = 100;

export async function runAstGrep(workdir: string, args: AstGrepArgs): Promise<string> {
  if (args.pattern.trim() === '') throw new Error('pattern must be a non-empty string');
  const limit = args.limit ?? DEFAULT_LIMIT;
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
    throw new Error('limit must be an integer between 1 and 500');
  }
  const { targets, notes } = await collectTargets(workdir, args);

  const sections: string[] = [];
  let total = 0;
  let files = 0;
  let truncated = false;
  for (const target of targets) {
    const source = await readSource(target.absolute);
    if (source === undefined) continue;
    const matches = findMatches(target.lang, source, args.pattern);
    if (matches.length === 0) continue;
    const room = limit - total;
    if (room === 0) {
      // limit 已用满且后续文件仍有匹配
      truncated = true;
      break;
    }
    const shown = matches.slice(0, room);
    total += shown.length;
    files += 1;
    const lines = shown.map((node) => {
      const { line, column } = node.range().start;
      const firstLine = node.text().split('\n', 1)[0] ?? '';
      return `${line + 1}:${column + 1}  ${capText(firstLine, 200)}`;
    });
    sections.push(
      [`== ${target.display} (${shown.length} match${shown.length === 1 ? '' : 'es'})`, ...lines].join(
        '\n',
      ),
    );
    if (matches.length > room) {
      truncated = true;
      break;
    }
  }

  const noteLines = notes.map((note) => `[${note}]`);
  if (total === 0) return ['No matches.', ...noteLines].join('\n');
  const summary = `Total: ${total} matches in ${files} files${truncated ? ' (truncated at limit)' : ''}`;
  return [...sections, '', summary, ...noteLines].join('\n');
}
