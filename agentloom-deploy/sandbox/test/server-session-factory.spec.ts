import { EventEmitter } from 'node:events';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { createServer, type Server } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import type { ChildProcess, spawn as spawnProcess } from 'node:child_process';
import { JsonRpcLineTransport } from '@deepseek-ai/dsh-sdk-protocol';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createDshSessionFactory, SessionStartError } from '../src/dsh/session-factory.js';
import type { CreateSessionRequest, SandboxAgentEvent } from '../src/types.js';

interface FakeChild extends EventEmitter {
  stdout: PassThrough;
  stderr: PassThrough;
  exitCode: number | null;
  signalCode: NodeJS.Signals | null;
  kill: (signal?: NodeJS.Signals) => boolean;
}

function createFakeChild(): FakeChild {
  const child = new EventEmitter() as FakeChild;
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.exitCode = null;
  child.signalCode = null;
  child.kill = vi.fn((signal?: NodeJS.Signals) => {
    child.signalCode = signal ?? 'SIGTERM';
    setImmediate(() => child.emit('exit', null, child.signalCode));
    return true;
  });
  return child;
}

/** 在 bridge socket 上模拟 agentloom-bridge 的应答 */
function startFakeBridge(
  socketPath: string,
  requests: Array<{ method: string; params: unknown }>,
  initializeError?: string,
): Server {
  const server = createServer((socket) => {
    const transport = new JsonRpcLineTransport(socket, socket);
    transport.onRequest(async (method, params) => {
      requests.push({ method, params });
      switch (method) {
        case 'initialize':
          if (initializeError) throw new Error(initializeError);
          return {};
        case 'session/prompt':
          setTimeout(() => {
            const sessionId = params['sessionId'];
            const events: SandboxAgentEvent[] = [
              { type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: 'hi' } },
              { type: 'agent_end', stopReason: 'end_turn' },
            ];
            transport.notify('event', { sessionId: 'someone-else', event: events[0] });
            for (const event of events) transport.notify('event', { sessionId, event });
          }, 10);
          return { messageId: 'm1' };
        case 'permission/resolve':
          return { resolved: true };
        default:
          return {};
      }
    });
    transport.start();
  });
  server.listen(socketPath);
  return server;
}

const request: CreateSessionRequest = {
  sessionId: 'sess-1',
  settings: { defaultProvider: 'openai', defaultModel: 'gpt-x' },
  models: {
    providers: {
      openai: { api: 'openai-completions', baseUrl: 'https://api.example.com/v1', models: [{ id: 'gpt-x' }] },
    },
  },
  runtimeApiKeys: { openai: 'sk-test' },
  nativeToolPolicy: { terminalEnabled: false },
  remoteToolExecution: {
    sessionId: 'sess-1',
    callbackUrl: 'http://callback.local',
    callbackToken: 'tok',
    tools: [],
  },
};

