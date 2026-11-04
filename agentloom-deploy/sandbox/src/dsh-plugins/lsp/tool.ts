/**
 * `lsp` 工具：诊断、跳转定义、引用、hover、符号、重命名与 code action。
 * 所有路径经 resolveWorkspacePath 限制在工作区内；改写类动作（rename /
 * code_actions 带 apply）受 allowEdits（原生工具策略 editEnabled）约束。
 */
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineTool, type ToolDefinition } from '@deepseek-ai/dsh-tools';
import type {
  CodeAction,
  Command,
  Diagnostic,
  DocumentSymbol,
  Hover,
  Location,
  LocationLink,
  MarkedString,
  MarkupContent,
  Position,
  Range,
  SymbolInformation,
  TextEdit,
  WorkspaceEdit,
  WorkspaceSymbol,
} from 'vscode-languageserver-protocol';
import { capText } from '../shared/output-cap.js';
import { resolveWorkspacePath } from '../shared/workspace-path.js';
import type { LspClient } from './client.js';
import {
  collectDiagnostics,
  countBySeverity,
  displayPath,
  formatDiagnostic,
  sortDiagnostics,
} from './diagnostics.js';
import { languageIdFor, LSP_SERVERS, type LspServerPool } from './servers.js';

const ACTIONS = [
  'diagnostics',
  'definition',
  'references',
  'hover',
  'symbols',
  'rename',
  'code_actions',
  'status',
] as const;
type LspAction = (typeof ACTIONS)[number];

const DIAGNOSTICS_LIMIT = 50;
const REFERENCES_LIMIT = 100;
const DEFINITION_LIMIT = 50;
const DOCUMENT_SYMBOLS_LIMIT = 300;
const WORKSPACE_SYMBOLS_LIMIT = 100;
const HOVER_MAX_CHARS = 4000;
const EDIT_PREVIEW_LIMIT = 20;
const LINE_PREVIEW_CHARS = 200;
const OUTPUT_MAX_CHARS = 30_000;

export const LSP_EDITS_DISABLED =
  "lsp apply is disabled by the agent's native tool policy (editEnabled=false)";

const SYMBOL_KINDS = [
  '',
  'file',
  'module',
  'namespace',
  'package',
  'class',
  'method',
  'property',
  'field',
  'constructor',
  'enum',
  'interface',
  'function',
  'variable',
  'constant',
  'string',
  'number',
  'boolean',
  'array',
  'object',
  'key',
  'null',
  'enum-member',
  'struct',
  'event',
  'operator',
  'type-parameter',
] as const;

export interface LspToolOptions {
  pool: LspServerPool;
  workdir: string;
  allowEdits: boolean;
}

interface LspArgs {
  action: LspAction;
  file?: string;
  line?: number;
  column?: number;
  symbol?: string;
  query?: string;
  new_name?: string;
  apply?: boolean;
  timeout?: number;
}

/** 已同步到 server 的目标文件 */
interface OpenTarget {
  file: string;
  display: string;
  client: LspClient;
  uri: string;
  text: string;
}

interface UriRange {
  uri: string;
  range: Range;
}

/** 按 LSP 行分隔符（\r\n、\r、\n）切行 */
function splitLines(text: string): string[] {
  return text.split(/\r\n|\r|\n/);
}

function previewLine(text: string): string {
  return capText(text.trim().replace(/\s*[\r\n]+\s*/g, ' ⏎ '), LINE_PREVIEW_CHARS);
}

function uriToFile(uri: string): string | undefined {
  try {
    return fileURLToPath(uri);
  } catch {
    return undefined;
  }
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 文本中某个 LSP 位置对应的 UTF-16 偏移（越界钳到行尾 / 文末） */
function offsetAt(text: string, lineStarts: readonly number[], position: Position): number {
  if (position.line >= lineStarts.length) return text.length;
  const start = lineStarts[position.line]!;
  const nextStart = lineStarts[position.line + 1];
  let end = nextStart ?? text.length;
  // 行尾的换行符不计入该行
  while (end > start && (text[end - 1] === '\n' || text[end - 1] === '\r')) end -= 1;
  return Math.min(start + position.character, end);
}

function lineStartsOf(text: string): number[] {
  const starts = [0];
  const pattern = /\r\n|\r|\n/g;
  for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
    starts.push(match.index + match[0].length);
  }
  return starts;
}

