/**
 * dsh 会话工厂：每个 AgentLoom 会话 = 一个 `dsh --profile agentloom` 子进程。
 * guest 进程经 unix socket 连接子进程内的 agentloom-bridge 插件（JSON-RPC 行协议），
 * 把 IAgentSession 的 prompt/abort/subscribe/dispose 映射为 bridge 请求与事件通知。
 */
import { spawn as spawnProcess, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { connect, type Socket } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { JsonRpcLineTransport } from '@deepseek-ai/dsh-sdk-protocol';
import type { SessionFactory, SandboxConfig } from '../acp-adapter.js';
import { prepareSessionConfig } from '../session-config.js';
import { isRecord } from '../type-guards.js';
import type {
  AgentEventListener,
  CreateSessionRequest,
  IAgentSession,
  SandboxAgentEvent,
} from '../types.js';
import {
  BRIDGE_EVENT_NOTIFICATION,
  type BridgeEventNotification,
  type BridgeInitializeParams,
  type BridgeMethod,
  type BridgeRequestMap,
} from './bridge-protocol.js';
import { DSH_PROFILE_NAME, writeDshProfile, type NpmInstaller } from './profile-writer.js';
import type { PTYSessionInfo } from '../pty/types.js';

export const DSH_STARTUP_TIMEOUT_MS = 30_000;
const SOCKET_POLL_INTERVAL_MS = 100;
const SHUTDOWN_REQUEST_TIMEOUT_MS = 1_000;
const KILL_GRACE_MS = 3_000;
const STDERR_TAIL_BYTES = 64 * 1024;
/** guest 进程环境里的凭据类变量不继承给 dsh 子进程（agent 的 bash 能读到子进程环境） */
const SECRET_ENV_PATTERN = /KEY|SECRET|TOKEN|PASSWORD/i;

/** 当前会话 dsh 子进程内 PTYManager 的代理（/v1/pty/* 路由使用） */
export interface PtyBridge {
  list(): Promise<PTYSessionInfo[]>;
  write(sessionId: string, data: string): Promise<void>;
  /** PTY 会话不存在时返回 null */
  bufferDump(sessionId: string): Promise<string | null>;
}

export interface DshSessionFactoryOptions {
  /** @deepseek-ai/dsh/lib/bin.js 的绝对路径 */
  dshBin: string;
  /** dist/dsh-bridge/index.js 的绝对路径 */
  bridgeEntry: string;
  /** 会话的 PTY 代理打开 / 关闭时回调（/v1/pty/* 指向最近打开的那个） */
  onPtyBridgeChange?: (bridge: PtyBridge, state: 'opened' | 'closed') => void;
  /** 测试注入点 */
  spawn?: typeof spawnProcess;
  installNpmPackage?: NpmInstaller;
  startupTimeoutMs?: number;
}

/** 当前 guest 进程环境去掉凭据类变量，再叠加 profile 环境 */
function buildChildEnv(profileEnv: Record<string, string>): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && !SECRET_ENV_PATTERN.test(key)) env[key] = value;
  }
  return { ...env, ...profileEnv, NODE_ENV: 'production' };
}

/** 会话配置合并 /config 下的静态 sandbox 配置（请求优先） */
function resolveEffectiveRequest(
  config: SandboxConfig,
  request: CreateSessionRequest,
): { request: CreateSessionRequest; provider: string; model: string } {
  const settings = { ...(config.settings ?? {}), ...(request.settings ?? {}) };
  const provider = settings['defaultProvider'];
  const model = settings['defaultModel'];
  if (typeof provider !== 'string' || provider.length === 0 || typeof model !== 'string' || model.length === 0) {
    throw new Error('会话缺少模型配置：settings.defaultProvider / settings.defaultModel 必填');
  }
  return {
    request: {
      ...request,
      settings,
      systemPrompt: request.systemPrompt?.trim() ? request.systemPrompt : config.systemPrompt,
      mcpServers: request.mcpServers ?? config.mcpServers,
    },
    provider,
    model,
  };
}

