/**
 * agentloom-bridge 的核心：会话生命周期、远程工具 / PTY 工具注册、原生工具策略、
 * 审批应答与事件转发。只依赖 {@link BridgeHost} 抽象，cordis 插件入口（index.ts）
 * 负责把真实 Context 适配成 host，测试用假 host。
 */
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { chmodSync, existsSync, unlinkSync } from 'node:fs';
import { createServer, type Socket } from 'node:net';
import path from 'node:path';
import type { AgentCancelCause, AssistantStreamFrame } from '@deepseek-ai/dsh-agent';
import { createUserMessage, type UserMessage } from '@deepseek-ai/dsh-llm';
import {
  JsonRpcLineTransport,
  type JsonRpcTransportPeer,
} from '@deepseek-ai/dsh-sdk-protocol';
import type { SessionEvent } from '@deepseek-ai/dsh-session';
import type { ToolDefinition, ToolGuard, ToolRunContext } from '@deepseek-ai/dsh-tools';
import type { ApprovalOutcome } from '@deepseek-ai/dsh-user-approval';
import {
  BRIDGE_EVENT_NOTIFICATION,
  type BridgeEventNotification,
  type BridgeInitializeParams,
  type BridgeMethod,
  type BridgeRequestMap,
  type NativeToolPolicy,
  type RuntimePluginEntry,
} from '../dsh/bridge-protocol.js';
import { PTYManager } from '../pty/pty-manager.js';
import type { PTYEvent } from '../pty/types.js';
import {
  formatToolTextResult,
  invokeRemoteTool,
  normalizeRemoteToolParameters,
} from '../remote-tools.js';
import type { RemoteToolExecutionConfig, SandboxAgentEvent } from '../types.js';
import {
  mapAssistantFrame,
  mapSessionEvent,
  type ToolResultOverride,
} from './event-mapper.js';
import type { InactiveEntry } from './loader-audit.js';

/** 审批等待上限，超时视为拒绝（与 server 侧工具授权超时一致） */
export const APPROVAL_TIMEOUT_MS = 30_000;
export const NATIVE_TOOL_DISABLED_MESSAGE = '该工具已被 Agent 原生工具策略禁用';
const INACTIVE_REASON_MAX_CHARS = 2048;

const WORKSPACE_ROOT = path.resolve('/workspace');

/** bridge 需要的 Agent 能力子集（dsh-agent Agent 的结构子集） */
export interface BridgeAgent {
  followup(message: UserMessage): void;
  inject(message: UserMessage): void;
  cancel(cause: AgentCancelCause): void;
}

export interface BridgeAgentHandle {
  agent: BridgeAgent;
  dispose(): Promise<void>;
}

export interface BridgeHost {
  /** 等待 Loader 把整棵插件树挂载完成 */
  awaitLoader(): Promise<void>;
  /** 校验 provider/model 路由可用（凭据缺失等会在此抛错） */
  resolveCallConfig(provider: string, model: string): Promise<void>;
  /** Loader 中给定 id 的条目里未激活者（禁用的条目不算），以及未激活的原因 */
  inactiveEntries(ids: readonly string[]): Promise<InactiveEntry[]>;
  createAgent(options: {
    sessionId: string;
    cwd: string;
    provider: string;
    model: string;
  }): Promise<BridgeAgentHandle>;
  registerTool(definition: ToolDefinition): () => void;
  guardTools(guard: ToolGuard): () => void;
  /** 销毁整棵 Context 并退出 dsh 进程 */
  shutdownProcess(): void;
}

export interface ApprovalRequest {
  sessionId: string;
  toolName: string;
  callId?: string;
  reason?: string;
  signal?: AbortSignal;
}

interface PendingApproval {
  settle(outcome: ApprovalOutcome): void;
}

/**
 * 原生工具策略 → 需要拒绝的 dsh 工具名。dsh 内置名：dsh-tool-fs
 * (read/write/edit/read_image)、dsh-tool-fs-search (glob/grep)、dsh-tool-bash (bash)、
 * dsh-tool-str-replace-editor (str_replace_editor)；PTY 工具随终端策略一起禁用。
 */
