/**
 * 诊断采集与格式化，以及「写后诊断」：write / edit / str_replace_editor 成功后，
 * 若该文件有可用的语言服务器，把新一轮 error / warning 追加到工具结果末尾。
 */
import path from 'node:path';
import type { Context } from '@deepseek-ai/cordis';
import type { ContentBlock } from '@deepseek-ai/dsh-llm';
import type {} from '@deepseek-ai/dsh-tools';
import type { Diagnostic } from 'vscode-languageserver-protocol';
import { resolveWorkspacePath } from '../shared/workspace-path.js';
import { languageIdFor, type LspServerPool } from './servers.js';

/** 收到第一轮 publish 后再等这么久，吸收分批发布（语法 → 语义）的后续轮次 */
const DIAGNOSTICS_SETTLE_MS = 400;
/** 写后诊断最多等待新一轮诊断的时长（server 已就绪） */
const POST_WRITE_WAIT_MS = 1500;
/** 写操作触发 server 冷启动时的等待上限：microVM 中 tsserver 首轮诊断实测约 5 s */
const POST_WRITE_COLD_WAIT_MS = 10_000;
/** 写后诊断追加的条数上限 */
const POST_WRITE_LIMIT = 20;
/** 改写文件、需要附带诊断的 dsh 文件工具 */
const FILE_WRITE_TOOLS: Record<string, true> = { write: true, edit: true, str_replace_editor: true };

const SEVERITY_NAMES = ['', 'error', 'warning', 'info', 'hint'] as const;

export interface CollectedDiagnostics {
  /** 最新一份诊断；server 从未对该文件发布过时为 undefined */
  diagnostics: Diagnostic[] | undefined;
  /** 是否在等待窗口内收到了新一轮 publishDiagnostics */
  fresh: boolean;
}

/** 工作区内显示相对路径，工作区外显示绝对路径 */
export function displayPath(workdir: string, file: string): string {
  const relative = path.relative(path.resolve(workdir), file);
  if (relative === '') return '.';
  return !relative.startsWith('..') && !path.isAbsolute(relative) ? relative : file;
}

/**
 * 同步文件内容并等待新一轮诊断。文件没有可用 server 时返回 undefined。
 * @param wait 等待新一轮 publish 的上限：server 已就绪用 warmMs，本次需冷启动用 coldMs
 */
export async function collectDiagnostics(
  pool: LspServerPool,
  file: string,
  wait: { warmMs: number; coldMs: number },
  signal?: AbortSignal,
): Promise<(CollectedDiagnostics & { waitedMs: number }) | undefined> {
  const resolved = await pool.resolveForFile(file);
  if (!resolved) return undefined;
  const waitMs = pool.isReady(resolved) ? wait.warmMs : wait.coldMs;
  const client = await pool.acquire(resolved);
  const deadline = Date.now() + waitMs;
  let seq = client.currentDiagnosticsSeq();
  const { uri } = await client.syncDocument(file, languageIdFor(resolved.spec, file));
  const fresh = await client.waitForDiagnostics(uri, seq, waitMs, signal);
  // 有的 server 分多轮发布同一文件的诊断：收到一轮后短暂等待后续轮次
  while (fresh) {
    seq = client.currentDiagnosticsSeq();
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    const more = await client.waitForDiagnostics(
      uri,
      seq,
      Math.min(DIAGNOSTICS_SETTLE_MS, remaining),
      signal,
    );
    if (!more) break;
  }
  return { diagnostics: client.latestDiagnostics(uri), fresh, waitedMs: waitMs };
}

/** 按严重度（error 优先）再按位置排序 */
export function sortDiagnostics(diagnostics: readonly Diagnostic[]): Diagnostic[] {
  return [...diagnostics].sort(
    (a, b) =>
      (a.severity ?? 1) - (b.severity ?? 1) ||
      a.range.start.line - b.range.start.line ||
      a.range.start.character - b.range.start.character,
  );
}

/** `path:line:col severity code message` */
export function formatDiagnostic(display: string, diagnostic: Diagnostic): string {
  const { line, character } = diagnostic.range.start;
  const severity = SEVERITY_NAMES[diagnostic.severity ?? 1] ?? 'error';
  const code = diagnostic.code === undefined ? '' : ` ${String(diagnostic.code)}`;
  const raw = typeof diagnostic.message === 'string' ? diagnostic.message : diagnostic.message.value;
  const message = raw.replace(/\s*\n\s*/g, ' ').trim();
  return `${display}:${line + 1}:${character + 1} ${severity}${code} ${message}`;
}

export function countBySeverity(diagnostics: readonly Diagnostic[]): {
  errors: number;
  warnings: number;
} {
  let errors = 0;
  let warnings = 0;
  for (const diagnostic of diagnostics) {
    const severity = diagnostic.severity ?? 1;
    if (severity === 1) errors += 1;
    else if (severity === 2) warnings += 1;
  }
  return { errors, warnings };
}

/** 从文件工具参数取被改写的路径；str_replace_editor 的 view 不算改写 */
function writtenFile(name: string, args: unknown): string | undefined {
  if (!args || typeof args !== 'object') return undefined;
  const record = args as Record<string, unknown>;
  if (name === 'str_replace_editor') {
    if (record.command === 'view') return undefined;
    return typeof record.path === 'string' ? record.path : undefined;
  }
  return typeof record.file_path === 'string' ? record.file_path : undefined;
}

/** 注册 tools/post-execute 监听：成功的文件改写结果末尾追加 LSP 诊断 */
export function registerWriteDiagnostics(
  ctx: Context,
  pool: LspServerPool,
  workdir: string,
  warn: (message: string) => void,
): void {
  ctx.on('tools/post-execute', async (exec, result, next) => {
    const decision = await next();
    if (decision.kind !== 'accept' || decision.value !== undefined || result.isError) {
      return decision;
    }
    if (FILE_WRITE_TOOLS[exec.name] !== true) return decision;
    const input = writtenFile(exec.name, exec.arguments);
    if (!input) return decision;
    let file: string;
    try {
      file = resolveWorkspacePath(workdir, input);
    } catch {
      return decision;
    }
    try {
      const collected = await collectDiagnostics(
        pool,
        file,
        { warmMs: POST_WRITE_WAIT_MS, coldMs: POST_WRITE_COLD_WAIT_MS },
        exec.signal,
      );
      // 等待窗口内没有新一轮 publish 时，缓存的是上一版本内容的诊断，追加会误导模型
      if (!collected?.fresh) return decision;
      const relevant = sortDiagnostics(
        (collected.diagnostics ?? []).filter((d) => (d.severity ?? 1) <= 2),
      );
      if (relevant.length === 0) return decision;
      const { errors, warnings } = countBySeverity(relevant);
      const display = displayPath(workdir, file);
      const lines = relevant.slice(0, POST_WRITE_LIMIT).map((d) => formatDiagnostic(display, d));
      if (relevant.length > POST_WRITE_LIMIT) {
        lines.push(`… ${relevant.length - POST_WRITE_LIMIT} more (use lsp diagnostics)`);
      }
      const block: ContentBlock = {
        type: 'text',
        text: `\n[lsp diagnostics for ${display}] ${errors} error(s), ${warnings} warning(s):\n${lines.join('\n')}`,
      };
      return { ...decision, content: [...(decision.content ?? result.content), block] };
    } catch (error) {
      // 诊断是附加信息：任何失败都不影响文件工具本身的结果
      warn(`post-write diagnostics for ${input} failed: ${error instanceof Error ? error.message : String(error)}`);
      return decision;
    }
  });
}
