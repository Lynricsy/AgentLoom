/**
 * eval 的工具回环：127.0.0.1 上的一次性 HTTP 端点，runner.py 的 tool(name, **args)
 * 经它调用 Agent 的其他工具（ctx.tools.execute）。只在某个 eval cell 执行期间受理，
 * 以 Bearer 令牌鉴权，子调用挂在当前 eval 调用下（parent / rootCallId）。
 */
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { once } from 'node:events';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { ToolCallId } from '@deepseek-ai/dsh-llm';
import type {
  ToolExecutionFailure,
  ToolExecutionInput,
  ToolExecutionResult,
  ToolRunContext,
} from '@deepseek-ai/dsh-tools';

/** 请求体上限 */
export const TOOL_BRIDGE_MAX_BODY_BYTES = 1024 * 1024;
/** 单次子工具调用上限 */
export const NESTED_TOOL_TIMEOUT_MS = 300_000;
export const REENTRY_UNSUPPORTED_MESSAGE = 'tool re-entry unsupported by harness';

/** ctx.tools 的结构子集（测试可替换） */
export interface ToolDispatcher {
  execute(input: ToolExecutionInput): Promise<ToolExecutionResult>;
  /** 该名字对此 agent 是否有已注册的工具 */
  get(name: string, scope?: ToolExecutionInput['agent']): unknown;
}

export type ToolBridgeReply = { ok: true; value: unknown } | { ok: false; error: string };

export interface ToolBridgeEndpoint {
  url: string;
  token: string;
}

export class EvalToolBridge {
  private readonly token = randomUUID();
  private server: Server | undefined;
  private endpointPromise: Promise<ToolBridgeEndpoint> | undefined;
  private current: { exec: ToolRunContext; calls: number; cell: AbortController } | undefined;

  constructor(private readonly tools: () => ToolDispatcher) {}

  /** 首次调用时开始监听，返回 runner 需要的地址与令牌 */
  endpoint(): Promise<ToolBridgeEndpoint> {
    this.endpointPromise ??= this.listen();
    return this.endpointPromise;
  }

  /**
   * 在 fn 执行期间把 exec 设为子调用的父调用；结束后端点拒绝请求。cell 结束（含超时
   * 中断、内核终止）时取消仍在运行的子工具调用，避免它们在 eval 已返回后继续写盘。
   */
  async withExecution<T>(exec: ToolRunContext, fn: () => Promise<T>): Promise<T> {
    const cell = new AbortController();
    this.current = { exec, calls: 0, cell };
    try {
      return await fn();
    } finally {
      if (this.current?.cell === cell) this.current = undefined;
      cell.abort(new Error('eval cell finished'));
    }
  }

  async close(): Promise<void> {
    const server = this.server;
    this.server = undefined;
    this.endpointPromise = undefined;
    if (!server) return;
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  /** 以当前 eval 调用为父调用执行子工具 */
  async dispatch(name: string, args: unknown): Promise<ToolBridgeReply> {
    const current = this.current;
    if (!current) return { ok: false, error: 'no eval cell is running' };
    if (name === 'eval') return { ok: false, error: 'eval cannot call itself' };
    const { exec, cell } = current;
    const n = ++current.calls;
    const tools = this.tools();
    const base = {
      rootCallId: exec.rootCallId,
      name,
      arguments: args,
      ...(exec.agent ? { agent: exec.agent } : {}),
      signal: AbortSignal.any([exec.signal, cell.signal, AbortSignal.timeout(NESTED_TOOL_TIMEOUT_MS)]),
    };
    try {
      let result = await tools.execute({
        ...base,
        callId: ToolCallId(`${String(exec.callId)}:eval:${n}`),
        parent: exec.token,
      });
      if (isUnknownTool(result) && tools.get(name, exec.agent) !== undefined) {
        // 工具已注册却被判为未知：harness 拒绝带 parent 的嵌套调用，去掉 parent 再试一次
        result = await tools.execute({ ...base, callId: ToolCallId(`${String(exec.callId)}:eval:${n}:direct`) });
        if (isUnknownTool(result)) return { ok: false, error: REENTRY_UNSUPPORTED_MESSAGE };
      }
      return result.isError ? { ok: false, error: result.error.message } : { ok: true, value: result.value };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  private async listen(): Promise<ToolBridgeEndpoint> {
    const server = createServer((request, response) => {
      void this.handle(request, response);
    });
    this.server = server;
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const { port } = server.address() as AddressInfo;
    return { url: `http://127.0.0.1:${port}/tool`, token: this.token };
  }

  private async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    if (request.method !== 'POST' || request.url !== '/tool') {
      reply(response, 404, { ok: false, error: 'not found' });
      return;
    }
    if (!this.authorized(request.headers.authorization)) {
      reply(response, 401, { ok: false, error: 'unauthorized' });
      return;
    }
    if (!this.current) {
      reply(response, 403, { ok: false, error: 'no eval cell is running' });
      return;
    }
    let body: string;
    try {
      body = await readBody(request);
    } catch {
      reply(response, 413, { ok: false, error: `request body exceeds ${TOOL_BRIDGE_MAX_BODY_BYTES} bytes` });
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch {
      parsed = undefined;
    }
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      !('name' in parsed) ||
      typeof parsed.name !== 'string'
    ) {
      reply(response, 400, { ok: false, error: 'expected JSON body { name, args }' });
      return;
    }
    const args = 'args' in parsed && parsed.args !== undefined ? parsed.args : {};
    reply(response, 200, await this.dispatch(parsed.name, args));
  }

  private authorized(header: string | undefined): boolean {
    const expected = Buffer.from(`Bearer ${this.token}`);
    const actual = Buffer.from(header ?? '');
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }
}

function isUnknownTool(result: ToolExecutionResult): result is ToolExecutionFailure {
  return result.isError && result.error.info?.code === 'UNKNOWN_TOOL';
}

function reply(response: ServerResponse, status: number, body: ToolBridgeReply): void {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
  });
  response.end(payload);
}

async function readBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = chunk as Buffer;
    size += buffer.length;
    // 超限后继续读完（丢弃），以便仍能回 413
    if (size <= TOOL_BRIDGE_MAX_BODY_BYTES) chunks.push(buffer);
  }
  if (size > TOOL_BRIDGE_MAX_BODY_BYTES) throw new Error('body too large');
  return Buffer.concat(chunks).toString('utf8');
}