export function buildDeniedNativeTools(policy?: NativeToolPolicy): Set<string> {
  const denied = new Set<string>();
  if (policy?.readEnabled === false) {
    for (const name of ['read', 'read_image', 'glob', 'grep']) denied.add(name);
  }
  if (policy?.writeEnabled === false) {
    denied.add('write');
  }
  if (policy?.editEnabled === false) {
    for (const name of ['edit', 'str_replace_editor']) denied.add(name);
  }
  if (policy?.terminalEnabled === false) {
    for (const name of [
      'bash',
      'pty_spawn',
      'pty_write',
      'pty_read',
      'pty_list',
      'pty_kill',
    ]) {
      denied.add(name);
    }
  }
  return denied;
}

export class AgentLoomBridge {
  private readonly sessions = new Map<string, BridgeAgentHandle>();
  private readonly peers = new Set<JsonRpcTransportPeer>();
  private readonly toolNames = new Map<string, string>();
  private readonly resultOverrides = new Map<string, ToolResultOverride>();
  private readonly pendingApprovals = new Map<string, PendingApproval>();
  private readonly disposers: Array<() => void> = [];
  private readonly ptyManager: PTYManager;
  private remoteToolNames = new Set<string>();
  private route: { cwd: string; provider: string; model: string } | null = null;

  constructor(
    private readonly host: BridgeHost,
    private readonly workdir: string,
    createPtyManager: (onEvent: (event: PTYEvent) => void) => PTYManager = (
      onEvent,
    ) => new PTYManager({}, onEvent),
  ) {
    this.ptyManager = createPtyManager((event) => this.handlePtyEvent(event));
    this.registerPtyTools();
  }

  /**
   * 接入一个 guest 连接：请求由 bridge 应答，事件通知广播给所有连接。
   * 最后一个连接断开（guest 进程退出或已销毁会话）时退出 dsh 进程，避免孤儿进程。
   */
  attach(transport: JsonRpcLineTransport): () => void {
    transport.onRequest((method, params) => this.handleRequest(method, params));
    this.peers.add(transport);
    return () => {
      this.peers.delete(transport);
      if (this.peers.size === 0) this.host.shutdownProcess();
    };
  }

  async handleRequest(method: string, params: Record<string, unknown>): Promise<unknown> {
    // 对端是本 guest 进程拉起的可信客户端（0600 socket），参数形态由 bridge-protocol 约定。
    switch (method as BridgeMethod) {
      case 'initialize':
        return this.initialize(params as unknown as BridgeInitializeParams);
      case 'session/create': {
        const { sessionId } = params as BridgeRequestMap['session/create']['params'];
        return this.createSession(sessionId);
      }
      case 'session/prompt': {
        const { sessionId, text } = params as BridgeRequestMap['session/prompt']['params'];
        const message = createUserMessage({
          content: [{ type: 'text', text }],
          source: { kind: 'user' },
        });
        this.requireSession(sessionId).agent.followup(message);
        return { messageId: String(message.id) };
      }
      case 'session/cancel': {
        const { sessionId } = params as BridgeRequestMap['session/cancel']['params'];
        this.requireSession(sessionId).agent.cancel({ kind: 'user' });
        return {};
      }
      case 'session/dispose': {
        const { sessionId } = params as BridgeRequestMap['session/dispose']['params'];
        const handle = this.sessions.get(sessionId);
        if (handle) {
          this.sessions.delete(sessionId);
          await handle.dispose();
        }
        return {};
      }
      case 'permission/resolve': {
        const { callId, allowed } = params as BridgeRequestMap['permission/resolve']['params'];
        const pending = this.pendingApprovals.get(callId);
        pending?.settle(allowed ? 'allowed-once' : 'rejected');
        return { resolved: pending !== undefined };
      }
      case 'pty/list':
        return { sessions: this.ptyManager.list() };
      case 'pty/write': {
        const { sessionId, data } = params as BridgeRequestMap['pty/write']['params'];
        this.ptyManager.write(sessionId, data);
        return {};
      }
      case 'pty/buffer-dump': {
        const { sessionId } = params as BridgeRequestMap['pty/buffer-dump']['params'];
        return {
          content: this.ptyManager.getSession(sessionId)
            ? this.ptyManager.getBufferDump(sessionId)
            : null,
        };
      }
      case 'shutdown':
        // 先让响应写回 guest，再销毁整棵 Context 并退出进程。
        setImmediate(() => this.host.shutdownProcess());
        return {};
      default:
        throw new Error(`unknown agentloom-bridge method: ${method}`);
    }
  }

