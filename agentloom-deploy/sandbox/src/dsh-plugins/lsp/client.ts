/**
 * 最小 LSP 客户端：经 ctx.subprocess 启动语言服务器，用 vscode-jsonrpc 在其
 * stdin/stdout 上收发 JSON-RPC；负责 initialize 握手、全量文档同步与诊断缓存。
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { SubprocessHandle, SubprocessRuntime } from '@deepseek-ai/dsh-subprocess';
import {
  CancellationTokenSource,
  createMessageConnection,
  ErrorCodes,
  type MessageConnection,
  ResponseError,
  StreamMessageReader,
  StreamMessageWriter,
} from 'vscode-jsonrpc/node';
import type {
  Diagnostic,
  InitializeParams,
  InitializeResult,
  PublishDiagnosticsParams,
  ServerCapabilities,
} from 'vscode-languageserver-protocol';

/** 启动 + initialize 握手的上限 */
const START_TIMEOUT_MS = 15_000;
/** stderr 只保留尾部，供启动失败时诊断 */
const STDERR_TAIL_BYTES = 16_384;

export interface LspClientStartOptions {
  subprocess: SubprocessRuntime;
  serverId: string;
  bin: string;
  args: readonly string[];
  root: string;
  /** 进程退出（非 dispose 主动关闭时 reason 非空） */
  onExit: (reason?: string) => void;
}

interface DiagnosticsEntry {
  seq: number;
  diagnostics: Diagnostic[];
}

/** 把 server 返回的 file URI 归一化（编码差异），供缓存键使用 */
export function normalizeUri(uri: string): string {
  try {
    return pathToFileURL(fileURLToPath(uri)).href;
  } catch {
    return uri;
  }
}

export function fileUri(file: string): string {
  return pathToFileURL(file).href;
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  const { promise: settled, resolve, reject } = Promise.withResolvers<T>();
  const timer = setTimeout(() => reject(new Error(message)), ms);
  timer.unref();
  promise.then(resolve, reject).finally(() => clearTimeout(timer));
  return settled;
}

export class LspClient {
  /** initialize 返回的 server 能力 */
  capabilities: ServerCapabilities = {};
  private readonly documents = new Map<string, { version: number; languageId: string }>();
  private readonly diagnostics = new Map<string, DiagnosticsEntry>();
  private readonly diagnosticsListeners = new Set<() => void>();
  private diagnosticsSeq = 0;
  private exited = false;
  private closing = false;

  private constructor(
    readonly serverId: string,
    readonly root: string,
    private readonly handle: SubprocessHandle,
    private readonly connection: MessageConnection,
  ) {}