function hoverToText(hover: Hover | null): string {
  if (!hover) return '';
  const part = (content: MarkupContent | MarkedString): string => {
    if (typeof content === 'string') return content;
    if ('kind' in content) return content.value;
    return `\`\`\`${content.language}\n${content.value}\n\`\`\``;
  };
  const contents = Array.isArray(hover.contents) ? hover.contents : [hover.contents];
  return contents.map(part).filter(Boolean).join('\n\n').trim();
}

function toUriRanges(result: Location | Location[] | LocationLink[] | null | undefined): UriRange[] {
  if (!result) return [];
  const items: Array<Location | LocationLink> = Array.isArray(result) ? result : [result];
  return items.map((item) =>
    'targetUri' in item
      ? { uri: item.targetUri, range: item.targetSelectionRange ?? item.targetRange }
      : { uri: item.uri, range: item.range },
  );
}

function isCommand(item: Command | CodeAction): item is Command {
  return typeof item.command === 'string';
}

export function createLspTool(options: LspToolOptions): ToolDefinition {
  const { pool, workdir, allowEdits } = options;
  const show = (file: string) => displayPath(workdir, file);

  const unavailable = async (file: string): Promise<string> => {
    const ext = path.extname(file) || '(no extension)';
    return `No language server available for ${ext}. Available: ${await pool.availabilitySummary()}`;
  };

  /** 读取多个文件的行文本（只用于展示位置所在行） */
  const lineReader = () => {
    const cache = new Map<string, Promise<string[] | undefined>>();
    return async (uri: string, line: number): Promise<string> => {
      let lines = cache.get(uri);
      if (!lines) {
        const file = uriToFile(uri);
        lines = file
          ? fs.readFile(file, 'utf8').then(splitLines, () => undefined)
          : Promise.resolve(undefined);
        cache.set(uri, lines);
      }
      return (await lines)?.[line] ?? '';
    };
  };

  const formatLocations = async (locations: readonly UriRange[], limit: number): Promise<string[]> => {
    const readLine = lineReader();
    const rows = await Promise.all(
      locations.slice(0, limit).map(async ({ uri, range }) => {
        const file = uriToFile(uri);
        const where = `${file ? show(file) : uri}:${range.start.line + 1}:${range.start.character + 1}`;
        return `${where}  ${previewLine(await readLine(uri, range.start.line))}`;
      }),
    );
    if (locations.length > limit) rows.push(`… ${locations.length - limit} more`);
    return rows;
  };

  /** 解析 file 参数、确认有可用 server，并把文件内容同步给 server */
  const openTarget = async (args: LspArgs): Promise<OpenTarget | string> => {
    if (!args.file) throw new Error(`file is required for action "${args.action}"`);
    const file = resolveWorkspacePath(workdir, args.file);
    const stat = await fs.stat(file).catch(() => undefined);
    if (!stat?.isFile()) throw new Error(`file not found: ${show(file)}`);
    const resolved = await pool.resolveForFile(file);
    if (!resolved) return unavailable(file);
    const client = await pool.acquire(resolved);
    const { uri, text } = await client.syncDocument(file, languageIdFor(resolved.spec, file));
    return { file, display: show(file), client, uri, text };
  };

  /** line/column（1-based）或 symbol 解析为 LSP 位置 */
  const resolvePosition = (target: OpenTarget, args: LspArgs): Position => {
    const lines = splitLines(target.text);
    if (args.symbol) {
      const pattern = /^[\w$]+$/.test(args.symbol)
        ? new RegExp(`(?<![\\w$])${escapeRegExp(args.symbol)}(?![\\w$])`)
        : new RegExp(escapeRegExp(args.symbol));
      const order =
        args.line !== undefined
          ? [args.line - 1, ...lines.keys()].filter((index) => index >= 0 && index < lines.length)
          : [...lines.keys()];
      for (const index of order) {
        const match = pattern.exec(lines[index]!);
        if (match) return { line: index, character: match.index };
      }
      throw new Error(`symbol "${args.symbol}" not found in ${target.display}`);
    }
    if (args.line === undefined) {
      throw new Error(`line (and column) or symbol is required for action "${args.action}"`);
    }
    if (args.line < 1 || args.line > lines.length) {
      throw new Error(`line ${args.line} is out of range (1-${lines.length}) in ${target.display}`);
    }
    const text = lines[args.line - 1]!;
    const character =
      args.column !== undefined
        ? Math.min(Math.max(args.column - 1, 0), text.length)
        : Math.max(text.search(/\S/), 0);
    return { line: args.line - 1, character };
  };

  const diagnosticsAction = async (args: LspArgs, timeoutMs: number, signal: AbortSignal) => {
    if (!args.file) throw new Error('file is required for action "diagnostics"');
    const file = resolveWorkspacePath(workdir, args.file);
    const stat = await fs.stat(file).catch(() => undefined);
    if (!stat?.isFile()) throw new Error(`file not found: ${show(file)}`);
    const waitMs = Math.min(timeoutMs, 5000);
    const collected = await collectDiagnostics(pool, file, waitMs, signal);
    if (!collected) return unavailable(file);
    const display = show(file);
    if (!collected.diagnostics) {
      return `No diagnostics published for ${display} within ${waitMs / 1000}s (the server may still be analyzing; retry).`;
    }
    const sorted = sortDiagnostics(collected.diagnostics);
    const stale = collected.fresh
      ? ''
      : `\n(no new diagnostics within ${waitMs / 1000}s; showing the last published set)`;
    if (sorted.length === 0) return `No diagnostics for ${display}.${stale}`;
    const { errors, warnings } = countBySeverity(sorted);
    const lines = sorted.slice(0, DIAGNOSTICS_LIMIT).map((d) => formatDiagnostic(display, d));
    if (sorted.length > DIAGNOSTICS_LIMIT) lines.push(`… ${sorted.length - DIAGNOSTICS_LIMIT} more`);
    const others = sorted.length - errors - warnings;
    return `${display}: ${errors} error(s), ${warnings} warning(s), ${others} other\n${lines.join('\n')}${stale}`;
  };

  const flattenDocumentSymbols = (
    symbols: ReadonlyArray<DocumentSymbol | SymbolInformation>,
    display: string,
  ): string[] => {
    const rows: string[] = [];
    const visit = (symbol: DocumentSymbol | SymbolInformation, depth: number) => {
      const kind = SYMBOL_KINDS[symbol.kind] ?? 'symbol';
      if ('location' in symbol) {
        const file = uriToFile(symbol.location.uri);
        rows.push(
          `${kind} ${symbol.name}  ${file ? show(file) : symbol.location.uri}:${symbol.location.range.start.line + 1}`,
        );
        return;
      }
      rows.push(
        `${'  '.repeat(depth)}${kind} ${symbol.name}  ${display}:${symbol.selectionRange.start.line + 1}`,
      );
      for (const child of symbol.children ?? []) visit(child, depth + 1);
    };
    for (const symbol of symbols) visit(symbol, 0);
    return rows;
  };

  const workspaceSymbolRows = (symbols: ReadonlyArray<SymbolInformation | WorkspaceSymbol>) =>
    symbols.map((symbol) => {
      const kind = SYMBOL_KINDS[symbol.kind] ?? 'symbol';
      const file = uriToFile(symbol.location.uri);
      const where = file ? show(file) : symbol.location.uri;
      const line = 'range' in symbol.location ? `:${symbol.location.range.start.line + 1}` : '';
      const container = symbol.containerName ? ` (in ${symbol.containerName})` : '';
      return `${kind} ${symbol.name}${container}  ${where}${line}`;
    });

  const symbolsAction = async (args: LspArgs, timeoutMs: number, signal: AbortSignal) => {
    if (args.query !== undefined) {
      let clients: LspClient[];
      if (args.file) {
        const target = await openTarget(args);
        if (typeof target === 'string') return target;
        clients = [target.client];
      } else {
        clients = await pool.runningClients();
        if (clients.length === 0) {
          throw new Error(
            'symbols with query needs file (to choose a language server) unless a server is already running',
          );
        }
      }
      const results = await Promise.all(
        clients.map((client) =>
          client.request<Array<SymbolInformation | WorkspaceSymbol> | null>(
            'workspace/symbol',
            { query: args.query },
            timeoutMs,
            signal,
          ),
        ),
      );
      const rows = workspaceSymbolRows(results.flatMap((result) => result ?? []));
      if (rows.length === 0) return `No workspace symbols match "${args.query}".`;
      const shown = rows.slice(0, WORKSPACE_SYMBOLS_LIMIT);
      if (rows.length > WORKSPACE_SYMBOLS_LIMIT) shown.push(`… ${rows.length - WORKSPACE_SYMBOLS_LIMIT} more`);
      return shown.join('\n');
    }
    const target = await openTarget(args);
    if (typeof target === 'string') return target;
    const result = await target.client.request<Array<DocumentSymbol | SymbolInformation> | null>(
      'textDocument/documentSymbol',
      { textDocument: { uri: target.uri } },
      timeoutMs,
      signal,
    );
    const rows = flattenDocumentSymbols(result ?? [], target.display);
    if (rows.length === 0) return `No symbols in ${target.display}.`;
    const shown = rows.slice(0, DOCUMENT_SYMBOLS_LIMIT);
    if (rows.length > DOCUMENT_SYMBOLS_LIMIT) shown.push(`… ${rows.length - DOCUMENT_SYMBOLS_LIMIT} more`);
    return shown.join('\n');
  };

  /** 预览或应用一个 WorkspaceEdit（仅 TextEdit；资源操作跳过并注明） */
  const handleWorkspaceEdit = async (
    label: string,
    edit: WorkspaceEdit,
    apply: boolean,
    client: LspClient,
  ): Promise<string> => {
    const editsByUri = new Map<string, TextEdit[]>();
    let resourceOps = 0;
    if (edit.documentChanges) {
      for (const change of edit.documentChanges) {
        if (!('textDocument' in change)) {
          resourceOps += 1;
          continue;
        }
        const list = editsByUri.get(change.textDocument.uri) ?? [];
        for (const textEdit of change.edits) {
          if ('newText' in textEdit) list.push(textEdit);
        }
        editsByUri.set(change.textDocument.uri, list);
      }
    } else {
      for (const [uri, edits] of Object.entries(edit.changes ?? {})) {
        editsByUri.set(uri, [...(editsByUri.get(uri) ?? []), ...edits]);
      }
    }
    const skippedNote = resourceOps > 0 ? `\n(skipped ${resourceOps} file create/rename/delete operation(s))` : '';

    const files: Array<{ file: string; display: string; original: string; updated: string; edits: TextEdit[] }> = [];
    for (const [uri, edits] of editsByUri) {
      if (edits.length === 0) continue;
      const raw = uriToFile(uri);
      if (!raw) throw new Error(`${label}: unsupported document URI ${uri}`);
      // 越界文件一律拒绝（预览与应用一致），避免改写工作区外内容
      const file = resolveWorkspacePath(workdir, raw);
      const original = await fs.readFile(file, 'utf8');
      const starts = lineStartsOf(original);
      const ordered = edits
        .map((textEdit) => ({
          textEdit,
          start: offsetAt(original, starts, textEdit.range.start),
          end: offsetAt(original, starts, textEdit.range.end),
        }))
        .sort((a, b) => b.start - a.start || b.end - a.end);
      let updated = original;
      for (const { textEdit, start, end } of ordered) {
        updated = updated.slice(0, start) + textEdit.newText + updated.slice(end);
      }
      files.push({ file, display: show(file), original, updated, edits });
    }
    if (files.length === 0) return `${label}: no text edits returned.${skippedNote}`;

    const total = files.reduce((sum, entry) => sum + entry.edits.length, 0);
    const summary = files.map((entry) => {
      const lines = new Set(entry.edits.map((textEdit) => textEdit.range.start.line));
      return `  ${entry.display}: ${entry.edits.length} edit(s) on ${lines.size} line(s)`;
    });
    const previews: string[] = [];
    for (const entry of files) {
      const lines = splitLines(entry.original);
      const sorted = [...entry.edits].sort(
        (a, b) => a.range.start.line - b.range.start.line || a.range.start.character - b.range.start.character,
      );
      for (const textEdit of sorted) {
        if (previews.length >= EDIT_PREVIEW_LIMIT * 2) break;
        const { start, end } = textEdit.range;
        const where = `${entry.display}:${start.line + 1}:`;
        if (start.line === end.line) {
          const old = lines[start.line] ?? '';
          const next = old.slice(0, start.character) + textEdit.newText + old.slice(end.character);
          previews.push(`${where} - ${previewLine(old)}`, `${where} + ${previewLine(next)}`);
        } else {
          const startsOf = lineStartsOf(entry.original);
          const oldText = entry.original.slice(
            offsetAt(entry.original, startsOf, start),
            offsetAt(entry.original, startsOf, end),
          );
          previews.push(`${where} - ${previewLine(oldText)}`, `${where} + ${previewLine(textEdit.newText)}`);
        }
      }
    }
    const more = total > EDIT_PREVIEW_LIMIT ? `\n… ${total - EDIT_PREVIEW_LIMIT} more edit(s) not shown` : '';

    if (!apply) {
      return `${label} preview (not applied): ${total} edit(s) in ${files.length} file(s)\n${summary.join('\n')}\n${previews.join('\n')}${more}${skippedNote}\nRe-run with apply=true to write these changes.`;
    }
    for (const entry of files) {
      const stat = await fs.stat(entry.file);
      const temp = path.join(path.dirname(entry.file), `.${path.basename(entry.file)}.lsp-${randomUUID()}.tmp`);
      try {
        await fs.writeFile(temp, entry.updated, { mode: stat.mode & 0o7777 });
        await fs.rename(temp, entry.file);
      } catch (error) {
        await fs.rm(temp, { force: true });
        throw error;
      }
      await client.refreshIfOpen(entry.file);
    }
    return `${label} applied: ${total} edit(s) in ${files.length} file(s)\n${summary.join('\n')}\n${previews.join('\n')}${more}${skippedNote}`;
  };

  const renameAction = async (args: LspArgs, timeoutMs: number, signal: AbortSignal) => {
    if (!args.new_name) throw new Error('new_name is required for action "rename"');
    const target = await openTarget(args);
    if (typeof target === 'string') return target;
    const position = resolvePosition(target, args);
    const edit = await target.client.request<WorkspaceEdit | null>(
      'textDocument/rename',
      { textDocument: { uri: target.uri }, position, newName: args.new_name },
      timeoutMs,
      signal,
    );
    if (!edit) return `No rename edits returned for ${target.display}:${position.line + 1}:${position.character + 1}.`;
    return handleWorkspaceEdit('Rename', edit, args.apply === true, target.client);
  };

  const codeActionsAction = async (args: LspArgs, timeoutMs: number, signal: AbortSignal) => {
    const target = await openTarget(args);
    if (typeof target === 'string') return target;
    const position = resolvePosition(target, args);
    const lineText = splitLines(target.text)[position.line] ?? '';
    const range: Range = {
      start: { line: position.line, character: 0 },
      end: { line: position.line, character: lineText.length },
    };
    const diagnostics: Diagnostic[] = (target.client.latestDiagnostics(target.uri) ?? []).filter(
      (d) => d.range.start.line <= position.line && d.range.end.line >= position.line,
    );
    const result = await target.client.request<Array<Command | CodeAction> | null>(
      'textDocument/codeAction',
      { textDocument: { uri: target.uri }, range, context: { diagnostics } },
      timeoutMs,
      signal,
    );
    const provider = target.client.capabilities.codeActionProvider;
    const canResolve = typeof provider === 'object' && provider.resolveProvider === true;
    // Command 跳过；只保留带 edit（或可经 codeAction/resolve 取得 edit）的 CodeAction
    const actions = (result ?? []).filter(
      (item): item is CodeAction =>
        !isCommand(item) && (item.edit !== undefined || (canResolve && item.data !== undefined && !item.command)),
    );
    const where = `${target.display}:${position.line + 1}`;
    if (actions.length === 0) return `No code actions with edits at ${where}.`;
    const listing = actions.map(
      (action, index) =>
        `[${index + 1}] ${action.title}${action.kind ? ` (${action.kind})` : ''}${action.isPreferred ? ' [preferred]' : ''}`,
    );
    let selected: CodeAction | undefined;
    if (args.query) {
      const index = /^\d+$/.test(args.query) ? Number(args.query) - 1 : -1;
      const needle = args.query.toLowerCase();
      selected = actions[index] ?? actions.find((action) => action.title.toLowerCase().includes(needle));
      if (!selected) return `No code action matches "${args.query}" at ${where}:\n${listing.join('\n')}`;
    } else if (args.apply) {
      selected = actions.find((action) => action.isPreferred) ?? actions[0];
    }
    if (!selected) {
      return `Code actions at ${where}:\n${listing.join('\n')}\nRe-run with query=<number or title> to preview one, and apply=true to write it (without query, apply uses the preferred or first action).`;
    }
    if (!selected.edit) {
      selected = await target.client.request<CodeAction>('codeAction/resolve', selected, timeoutMs, signal);
    }
    if (!selected.edit) return `Code action "${selected.title}" returned no workspace edit.`;
    return handleWorkspaceEdit(`Code action "${selected.title}"`, selected.edit, args.apply === true, target.client);
  };

  const statusAction = async () => {
    const binaries = await Promise.all(
      LSP_SERVERS.map(async (spec) => {
        const bin = await pool.resolveBinary(spec, workdir);
        return `  ${spec.id}: ${bin ?? 'missing'} (${Object.keys(spec.languageIds).join(' ')})`;
      }),
    );
    const now = Date.now();
    const running = pool
      .running()
      .map(
        (entry) =>
          `  ${entry.id}  root=${show(entry.root)}  ${entry.state}  up ${Math.round((now - entry.startedAt) / 1000)}s, idle ${Math.round((now - entry.lastUsed) / 1000)}s`,
      );
    return `Language servers:\n${binaries.join('\n')}\nRunning instances:\n${running.length > 0 ? running.join('\n') : '  (none)'}`;
  };

  return defineTool({
    name: 'lsp',
    description:
      'Language-server code intelligence for files in the workspace (TypeScript/JavaScript, Python; Go and Rust when their servers are installed). ' +
      'Actions: diagnostics (errors/warnings for file), definition, references, hover (type/docs), symbols (document outline, or workspace search with query), ' +
      'rename (with new_name), code_actions (quick fixes on a line; query picks one by number or title), status (available/running servers). ' +
      'Positions use 1-based line/column, or symbol to target the first occurrence of a name. rename/code_actions only preview unless apply=true.',
    parameters: {
      action: {
        type: 'string',
        required: true,
        enum: ACTIONS,
        description: 'What to do.',
      },
      file: {
        type: 'string',
        description:
          'Workspace-relative or absolute file path. Required except for status and for symbols with query.',
      },
      line: { type: 'integer', description: '1-based line number.' },
      column: {
        type: 'integer',
        description: '1-based column; defaults to the first non-blank character of line.',
      },
      symbol: {
        type: 'string',
        description: 'Target the first occurrence of this name (on line first when line is given) instead of line/column.',
      },
      query: {
        type: 'string',
        description: 'symbols: workspace symbol search text. code_actions: action number or title substring to preview/apply.',
      },
      new_name: { type: 'string', description: 'New name for rename.' },
      apply: {
        type: 'boolean',
        description: 'rename/code_actions: write the edits to disk (default false = preview only).',
      },
      timeout: { type: 'integer', description: 'Request timeout in seconds (1-120, default 10).' },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    isConcurrencySafe: (args) => args.apply !== true,
    async execute(args, exec) {
      const timeoutMs = Math.min(Math.max(Math.trunc(args.timeout ?? 10), 1), 120) * 1000;
      if (args.apply === true && (args.action === 'rename' || args.action === 'code_actions') && !allowEdits) {
        return LSP_EDITS_DISABLED;
      }
      let text: string;
      switch (args.action) {
        case 'status':
          text = await statusAction();
          break;
        case 'diagnostics':
          text = await diagnosticsAction(args, timeoutMs, exec.signal);
          break;
        case 'definition':
        case 'references':
        case 'hover': {
          const target = await openTarget(args);
          if (typeof target === 'string') {
            text = target;
            break;
          }
          const position = resolvePosition(target, args);
          const at = `${target.display}:${position.line + 1}:${position.character + 1}`;
          const textDocument = { uri: target.uri };
          if (args.action === 'hover') {
            const hover = await target.client.request<Hover | null>(
              'textDocument/hover',
              { textDocument, position },
              timeoutMs,
              exec.signal,
            );
            const content = hoverToText(hover);
            text = content ? capText(content, HOVER_MAX_CHARS) : `No hover information at ${at}.`;
            break;
          }
          const isReferences = args.action === 'references';
          const result = await target.client.request<Location | Location[] | LocationLink[] | null>(
            isReferences ? 'textDocument/references' : 'textDocument/definition',
            isReferences
              ? { textDocument, position, context: { includeDeclaration: true } }
              : { textDocument, position },
            timeoutMs,
            exec.signal,
          );
          const locations = toUriRanges(result);
          if (locations.length === 0) {
            text = `No ${isReferences ? 'references' : 'definition'} found at ${at}.`;
            break;
          }
          const rows = await formatLocations(locations, isReferences ? REFERENCES_LIMIT : DEFINITION_LIMIT);
          text = `${isReferences ? `${locations.length} reference(s)` : 'Definition'} for ${at}:\n${rows.join('\n')}`;
          break;
        }
        case 'symbols':
          text = await symbolsAction(args, timeoutMs, exec.signal);
          break;
        case 'rename':
          text = await renameAction(args, timeoutMs, exec.signal);
          break;
        case 'code_actions':
          text = await codeActionsAction(args, timeoutMs, exec.signal);
          break;
      }
      return capText(text, OUTPUT_MAX_CHARS);
    },
  });
}