  handleSessionEvent(sessionId: string, event: SessionEvent): void {
    if (!this.sessions.has(sessionId)) return;
    if (event.type === 'tool/call') {
      this.toolNames.set(String(event.data.callId), event.data.name);
    }
    const mapped = mapSessionEvent(event, {
      toolNameOf: (callId) => this.toolNames.get(callId),
      takeResultOverride: (callId) => {
        const override = this.resultOverrides.get(callId);
        this.resultOverrides.delete(callId);
        return override;
      },
    });
    if (event.type === 'tool/result') {
      this.toolNames.delete(String(event.data.message.toolCallId));
    }
    for (const agentEvent of mapped) this.notify(sessionId, agentEvent);
  }

  handleAssistantFrame(sessionId: string, frame: AssistantStreamFrame): void {
    if (!this.sessions.has(sessionId)) return;
    const mapped = mapAssistantFrame(frame);
    if (mapped) this.notify(sessionId, mapped);
  }

  /**
   * 审批应答者：把 dsh 发起的审批（原生 / MCP / 插件工具）转成
   * awaiting_permission 工具更新发给 AgentLoom，等待 permission/resolve。
   * 远程工具的授权走 server preflight，这里交还给下一个应答者。
   */
  async handleApprovalRequest(
    request: ApprovalRequest,
    next: () => Promise<ApprovalOutcome>,
  ): Promise<ApprovalOutcome> {
    if (this.remoteToolNames.has(request.toolName) || !this.sessions.has(request.sessionId)) {
      return next();
    }
    if (this.peers.size === 0) return 'unavailable';

    const callId = request.callId ?? `approval-${randomUUID()}`;
    if (this.pendingApprovals.has(callId)) return 'unavailable';

    if (request.signal?.aborted) return 'cancelled';

    const { promise, resolve } = Promise.withResolvers<ApprovalOutcome>();
    const onAbort = () => pending.settle('cancelled');
    const timer = setTimeout(() => pending.settle('rejected'), APPROVAL_TIMEOUT_MS);
    const pending: PendingApproval = {
      settle: (outcome) => {
        if (this.pendingApprovals.get(callId) !== pending) return;
        this.pendingApprovals.delete(callId);
        clearTimeout(timer);
        request.signal?.removeEventListener('abort', onAbort);
        resolve(outcome);
      },
    };
    this.pendingApprovals.set(callId, pending);
    request.signal?.addEventListener('abort', onAbort, { once: true });
    this.notify(request.sessionId, {
      type: 'tool_execution_update',
      toolCallId: callId,
      toolName: request.toolName,
      partialResult: {
        status: 'awaiting_permission',
        permissionRequest: {
          description: request.reason ?? `${request.toolName} 请求执行`,
        },
      },
    });
    return promise;
  }

  async dispose(): Promise<void> {
    for (const pending of [...this.pendingApprovals.values()]) pending.settle('cancelled');
    const handles = [...this.sessions.values()];
    this.sessions.clear();
    await Promise.allSettled(handles.map((handle) => handle.dispose()));
    while (this.disposers.length > 0) this.disposers.pop()?.();
    this.ptyManager.cleanup();
  }

  private async initialize(params: BridgeInitializeParams): Promise<Record<string, never>> {
    if (this.route) throw new Error('agentloom-bridge is already initialized');
    await this.host.awaitLoader();
    await this.assertPluginEntriesActive(params.pluginEntries ?? []);
    await this.host.resolveCallConfig(params.provider, params.model);

    const denied = buildDeniedNativeTools(params.nativeToolPolicy);
    if (denied.size > 0) {
      this.disposers.push(
        this.host.guardTools((execution) =>
          denied.has(execution.name) ? NATIVE_TOOL_DISABLED_MESSAGE : undefined,
        ),
      );
    }
    if (params.remoteToolExecution) {
      this.registerRemoteTools(params.remoteToolExecution);
    }
    this.route = { cwd: params.cwd, provider: params.provider, model: params.model };
    return {};
  }

  private async assertPluginEntriesActive(entries: RuntimePluginEntry[]): Promise<void> {
    if (entries.length === 0) return;
    const inactive = await this.host.inactiveEntries(entries.map((entry) => entry.id));
    if (inactive.length === 0) return;
    const pluginOf = new Map(entries.map((entry) => [entry.id, entry.plugin]));
    const lines = inactive.map((entry) => {
      const reason =
        entry.reason.length > INACTIVE_REASON_MAX_CHARS
          ? `${entry.reason.slice(0, INACTIVE_REASON_MAX_CHARS)}…`
          : entry.reason;
      return `- ${pluginOf.get(entry.id) ?? entry.id}（条目 ${entry.id}，模块 ${entry.module}）: ${reason}`;
    });
    throw new Error(`runtime 插件未能加载:\n${lines.join('\n')}`);
  }