export function createDshSessionFactory(options: DshSessionFactoryOptions): SessionFactory {
  const spawn = options.spawn ?? spawnProcess;
  const startupTimeoutMs = options.startupTimeoutMs ?? DSH_STARTUP_TIMEOUT_MS;

  return async (cwd, config, rawRequest) => {
    const { request, provider, model } = resolveEffectiveRequest(config, rawRequest);
    const sessionId = request.sessionId;
    if (!sessionId) throw new Error('A sessionId is required to start a dsh session');

    const prepared = prepareSessionConfig(request);
    let child: ChildProcess | null = null;
    let socket: Socket | null = null;
    try {
      const profile = await writeDshProfile({
        agentDir: prepared.directory,
        cwd,
        request,
        provider,
        model,
        bridgeEntry: options.bridgeEntry,
        ...(options.installNpmPackage ? { installNpmPackage: options.installNpmPackage } : {}),
      });

      const spawned = spawn(process.execPath, [options.dshBin, '--profile', DSH_PROFILE_NAME], {
        cwd,
        env: buildChildEnv(profile.env),
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      child = spawned;
      const output = captureChildOutput(spawned);

      socket = await waitForBridgeSocket(profile.socketPath, spawned, output, startupTimeoutMs);
      const session = new DshAgentSession(sessionId, spawned, socket, output, prepared.dispose);
      await session.start({
        cwd,
        provider,
        model,
        ...(request.remoteToolExecution
          ? { remoteToolExecution: request.remoteToolExecution }
          : {}),
        ...(request.nativeToolPolicy ? { nativeToolPolicy: request.nativeToolPolicy } : {}),
      });
      options.onPtyBridgeChange?.(session.ptyBridge, 'opened');
      session.onDisposed(() => {
        options.onPtyBridgeChange?.(session.ptyBridge, 'closed');
      });
      return session;
    } catch (error) {
      socket?.destroy();
      if (child && child.exitCode === null) child.kill('SIGKILL');
      prepared.dispose();
      throw error;
    }
  };
}

interface ChildOutput {
  /** stderr / stdout 末尾，用于启动失败与崩溃时的错误信息 */
  tail(): string;
}

function captureChildOutput(child: ChildProcess): ChildOutput {
  let tail = '';
  const forward = (stream: NodeJS.ReadableStream | null, label: string) => {
    let pending = '';
    stream?.setEncoding('utf8');
    stream?.on('data', (chunk: string) => {
      tail = (tail + chunk).slice(-STDERR_TAIL_BYTES);
      pending += chunk;
      const lines = pending.split('\n');
      pending = lines.pop() ?? '';
      for (const line of lines) console.error(`[dsh${label}] ${line}`);
    });
  };
  forward(child.stderr, '');
  forward(child.stdout, ':stdout');
  return { tail: () => tail.trim() };
}

async function waitForBridgeSocket(
  socketPath: string,
  child: ChildProcess,
  output: ChildOutput,
  timeoutMs: number,
): Promise<Socket> {
  const deadline = Date.now() + timeoutMs;
  while (true) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`dsh 运行时启动失败: ${output.tail() || `进程已退出 (${child.exitCode ?? child.signalCode})`}`);
    }
    const socket = await tryConnect(socketPath);
    if (socket) return socket;
    if (Date.now() >= deadline) {
      throw new Error(`dsh 运行时启动失败: ${output.tail() || `${timeoutMs}ms 内 bridge socket 未就绪`}`);
    }
    await delay(SOCKET_POLL_INTERVAL_MS);
  }
}

function tryConnect(socketPath: string): Promise<Socket | null> {
  const { promise, resolve } = Promise.withResolvers<Socket | null>();
  const socket = connect(socketPath);
  socket.once('connect', () => {
    socket.removeAllListeners('error');
    resolve(socket);
  });
  socket.once('error', () => {
    socket.destroy();
    resolve(null);
  });
  return promise;
}

interface TurnWaiter {
  resolve(): void;
  reject(error: Error): void;
}

class DshAgentSession implements IAgentSession {
  private readonly transport: JsonRpcLineTransport;
  private readonly listeners = new Set<AgentEventListener>();
  private readonly turnWaiters = new Set<TurnWaiter>();
  private readonly disposedCallbacks: Array<() => void> = [];
  private disposed = false;
  readonly ptyBridge: PtyBridge;