  static async start(options: LspClientStartOptions): Promise<LspClient> {
    const handle = options.subprocess.spawn({
      argv: [options.bin, ...options.args],
      cwd: options.root,
      stdio: { stdin: 'pipe', stdout: 'pipe', stderr: { maxBytes: STDERR_TAIL_BYTES } },
      graceMs: 2000,
    });
    if (!handle.stdin || !handle.stdout) {
      handle.terminate();
      throw new Error(`${options.serverId}: language server stdio pipes are unavailable`);
    }
    // 进程退出后写入会 EPIPE；错误经 done/连接关闭路径处理
    handle.stdin.on('error', () => {});
    const connection = createMessageConnection(
      new StreamMessageReader(handle.stdout),
      new StreamMessageWriter(handle.stdin),
    );
    const client = new LspClient(options.serverId, options.root, handle, connection);
    client.wire();

    let exitReason: string | undefined;
    const exited = handle.done.then(
      (outcome) => {
        exitReason = `exit code ${outcome.exitCode ?? 'null'}, signal ${outcome.signal ?? 'none'}`;
      },
      (error: unknown) => {
        exitReason = error instanceof Error ? error.message : String(error);
      },
    );
    void exited.then(() => {
      client.exited = true;
      client.connection.dispose();
      client.notifyDiagnostics();
      options.onExit(client.closing ? undefined : `${exitReason}${client.stderrTail()}`);
    });

    const rootUri = fileUri(options.root);
    const params: InitializeParams = {
      processId: process.pid,
      rootUri,
      rootPath: options.root,
      workspaceFolders: [{ uri: rootUri, name: path.basename(options.root) || options.root }],
      capabilities: {
        textDocument: {
          synchronization: { didSave: false, dynamicRegistration: false },
          publishDiagnostics: { relatedInformation: true },
          hover: { contentFormat: ['markdown', 'plaintext'] },
          definition: {},
          references: {},
          rename: { prepareSupport: false },
          codeAction: {
            codeActionLiteralSupport: {
              codeActionKind: { valueSet: ['quickfix', 'refactor', 'source'] },
            },
            resolveSupport: { properties: ['edit'] },
          },
          documentSymbol: { hierarchicalDocumentSymbolSupport: true },
        },
        workspace: {
          symbol: {},
          workspaceEdit: { documentChanges: true },
          applyEdit: false,
          workspaceFolders: true,
          configuration: true,
        },
      },
    };
    try {
      const result = await withTimeout(
        Promise.race([
          connection.sendRequest<InitializeResult>('initialize', params),
          exited.then(() => {
            throw new Error(`process exited during initialize (${exitReason})`);
          }),
        ]),
        START_TIMEOUT_MS,
        `initialize timed out after ${START_TIMEOUT_MS / 1000}s`,
      );
      client.capabilities = result.capabilities ?? {};
      await connection.sendNotification('initialized', {});
      return client;
    } catch (error) {
      client.closing = true;
      handle.terminate();
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`${options.serverId} failed to start: ${message}${client.stderrTail()}`);
    }
  }

  get alive(): boolean {
    return !this.exited;
  }

  /** 首次 didOpen，之后每次以全量文本 didChange（version 递增）；返回 uri 与文本 */
  async syncDocument(file: string, languageId: string): Promise<{ uri: string; text: string }> {
    this.assertAlive();
    const text = await fs.readFile(file, 'utf8');
    const uri = fileUri(file);
    const doc = this.documents.get(uri);
    if (!doc) {
      this.documents.set(uri, { version: 1, languageId });
      await this.connection.sendNotification('textDocument/didOpen', {
        textDocument: { uri, languageId, version: 1, text },
      });
    } else {
      doc.version += 1;
      await this.connection.sendNotification('textDocument/didChange', {
        textDocument: { uri, version: doc.version },
        contentChanges: [{ text }],
      });
    }
    return { uri, text };
  }

  /** 已打开的文档在磁盘被改写后推送新内容；未打开则忽略 */
  async refreshIfOpen(file: string): Promise<void> {
    const doc = this.documents.get(fileUri(file));
    if (doc && this.alive) await this.syncDocument(file, doc.languageId);
  }

  /** 当前诊断序号；配合 waitForDiagnostics 判断是否收到了新一轮 publish */
  currentDiagnosticsSeq(): number {
    return this.diagnosticsSeq;
  }

  latestDiagnostics(uri: string): Diagnostic[] | undefined {
    return this.diagnostics.get(normalizeUri(uri))?.diagnostics;
  }

  /** 等待 uri 在 afterSeq 之后收到一次 publishDiagnostics；超时/中止/进程退出返回 false */
  waitForDiagnostics(
    uri: string,
    afterSeq: number,
    timeoutMs: number,
    signal?: AbortSignal,
  ): Promise<boolean> {
    const key = normalizeUri(uri);
    const fresh = () => (this.diagnostics.get(key)?.seq ?? 0) > afterSeq;
    if (fresh()) return Promise.resolve(true);
    const { promise, resolve } = Promise.withResolvers<boolean>();
    const finish = (value: boolean) => {
      clearTimeout(timer);
      this.diagnosticsListeners.delete(listener);
      signal?.removeEventListener('abort', onAbort);
      resolve(value);
    };
    const listener = () => {
      if (fresh()) finish(true);
      else if (this.exited) finish(false);
    };
    const onAbort = () => finish(false);
    const timer = setTimeout(() => finish(false), timeoutMs);
    timer.unref();
    this.diagnosticsListeners.add(listener);
    signal?.addEventListener('abort', onAbort, { once: true });
    if (signal?.aborted) finish(false);
    return promise;
  }

  /** 发送请求；超时或中止时发 $/cancelRequest 并抛错 */
  async request<R>(
    method: string,
    params: unknown,
    timeoutMs: number,
    signal?: AbortSignal,
  ): Promise<R> {
    this.assertAlive();
    const source = new CancellationTokenSource();
    const onAbort = () => source.cancel();
    signal?.addEventListener('abort', onAbort, { once: true });
    try {
      return await withTimeout(
        this.connection.sendRequest<R>(method, params, source.token),
        timeoutMs,
        `${this.serverId}: ${method} timed out after ${Math.round(timeoutMs / 1000)}s`,
      );
    } catch (error) {
      source.cancel();
      if (signal?.aborted) throw new Error(`${method} aborted`);
      if (error instanceof ResponseError) {
        throw new Error(`${this.serverId}: ${method} failed: ${error.message}`);
      }
      throw error;
    } finally {
      signal?.removeEventListener('abort', onAbort);
      source.dispose();
    }
  }

  /** shutdown → exit，2 秒内未退出则终止进程 */
  async dispose(): Promise<void> {
    if (this.closing) return;
    this.closing = true;
    if (!this.exited) {
      try {
        await this.request('shutdown', null, 2000);
        await this.connection.sendNotification('exit');
      } catch {
        // server 无响应时直接终止
      }
      const timer = setTimeout(() => this.handle.terminate(), 2000);
      timer.unref();
      await this.handle.done.catch(() => undefined);
      clearTimeout(timer);
    }
    this.connection.dispose();
  }

  private assertAlive(): void {
    if (this.exited) throw new Error(`${this.serverId} language server is not running`);
  }

  private stderrTail(): string {
    const tail = this.handle.collected.stderr?.readFrom(0).text.trim();
    return tail ? `\nstderr: ${tail.slice(-2000)}` : '';
  }

  private notifyDiagnostics(): void {
    for (const listener of [...this.diagnosticsListeners]) listener();
  }

  private wire(): void {
    const { connection } = this;
    connection.onNotification(
      'textDocument/publishDiagnostics',
      (params: PublishDiagnosticsParams) => {
        this.diagnosticsSeq += 1;
        this.diagnostics.set(normalizeUri(params.uri), {
          seq: this.diagnosticsSeq,
          diagnostics: params.diagnostics,
        });
        this.notifyDiagnostics();
      },
    );
    // server → client 请求：只回应握手期常见的几种，其余 MethodNotFound
    connection.onRequest((method, params) => {
      switch (method) {
        case 'workspace/configuration': {
          const items = (params as { items?: unknown[] } | undefined)?.items ?? [];
          return items.map(() => null);
        }
        case 'workspace/workspaceFolders':
          return [{ uri: fileUri(this.root), name: path.basename(this.root) || this.root }];
        case 'client/registerCapability':
        case 'client/unregisterCapability':
        case 'window/workDoneProgress/create':
        case 'window/showMessageRequest':
          return null;
        case 'workspace/applyEdit':
          return { applied: false, failureReason: 'client applies edits itself' };
        default:
          return new ResponseError(ErrorCodes.MethodNotFound, `unsupported request ${method}`);
      }
    });
    connection.onUnhandledNotification(() => {});
    connection.onError(() => {});
    connection.listen();
  }
}