  private async createSession(sessionId: string): Promise<Record<string, never>> {
    if (!this.route) throw new Error('agentloom-bridge is not initialized');
    if (this.sessions.has(sessionId)) {
      throw new Error(`agentloom-bridge session already exists: ${sessionId}`);
    }
    const handle = await this.host.createAgent({ sessionId, ...this.route });
    this.sessions.set(sessionId, handle);
    return {};
  }

  private requireSession(sessionId: string): BridgeAgentHandle {
    const handle = this.sessions.get(sessionId);
    if (!handle) throw new Error(`agentloom-bridge session not found: ${sessionId}`);
    return handle;
  }

  private notify(sessionId: string, event: SandboxAgentEvent): void {
    const payload: BridgeEventNotification = { sessionId, event };
    for (const peer of this.peers) peer.notify(BRIDGE_EVENT_NOTIFICATION, payload);
  }

  /** 工具执行所属的 AgentLoom 会话；没有 agent 时（嵌套调用）退回唯一会话 */
  private sessionIdOf(exec: ToolRunContext): string | undefined {
    const agentSessionId = exec.agent ? String(exec.agent.session.id) : undefined;
    return agentSessionId ?? this.sessions.keys().next().value;
  }

  private registerRemoteTools(config: RemoteToolExecutionConfig): void {
    this.remoteToolNames = new Set(config.tools.map((descriptor) => descriptor.name));
    for (const descriptor of config.tools) {
      this.disposers.push(
        this.host.registerTool(
          textTool(
            descriptor.name,
            descriptor.description,
            normalizeRemoteToolParameters(descriptor.parameters),
            async (args, exec) => {
              const toolCallId = String(exec.callId);
              const sessionId = this.sessionIdOf(exec);
              const result = await invokeRemoteTool({
                config,
                toolName: descriptor.name,
                toolCallId,
                input: args,
                signal: exec.signal,
                onUpdate: (update) => {
                  if (!sessionId) return;
                  this.notify(sessionId, {
                    type: 'tool_execution_update',
                    toolCallId,
                    toolName: descriptor.name,
                    partialResult: update,
                  });
                },
              });
              this.resultOverrides.set(toolCallId, { result: result.details });
              return result.text;
            },
          ),
        ),
      );
    }
  }