  constructor(
    private readonly sessionId: string,
    private readonly child: ChildProcess,
    private readonly socket: Socket,
    private readonly output: ChildOutput,
    private readonly disposeConfig: () => void,
  ) {
    this.transport = new JsonRpcLineTransport(socket, socket);
    this.transport.onNotification((method, params) => {
      if (method === BRIDGE_EVENT_NOTIFICATION) this.handleEvent(params);
    });
    socket.on('error', () => undefined);
    child.once('exit', (code, signal) => {
      this.failTurns(
        new Error(`dsh 运行时意外退出 (${code ?? signal}): ${this.output.tail()}`),
      );
    });
    this.ptyBridge = {
      list: async () => (await this.request('pty/list', {})).sessions,
      write: async (ptySessionId, data) => {
        await this.request('pty/write', { sessionId: ptySessionId, data });
      },
      bufferDump: async (ptySessionId) =>
        (await this.request('pty/buffer-dump', { sessionId: ptySessionId })).content,
    };
  }

  async start(params: BridgeInitializeParams): Promise<void> {
    this.transport.start();
    await this.request('initialize', params);
    await this.request('session/create', { sessionId: this.sessionId });
  }

  /** 发送用户消息，并在本轮结束（agent_end 或模型错误）后 resolve */
  async prompt(text: string): Promise<void> {
    const { promise: turnEnded, resolve, reject } = Promise.withResolvers<void>();
    this.turnWaiters.add({ resolve, reject });
    try {
      await this.request('session/prompt', { sessionId: this.sessionId, text });
    } catch (error) {
      this.failTurns(error instanceof Error ? error : new Error(String(error)));
    }
    await turnEnded;
  }

  async abort(): Promise<void> {
    await this.request('session/cancel', { sessionId: this.sessionId });
  }

  async resolvePermission(toolCallId: string, allowed: boolean): Promise<boolean> {
    const { resolved } = await this.request('permission/resolve', {
      callId: toolCallId,
      allowed,
    });
    return resolved;
  }

  subscribe(listener: AgentEventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  onDisposed(callback: () => void): void {
    this.disposedCallbacks.push(callback);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.failTurns(new Error('dsh session disposed'));
    for (const callback of this.disposedCallbacks) callback();
    void this.teardown();
  }

  private async teardown(): Promise<void> {
    const signal = AbortSignal.timeout(SHUTDOWN_REQUEST_TIMEOUT_MS);
    try {
      await this.request('session/dispose', { sessionId: this.sessionId }, signal);
      await this.request('shutdown', {}, signal);
    } catch {
      // bridge 已退出或超时：下面直接终止子进程。
    }
    this.transport.close();
    this.socket.destroy();

    if (this.child.exitCode === null && this.child.signalCode === null) {
      const exited = once(this.child, 'exit');
      this.child.kill('SIGTERM');
      const timer = setTimeout(() => this.child.kill('SIGKILL'), KILL_GRACE_MS);
      await exited;
      clearTimeout(timer);
    }
    this.disposeConfig();
  }

  private request<M extends BridgeMethod>(
    method: M,
    params: BridgeRequestMap[M]['params'],
    signal?: AbortSignal,
  ): Promise<BridgeRequestMap[M]['result']> {
    // bridge 是同一镜像内由本进程拉起的可信对端，结果形态由 bridge-protocol 约定。
    const result = this.transport.request(method, params, signal) as Promise<
      BridgeRequestMap[M]['result']
    >;
    return result;
  }

  private handleEvent(params: Record<string, unknown>): void {
    if (params['sessionId'] !== this.sessionId || !isRecord(params['event'])) return;
    // 通知由 bridge 按 BridgeEventNotification 构造（见 bridge-protocol.ts）。
    const notification = params as unknown as BridgeEventNotification;
    const event: SandboxAgentEvent = notification.event;
    for (const listener of this.listeners) listener(event);
    if (
      event.type === 'agent_end' ||
      (event.type === 'message_end' && event.message?.stopReason === 'error')
    ) {
      for (const waiter of this.turnWaiters) waiter.resolve();
      this.turnWaiters.clear();
    }
  }

  private failTurns(error: Error): void {
    for (const waiter of this.turnWaiters) waiter.reject(error);
    this.turnWaiters.clear();
  }
}
