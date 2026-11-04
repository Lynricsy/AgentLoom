/**
 * ast_edit：按 ast-grep 模式批量改写。rewrite 模板中的 $NAME / $$$NAME 用匹配到的
 * 元变量文本展开；默认 dry_run 只预览，dry_run=false 才写盘（受 allowEdits 约束）。
 */
import { randomUUID } from 'node:crypto';
import { rename, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Edit, SgNode } from '@ast-grep/napi';
import { capText } from '../shared/output-cap.js';
import { collectTargets, findMatches, readSource, type TargetQuery } from './search.js';

/** 一次 ast_edit 最多改写的文件数 */
export const MAX_EDIT_FILES = 200;
/** 一次 ast_edit 最多的替换数 */
export const MAX_EDIT_REPLACEMENTS = 2000;
/** dry_run 预览中每个文件展示的替换数 */
const PREVIEW_PER_FILE = 5;

export const AST_EDIT_DISABLED_MESSAGE =
  "ast_edit is disabled by the agent's native tool policy (editEnabled=false)";

export interface AstEditArgs extends TargetQuery {
  pattern: string;
  rewrite: string;
  path: string;
  dry_run?: boolean;
}

interface FileEdit {
  absolute: string;
  display: string;
  original: string;
  updated: string;
  replacements: Array<{ before: string; after: string }>;
}

/** 元变量引用：$$$NAME（多节点）或 $NAME（单节点），名称为大写字母、数字与下划线 */
const METAVARIABLE = /\$\$\$([A-Z_][A-Z0-9_]*)|\$([A-Z_][A-Z0-9_]*)/g;

/** 模式中出现过的元变量名；rewrite 里未在模式中出现的 $NAME 原样保留 */
function patternMetavariables(pattern: string): ReadonlySet<string> {
  const names = new Set<string>();
  for (const match of pattern.matchAll(METAVARIABLE)) names.add(match[1] ?? match[2]!);
  return names;
}

/** 多节点元变量取首节点起点到末节点终点的原文，保留分隔符与空白 */
function multipleMatchText(node: SgNode, name: string, source: string): string {
  const nodes = node.getMultipleMatches(name);
  if (nodes.length === 0) return '';
  return source.slice(nodes[0]!.range().start.index, nodes.at(-1)!.range().end.index);
}

function expandRewrite(
  rewrite: string,
  node: SgNode,
  source: string,
  known: ReadonlySet<string>,
): string {
  return rewrite.replace(METAVARIABLE, (whole, multi: string | undefined, single: string | undefined) => {
    const name = multi ?? single!;
    if (!known.has(name)) return whole;
    if (multi !== undefined) return multipleMatchText(node, name, source);
    return node.getMatch(name)?.text() ?? multipleMatchText(node, name, source);
  });
}

/**
 * 计算单个文件的改写：嵌套匹配只保留最外层（findAll 前序返回，外层在前），
 * 避免重叠编辑互相破坏。
 */
function planFileEdit(
  source: string,
  lang: string,
  pattern: string,
  rewrite: string,
  known: ReadonlySet<string>,
): { updated: string; replacements: FileEdit['replacements'] } | undefined {
  const matches = findMatches(lang, source, pattern);
  if (matches.length === 0) return undefined;
  const edits: Edit[] = [];
  const replacements: FileEdit['replacements'] = [];
  let lastEnd = -1;
  let root: SgNode | undefined;
  for (const node of [...matches].sort(
    (a, b) => a.range().start.index - b.range().start.index || b.range().end.index - a.range().end.index,
  )) {
    const { start, end } = node.range();
    if (start.index < lastEnd) continue;
    lastEnd = end.index;
    const after = expandRewrite(rewrite, node, source, known);
    edits.push(node.replace(after));
    replacements.push({ before: node.text(), after });
    root ??= node.getRoot().root();
  }
  return { updated: root!.commitEdits(edits), replacements };
}

/** 单行预览：取首行并截断到 200 字符，多行内容追加省略号 */
function previewLine(text: string): string {
  const [first = '', ...rest] = text.split('\n');
  return capText(first, 200) + (rest.length > 0 ? ' …' : '');
}

/** 同目录临时文件 + rename 原子写回，保留原文件权限位 */
async function writeAtomically(file: string, content: string): Promise<void> {
  const { mode } = await stat(file);
  const temp = path.join(path.dirname(file), `.${path.basename(file)}.ast_edit-${randomUUID()}.tmp`);
  try {
    await writeFile(temp, content, { mode: mode & 0o7777 });
    await rename(temp, file);
  } catch (error) {
    await unlink(temp).catch(() => undefined);
    throw error;
  }
}

export async function runAstEdit(
  workdir: string,
  allowEdits: boolean,
  args: AstEditArgs,
): Promise<string> {
  if (args.pattern.trim() === '') throw new Error('pattern must be a non-empty string');
  const dryRun = args.dry_run ?? true;
  if (!dryRun && !allowEdits) return AST_EDIT_DISABLED_MESSAGE;

  const { targets, notes } = await collectTargets(workdir, args);
  const known = patternMetavariables(args.pattern);
  const fileEdits: FileEdit[] = [];
  let total = 0;
  for (const target of targets) {
    const source = await readSource(target.absolute);
    if (source === undefined) continue;
    const planned = planFileEdit(source, target.lang, args.pattern, args.rewrite, known);
    if (!planned) continue;
    total += planned.replacements.length;
    fileEdits.push({ ...target, original: source, ...planned });
    if (fileEdits.length > MAX_EDIT_FILES || total > MAX_EDIT_REPLACEMENTS) {
      throw new Error(
        `ast_edit would change more than ${MAX_EDIT_FILES} files or ${MAX_EDIT_REPLACEMENTS} replacements; narrow path or include`,
      );
    }
  }

  const noteLines = notes.map((note) => `[${note}]`);
  if (total === 0) return ['No matches.', ...noteLines].join('\n');

  if (dryRun) {
    const sections = fileEdits.map((edit) => {
      const lines = [`== ${edit.display} (${edit.replacements.length} replacements)`];
      for (const { before, after } of edit.replacements.slice(0, PREVIEW_PER_FILE)) {
        lines.push(`- ${previewLine(before)}`, `+ ${previewLine(after)}`);
      }
      const hidden = edit.replacements.length - PREVIEW_PER_FILE;
      if (hidden > 0) lines.push(`… ${hidden} more`);
      return lines.join('\n');
    });
    return [
      ...sections,
      '',
      `Total: ${total} replacements in ${fileEdits.length} files (dry run, nothing written; re-run with dry_run=false to apply)`,
      ...noteLines,
    ].join('\n');
  }

  for (const edit of fileEdits) {
    if (edit.updated !== edit.original) await writeAtomically(edit.absolute, edit.updated);
  }
  return [`Applied ${total} replacements in ${fileEdits.length} files`, ...noteLines].join('\n');
}