  private registerPtyTools(): void {
    const manager = this.ptyManager;
    const tools = [
      textTool(
        'pty_spawn',
        'Spawn a new persistent PTY (pseudo-terminal) session for running interactive or long-running processes.',
        {
          type: 'object',
          properties: {
            command: { type: 'string', description: 'Command to execute' },
            args: { type: 'array', items: { type: 'string' }, description: 'Command arguments' },
            cwd: { type: 'string', description: 'Working directory (must be under /workspace/)' },
            env: {
              type: 'object',
              additionalProperties: { type: 'string' },
              description: 'Environment variables',
            },
            title: { type: 'string', description: 'Human-readable session title' },
            notifyOnExit: { type: 'boolean', description: 'Send notification when process exits' },
            cols: { type: 'number', description: 'Terminal columns (default: 120)' },
            rows: { type: 'number', description: 'Terminal rows (default: 40)' },
          },
          required: ['command'],
        },
        (args) => {
          const params = args as Record<string, unknown>;
          return formatToolTextResult(
            manager.spawn({
              command: params.command as string,
              args: params.args as string[] | undefined,
              cwd: resolvePtyCwd(this.workdir, params.cwd as string | undefined),
              env: params.env as Record<string, string> | undefined,
              title: params.title as string | undefined,
              notifyOnExit: params.notifyOnExit as boolean | undefined,
              cols: params.cols as number | undefined,
              rows: params.rows as number | undefined,
            }),
          );
        },
      ),
      textTool(
        'pty_write',
        'Send input data to an active PTY session. Supports text and escape sequences.',
        {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'PTY session ID (pty_XXXXXXXX)' },
            data: {
              type: 'string',
              description: 'Text to write (supports escape sequences like \\n, \\x03)',
            },
          },
          required: ['id', 'data'],
        },
        (args) => {
          const params = args as { id: string; data: string };
          manager.write(params.id, params.data);
          return formatToolTextResult({ status: 'success' });
        },
      ),
      textTool(
        'pty_read',
        'Read output from a PTY session buffer with optional regex filtering and pagination.',
        {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'PTY session ID (pty_XXXXXXXX)' },
            offset: { type: 'number', description: '0-based line offset (default: 0)' },
            limit: { type: 'number', description: 'Max lines to return (default: 500)' },
            pattern: { type: 'string', description: 'Regex pattern to filter lines' },
            ignoreCase: { type: 'boolean', description: 'Case-insensitive pattern matching' },
          },
          required: ['id'],
        },
        (args) => {
          const params = args as {
            id: string;
            offset?: number;
            limit?: number;
            pattern?: string;
            ignoreCase?: boolean;
          };
          return formatToolTextResult(manager.read(params));
        },
      ),
      textTool(
        'pty_list',
        'List all PTY sessions (active and exited) with their status and metadata.',
        { type: 'object', properties: {} },
        () => formatToolTextResult(manager.list()),
      ),
      textTool(
        'pty_kill',
        'Terminate a PTY session. Optionally remove it from the session list.',
        {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'PTY session ID (pty_XXXXXXXX)' },
            signal: { type: 'string', description: 'Signal to send (default: SIGTERM)' },
            cleanup: { type: 'boolean', description: 'Remove session from list after kill' },
          },
          required: ['id'],
        },
        (args) => {
          const params = args as { id: string; signal?: string; cleanup?: boolean };
          manager.kill(params.id, params.signal ?? 'SIGTERM', params.cleanup ?? false);
          return formatToolTextResult({ status: 'success' });
        },
      ),
    ];
    for (const tool of tools) this.disposers.push(this.host.registerTool(tool));
  }

  private handlePtyEvent(event: PTYEvent): void {
    if (event.type === 'pty_error') return;
    for (const sessionId of this.sessions.keys()) this.notify(sessionId, event);

    if (event.type !== 'pty_exit') return;
    const session = this.ptyManager.getSession(event.sessionId);
    if (!session?.notifyOnExit) return;
    const exitInfo =
      event.exitCode !== undefined ? `exit code ${event.exitCode}` : 'unknown exit';
    const text = `PTY session ${event.sessionId} ("${session.title}") exited — ${exitInfo}`;
    // inject 不唤醒 agent：通知在下一个 step 边界进入模型上下文。
    for (const handle of this.sessions.values()) {
      handle.agent.inject(
        createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } }),
      );
    }
  }
}

/** 返回文本结果的工具定义；规范输出值为字符串，渲染为单个 text 块 */
function textTool(
  name: string,
  description: string,
  parameters: Record<string, unknown>,
  run: (args: unknown, exec: ToolRunContext) => string | Promise<string>,
): ToolDefinition {
  return {
    name,
    description,
    parameters,
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: String(value) }],
    },
    execute: async (args, exec) => run(args, exec),
  };
}

function resolvePtyCwd(workdir: string, cwd?: string): string {
  if (!cwd) return workdir;
  const resolved = path.resolve(workdir, cwd);
  if (resolved !== WORKSPACE_ROOT && !resolved.startsWith(`${WORKSPACE_ROOT}${path.sep}`)) {
    throw new Error(`cwd must be under /workspace/ — got: ${resolved}`);
  }
  return resolved;
}

/** 在 unix socket 上提供 bridge 服务（0600），每个连接一个 JSON-RPC 行传输 */
export async function listenBridgeSocket(
  socketPath: string,
  bridge: AgentLoomBridge,
): Promise<{ close(): Promise<void> }> {
  if (existsSync(socketPath)) unlinkSync(socketPath);
  const sockets = new Set<Socket>();
  const server = createServer((socket) => {
    const transport = new JsonRpcLineTransport(socket, socket);
    const detach = bridge.attach(transport);
    sockets.add(socket);
    socket.on('error', () => undefined);
    socket.on('close', () => {
      detach();
      sockets.delete(socket);
      transport.close();
    });
    transport.start();
  });

  server.listen(socketPath);
  await once(server, 'listening');
  chmodSync(socketPath, 0o600);

  return {
    close: async () => {
      const closed = once(server, 'close');
      server.close();
      for (const socket of sockets) socket.destroy();
      await closed;
    },
  };
}