describe('createDshSessionFactory', () => {
  let sessionRoot: string;
  let servers: Server[];
  const previousRoot = process.env['SANDBOX_SESSION_ROOT'];

  beforeEach(() => {
    sessionRoot = mkdtempSync(join(tmpdir(), 'dsh-factory-'));
    process.env['SANDBOX_SESSION_ROOT'] = sessionRoot;
    process.env['AGENTLOOM_TEST_SECRET_TOKEN'] = 'must-not-leak';
    servers = [];
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    for (const server of servers) server.close();
    vi.restoreAllMocks();
    delete process.env['AGENTLOOM_TEST_SECRET_TOKEN'];
    if (previousRoot === undefined) delete process.env['SANDBOX_SESSION_ROOT'];
    else process.env['SANDBOX_SESSION_ROOT'] = previousRoot;
    rmSync(sessionRoot, { recursive: true, force: true });
  });

  it('应拉起 dsh 子进程、经 bridge 初始化会话，并完成 prompt / 审批 / 中止 / 销毁', async () => {
    const requests: Array<{ method: string; params: unknown }> = [];
    const child = createFakeChild();
    const spawn = vi.fn(() => {
      servers.push(startFakeBridge(join(sessionRoot, 'sess-1', 'bridge.sock'), requests));
      return child as unknown as ChildProcess;
    });
    const ptyChanges: string[] = [];
    const factory = createDshSessionFactory({
      dshBin: '/opt/dsh/lib/bin.js',
      bridgeEntry: '/opt/bridge/index.js',
      spawn: spawn as unknown as typeof spawnProcess,
      onPtyBridgeChange: (_bridge, state) => ptyChanges.push(state),
    });

    const session = await factory('/workspace', {}, request);

    expect(spawn).toHaveBeenCalledWith(
      process.execPath,
      ['/opt/dsh/lib/bin.js', '--profile', 'agentloom'],
      expect.objectContaining({ cwd: '/workspace', stdio: ['ignore', 'pipe', 'pipe'] }),
    );
    const env = (spawn.mock.calls[0] as unknown as [string, string[], { env: NodeJS.ProcessEnv }])[2].env;
    expect(env['DSH_HOME']).toBe(join(sessionRoot, 'sess-1', 'dsh-home'));
    expect(env['AGENTLOOM_PROVIDER_OPENAI_API_KEY']).toBe('sk-test');
    expect(env['NODE_ENV']).toBe('production');
    expect(env).not.toHaveProperty('AGENTLOOM_TEST_SECRET_TOKEN');
    expect(existsSync(join(sessionRoot, 'sess-1', 'dsh-home', 'profiles', 'agentloom', 'cordis.patch.yml'))).toBe(
      true,
    );
    expect(requests.map((entry) => entry.method)).toEqual(['initialize', 'session/create']);
    expect(requests[0]!.params).toEqual({
      cwd: '/workspace',
      provider: 'openai',
      model: 'gpt-x',
      remoteToolExecution: request.remoteToolExecution,
      nativeToolPolicy: { terminalEnabled: false },
    });
    expect(ptyChanges).toEqual(['opened']);

    const events: SandboxAgentEvent[] = [];
    const unsubscribe = session.subscribe((event) => events.push(event));
    // prompt 只在 agent_end 到达后 resolve（/v1/prompt 依赖这个时机）。
    let eventsWhenSettled = -1;
    await session.prompt('hello').then(() => {
      eventsWhenSettled = events.length;
    });
    expect(eventsWhenSettled).toBe(2);
    expect(events).toEqual([
      { type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: 'hi' } },
      { type: 'agent_end', stopReason: 'end_turn' },
    ]);
    unsubscribe();
    expect(requests.at(-1)).toEqual({ method: 'session/prompt', params: { sessionId: 'sess-1', text: 'hello' } });

    await expect(session.resolvePermission('call-1', true)).resolves.toBe(true);
    expect(requests.at(-1)).toEqual({
      method: 'permission/resolve',
      params: { callId: 'call-1', allowed: true },
    });

    await session.abort();
    expect(requests.at(-1)).toEqual({ method: 'session/cancel', params: { sessionId: 'sess-1' } });

    session.dispose();
    expect(ptyChanges).toEqual(['opened', 'closed']);
    await vi.waitFor(() => expect(existsSync(join(sessionRoot, 'sess-1'))).toBe(false));
    expect(requests.slice(-2).map((entry) => entry.method)).toEqual(['session/dispose', 'shutdown']);
    expect(child.kill).toHaveBeenCalledWith('SIGTERM');
  });

  it('dsh 子进程提前退出时应带 stderr 抛错并清理会话目录', async () => {
    const child = createFakeChild();
    const spawn = vi.fn(() => {
      setImmediate(() => {
        child.stderr.write('plugin tree failed to load: agentloom-bridge\n');
        child.exitCode = 1;
        child.emit('exit', 1, null);
      });
      return child as unknown as ChildProcess;
    });
    const factory = createDshSessionFactory({
      dshBin: '/opt/dsh/lib/bin.js',
      bridgeEntry: '/opt/bridge/index.js',
      spawn: spawn as unknown as typeof spawnProcess,
    });

    await expect(factory('/workspace', {}, request)).rejects.toThrow(
      'dsh 运行时启动失败: plugin tree failed to load: agentloom-bridge',
    );
    expect(existsSync(join(sessionRoot, 'sess-1'))).toBe(false);
  });

  it('bridge socket 超时未就绪时应杀掉子进程', async () => {
    const child = createFakeChild();
    const factory = createDshSessionFactory({
      dshBin: '/opt/dsh/lib/bin.js',
      bridgeEntry: '/opt/bridge/index.js',
      spawn: vi.fn(() => child as unknown as ChildProcess) as unknown as typeof spawnProcess,
      startupTimeoutMs: 150,
    });

    await expect(factory('/workspace', {}, request)).rejects.toThrow('bridge socket 未就绪');
    expect(child.kill).toHaveBeenCalledWith('SIGKILL');
  });

  it('runtime 插件未激活时应以 422 SessionStartError 失败、带上 bridge 的原因，并清理子进程与会话目录', async () => {
    const requests: Array<{ method: string; params: unknown }> = [];
    const child = createFakeChild();
    const reason =
      'runtime 插件未能加载:\n- com.acme.demo（条目 demo，模块 /x/dist/index.js）: 插件激活失败: boom';
    const spawn = vi.fn(() => {
      servers.push(startFakeBridge(join(sessionRoot, 'sess-1', 'bridge.sock'), requests, reason));
      return child as unknown as ChildProcess;
    });
    const factory = createDshSessionFactory({
      dshBin: '/opt/dsh/lib/bin.js',
      bridgeEntry: '/opt/bridge/index.js',
      spawn: spawn as unknown as typeof spawnProcess,
    });

    const error = await factory('/workspace', {}, {
      ...request,
      files: {
        'plugins/com.acme.demo/manifest.json': JSON.stringify({
          id: 'com.acme.demo',
          kind: 'runtime',
          runtime: { dshVersion: '0.2.0-rc.2', patch: 'cordis.patch.yml', entry: 'dist/index.js' },
        }),
        'plugins/com.acme.demo/cordis.patch.yml': '- insert:\n    - id: demo\n      name: ./dist/index.js\n',
        'plugins/com.acme.demo/dist/index.js': 'export function apply() {}\n',
      },
      harness: {
        engine: 'dsh',
        plugins: [
          { nodeId: 'n1', source: 'package', ref: 'rp-1', pluginId: 'com.acme.demo', enabled: true },
        ],
      },
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(SessionStartError);
    expect(error).toMatchObject({ statusCode: 422, message: expect.stringContaining(reason) });
    expect(requests[0]).toMatchObject({
      method: 'initialize',
      params: { pluginEntries: [{ id: 'demo', plugin: 'com.acme.demo' }] },
    });
    expect(child.kill).toHaveBeenCalledWith('SIGKILL');
    expect(existsSync(join(sessionRoot, 'sess-1'))).toBe(false);
  });

  it('缺少 defaultProvider / defaultModel 时应拒绝创建会话', async () => {
    const spawn = vi.fn();
    const factory = createDshSessionFactory({
      dshBin: '/opt/dsh/lib/bin.js',
      bridgeEntry: '/opt/bridge/index.js',
      spawn: spawn as unknown as typeof spawnProcess,
    });

    await expect(factory('/workspace', {}, { ...request, settings: {} })).rejects.toThrow(
      'settings.defaultProvider / settings.defaultModel 必填',
    );
    expect(spawn).not.toHaveBeenCalled();
  });

  it('静态 /config 配置应作为默认值合并到会话请求', async () => {
    const requests: Array<{ method: string; params: unknown }> = [];
    const child = createFakeChild();
    const factory = createDshSessionFactory({
      dshBin: '/opt/dsh/lib/bin.js',
      bridgeEntry: '/opt/bridge/index.js',
      spawn: vi.fn(() => {
        servers.push(startFakeBridge(join(sessionRoot, 'sess-1', 'bridge.sock'), requests));
        return child as unknown as ChildProcess;
      }) as unknown as typeof spawnProcess,
    });

    const session = await factory(
      '/workspace',
      { settings: { defaultProvider: 'openai', defaultModel: 'from-config' }, systemPrompt: 'static prompt' },
      { ...request, settings: undefined },
    );

    expect(requests[0]!.params).toMatchObject({ provider: 'openai', model: 'from-config' });
    session.dispose();
    await vi.waitFor(() => expect(existsSync(join(sessionRoot, 'sess-1'))).toBe(false));
  });
});
