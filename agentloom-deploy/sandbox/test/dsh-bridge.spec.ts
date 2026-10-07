import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { connect, type Socket } from 'node:net';
import { once } from 'node:events';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JsonRpcLineTransport } from '@deepseek-ai/dsh-sdk-protocol';
import type { ToolDefinition, ToolGuard } from '@deepseek-ai/dsh-tools';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

vi.mock('node-pty', () => ({ spawn: vi.fn() }));

import {
  AgentLoomBridge,
  APPROVAL_TIMEOUT_MS,
  buildDeniedNativeTools,
  listenBridgeSocket,
  NATIVE_TOOL_DISABLED_MESSAGE,
  type BridgeAgent,
  type BridgeHost,
} from '../src/dsh-bridge/bridge.js';
import type { BridgeEventNotification } from '../src/dsh/bridge-protocol.js';
import { translateEvent } from '../src/event-stream.js';
import type { PTYManager } from '../src/pty/pty-manager.js';
import type { SandboxAgentEvent } from '../src/types.js';

interface FakeHost extends BridgeHost {
  tools: Map<string, ToolDefinition>;
  guards: ToolGuard[];
  agent: BridgeAgent & { followup: Mock; cancel: Mock; inject: Mock };
  createAgentSpy: Mock;
  shutdownSpy: Mock;
  resolveSpy: Mock;
}

function createFakeHost(): FakeHost {
  const tools = new Map<string, ToolDefinition>();
  const guards: ToolGuard[] = [];
  const agent = { followup: vi.fn(), cancel: vi.fn(), inject: vi.fn() };
  const createAgentSpy = vi.fn(async () => ({ agent, dispose: vi.fn(async () => undefined) }));
  const shutdownSpy = vi.fn();
  const resolveSpy = vi.fn(async () => undefined);
  return {
    tools,
    guards,
    agent,
    createAgentSpy,
    shutdownSpy,
    resolveSpy,
    awaitLoader: vi.fn(async () => undefined),
    resolveCallConfig: resolveSpy,
    createAgent: createAgentSpy,
    registerTool: (definition) => {
      tools.set(definition.name, definition);
      return () => tools.delete(definition.name);
    },
    guardTools: (guard) => {
      guards.push(guard);
      return () => undefined;
    },
    shutdownProcess: shutdownSpy,
  };
}

function createFakePtyManager(): PTYManager {
  return {
    list: vi.fn(() => [{ id: 'pty_1' }]),
    getSession: vi.fn(() => null),
    getBufferDump: vi.fn(() => ''),
    write: vi.fn(),
    cleanup: vi.fn(),
  } as unknown as PTYManager;
}

function sessionEvent(type: string, data: Record<string, unknown>) {
  return { type, seq: 1, time: Date.UTC(2026, 9, 7), data } as never;
}

describe('buildDeniedNativeTools', () => {
  it('应按原生工具策略映射到 dsh 工具名', () => {
    expect([...buildDeniedNativeTools(undefined)]).toEqual([]);
    expect([...buildDeniedNativeTools({ readEnabled: false })]).toEqual([
      'read',
      'read_image',
      'glob',
      'grep',
    ]);
    expect([...buildDeniedNativeTools({ writeEnabled: false, editEnabled: false })]).toEqual([
      'write',
      'edit',
      'str_replace_editor',
    ]);
    expect(buildDeniedNativeTools({ terminalEnabled: false })).toEqual(
      new Set(['bash', 'pty_spawn', 'pty_write', 'pty_read', 'pty_list', 'pty_kill']),
    );
  });
});

describe('AgentLoomBridge over unix socket', () => {
  let dir: string;
  let host: FakeHost;
  let bridge: AgentLoomBridge;
  let server: { close(): Promise<void> };
  let socket: Socket;
  let client: JsonRpcLineTransport;
  let notifications: BridgeEventNotification[];

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'dsh-bridge-'));
    host = createFakeHost();
    bridge = new AgentLoomBridge(host, '/workspace', () => createFakePtyManager());
    const socketPath = join(dir, 'bridge.sock');
    server = await listenBridgeSocket(socketPath, bridge);
    expect(statSync(socketPath).mode & 0o777).toBe(0o600);

    socket = connect(socketPath);
    await once(socket, 'connect');
    client = new JsonRpcLineTransport(socket, socket);
    notifications = [];
    client.onNotification((method, params) => {
      if (method === 'event') notifications.push(params as unknown as BridgeEventNotification);
    });
    client.start();
  });

  afterEach(async () => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    socket.destroy();
    await server.close();
    rmSync(dir, { recursive: true, force: true });
  });

  async function initializeAndCreate(extra: Record<string, unknown> = {}): Promise<void> {
    await client.request('initialize', {
      cwd: '/workspace',
      provider: 'openai',
      model: 'gpt-x',
      ...extra,
    });
    await client.request('session/create', { sessionId: 's1' });
  }

  async function flush(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }

  function eventsOf(): SandboxAgentEvent[] {
    return notifications.filter((n) => n.sessionId === 's1').map((n) => n.event);
  }

  it('应注册 PTY 工具，并在 initialize 时注册原生工具守卫与远程工具', async () => {
    expect([...host.tools.keys()]).toEqual(['pty_spawn', 'pty_write', 'pty_read', 'pty_list', 'pty_kill']);

    await initializeAndCreate({
      nativeToolPolicy: { terminalEnabled: false },
      remoteToolExecution: {
        sessionId: 's1',
        callbackUrl: 'http://callback.local/tool',
        callbackToken: 'token',
        tools: [
          {
            name: 'lookup_memory',
            label: 'lookup_memory',
            description: '检索记忆',
            parameters: { type: 'object', properties: { q: { type: 'string' } } },
          },
        ],
      },
    });

    expect(host.resolveSpy).toHaveBeenCalledWith('openai', 'gpt-x');
    expect(host.createAgentSpy).toHaveBeenCalledWith({
      sessionId: 's1',
      cwd: '/workspace',
      provider: 'openai',
      model: 'gpt-x',
    });
    expect(host.guards).toHaveLength(1);
    expect(host.guards[0]!({ name: 'bash' } as never)).toBe(NATIVE_TOOL_DISABLED_MESSAGE);
    expect(host.guards[0]!({ name: 'read' } as never)).toBeUndefined();
    expect(host.tools.get('lookup_memory')).toMatchObject({
      name: 'lookup_memory',
      description: '检索记忆',
      parameters: { type: 'object', properties: { q: { type: 'string' } } },
      output: { schema: { type: 'string' } },
    });
    await expect(client.request('initialize', { cwd: '/', provider: 'p', model: 'm' })).rejects.toThrow(
      'already initialized',
    );
  });

  it('session/prompt / session/cancel 应驱动 dsh Agent', async () => {
    await initializeAndCreate();

    const result = (await client.request('session/prompt', { sessionId: 's1', text: 'hi' })) as {
      messageId: string;
    };
    expect(host.agent.followup).toHaveBeenCalledOnce();
    const message = host.agent.followup.mock.calls[0]![0];
    expect(message).toMatchObject({
      role: 'user',
      content: [{ type: 'text', text: 'hi' }],
      source: { kind: 'user' },
    });
    expect(result.messageId).toBe(String(message.id));

    await client.request('session/cancel', { sessionId: 's1' });
    expect(host.agent.cancel).toHaveBeenCalledWith({ kind: 'user' });

    await expect(client.request('session/prompt', { sessionId: 'nope', text: 'x' })).rejects.toThrow(
      'session not found',
    );
  });

  it('会话事件应转成 harness_trace（排在最前）与 SandboxAgentEvent 通知', async () => {
    await initializeAndCreate();

    bridge.handleSessionEvent(
      's1',
      sessionEvent('tool/call', { turn: 1, step: 2, callId: 'c1', name: 'x', arguments: '{"a":1}' }),
    );
    bridge.handleSessionEvent(
      's1',
      sessionEvent('tool/result', {
        turn: 1,
        step: 2,
        message: { role: 'tool', toolCallId: 'c1', isError: true, content: [{ type: 'text', text: 'boom' }] },
      }),
    );
    bridge.handleSessionEvent(
      's1',
      sessionEvent('turn/end', { turn: 1, reason: { kind: 'error', error: { message: 'quota', code: 'QUOTA' } } }),
    );
    bridge.handleSessionEvent('other-session', sessionEvent('turn/start', { turn: 1 }));
    await flush();

    expect(eventsOf()).toEqual([
      {
        type: 'harness_trace',
        kind: 'tool/call',
        turn: 1,
        step: 2,
        data: { callId: 'c1', name: 'x' },
        timestamp: '2026-10-07T00:00:00.000Z',
      },
      { type: 'tool_execution_start', toolName: 'x', toolCallId: 'c1', args: { a: 1 } },
      {
        type: 'harness_trace',
        kind: 'tool/result',
        turn: 1,
        step: 2,
        data: { callId: 'c1', isError: true },
        timestamp: '2026-10-07T00:00:00.000Z',
      },
      { type: 'tool_execution_end', toolCallId: 'c1', toolName: 'x', result: 'boom', isError: true },
      {
        type: 'harness_trace',
        kind: 'turn/end',
        turn: 1,
        data: { reason: 'error', error: 'quota', code: 'QUOTA' },
        timestamp: '2026-10-07T00:00:00.000Z',
      },
      { type: 'message_end', message: { role: 'assistant', stopReason: 'error', errorMessage: 'quota' } },
      { type: 'turn_end' },
      { type: 'agent_end', stopReason: 'error' },
    ]);
    expect(notifications.some((n) => n.sessionId === 'other-session')).toBe(false);
  });

  it('turn/end 的 completed / aborted 应映射为 end_turn / cancelled', async () => {
    await initializeAndCreate();
    bridge.handleSessionEvent('s1', sessionEvent('turn/end', { turn: 1, reason: { kind: 'completed' } }));
    bridge.handleSessionEvent(
      's1',
      sessionEvent('turn/end', { turn: 2, reason: { kind: 'aborted', reason: { kind: 'user' } } }),
    );
    await flush();

    expect(eventsOf().filter((event) => event.type === 'agent_end')).toEqual([
      { type: 'agent_end', stopReason: 'end_turn' },
      { type: 'agent_end', stopReason: 'cancelled' },
    ]);
  });

  it('助手流帧应只转发可见文本增量', async () => {
    await initializeAndCreate();
    bridge.handleAssistantFrame('s1', { type: 'start' } as never);
    bridge.handleAssistantFrame('s1', { type: 'chunk', chunk: { type: 'reasoning-delta', text: 'hmm' } } as never);
    bridge.handleAssistantFrame('s1', { type: 'chunk', chunk: { type: 'text-delta', text: 'Hi' } } as never);
    bridge.handleAssistantFrame(
      's1',
      { type: 'end', outcome: { kind: 'committed', eventType: 'assistant/message' } } as never,
    );
    await flush();

    expect(eventsOf()).toEqual([
      { type: 'message_start' },
      { type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: 'Hi' } },
      { type: 'message_end', message: { role: 'assistant', stopReason: 'stop' } },
    ]);
  });

  it('远程工具应走 preflight → awaiting_permission → execute，并用结构化结果覆盖 tool_execution_end', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ outcome: 'awaiting_permission', permissionRequest: { description: '请授权' } }),
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ result: { ok: true } })));
    await initializeAndCreate({
      remoteToolExecution: {
        sessionId: 's1',
        callbackUrl: 'http://callback.local/tool',
        callbackToken: 'token',
        tools: [{ name: 'apply_change', label: 'apply_change', description: 'd', parameters: {} }],
      },
    });

    const tool = host.tools.get('apply_change')!;
    const text = await tool.execute(
      { proposal: 1 },
      { callId: 'c9', agent: { session: { id: 's1' } }, signal: new AbortController().signal } as never,
    );
    bridge.handleSessionEvent(
      's1',
      sessionEvent('tool/result', {
        turn: 1,
        step: 1,
        message: { role: 'tool', toolCallId: 'c9', content: [{ type: 'text', text }] },
      }),
    );
    await flush();

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(text).toBe(JSON.stringify({ ok: true }, null, 2));
    expect(tool.output.render({}, text)).toEqual([{ type: 'text', text }]);
    expect(eventsOf()).toContainEqual({
      type: 'tool_execution_update',
      toolCallId: 'c9',
      toolName: 'apply_change',
      partialResult: { status: 'awaiting_permission', permissionRequest: { description: '请授权' } },
    });
    expect(eventsOf()).toContainEqual({
      type: 'tool_execution_end',
      toolCallId: 'c9',
      toolName: undefined,
      result: { ok: true },
      isError: false,
    });
  });

  it('审批请求应发出 awaiting_permission，并由 permission/resolve 决议', async () => {
    await initializeAndCreate({
      remoteToolExecution: {
        sessionId: 's1',
        callbackUrl: 'http://callback.local/tool',
        callbackToken: 'token',
        tools: [{ name: 'remote_tool', label: 'r', description: 'd', parameters: {} }],
      },
    });

    const outcome = bridge.handleApprovalRequest(
      { sessionId: 's1', toolName: 'bash', callId: 'call-7', reason: '执行 rm -rf build' },
      vi.fn(),
    );
    await flush();
    expect(eventsOf()).toContainEqual({
      type: 'tool_execution_update',
      toolCallId: 'call-7',
      toolName: 'bash',
      partialResult: {
        status: 'awaiting_permission',
        permissionRequest: { description: '执行 rm -rf build' },
      },
    });

    await expect(client.request('permission/resolve', { callId: 'call-7', allowed: true })).resolves.toEqual({
      resolved: true,
    });
    await expect(outcome).resolves.toBe('allowed-once');
    await expect(client.request('permission/resolve', { callId: 'call-7', allowed: true })).resolves.toEqual({
      resolved: false,
    });

    // 远程工具的授权走 server preflight，交给下一个应答者。
    const next = vi.fn(async () => 'rejected' as const);
    await expect(
      bridge.handleApprovalRequest({ sessionId: 's1', toolName: 'remote_tool', callId: 'c' }, next),
    ).resolves.toBe('rejected');
    expect(next).toHaveBeenCalledOnce();
  });

  it('审批超时应拒绝，取消信号应返回 cancelled', async () => {
    await initializeAndCreate();
    vi.useFakeTimers();
    const timedOut = bridge.handleApprovalRequest({ sessionId: 's1', toolName: 'bash', callId: 'c1' }, vi.fn());
    await vi.advanceTimersByTimeAsync(APPROVAL_TIMEOUT_MS);
    await expect(timedOut).resolves.toBe('rejected');

    const controller = new AbortController();
    const cancelled = bridge.handleApprovalRequest(
      { sessionId: 's1', toolName: 'bash', callId: 'c2', signal: controller.signal },
      vi.fn(),
    );
    controller.abort();
    await expect(cancelled).resolves.toBe('cancelled');
  });

  it('pty/* 请求应代理到 PTYManager', async () => {
    await expect(client.request('pty/list', {})).resolves.toEqual({ sessions: [{ id: 'pty_1' }] });
    await expect(client.request('pty/buffer-dump', { sessionId: 'pty_x' })).resolves.toEqual({
      content: null,
    });
  });

  it('session/dispose 应释放 Agent 句柄；最后一个连接断开时退出 dsh 进程', async () => {
    await initializeAndCreate();
    await client.request('session/dispose', { sessionId: 's1' });
    const handle = await host.createAgentSpy.mock.results[0]!.value;
    expect(handle.dispose).toHaveBeenCalledOnce();

    socket.destroy();
    await vi.waitFor(() => expect(host.shutdownSpy).toHaveBeenCalled());
  });
});

describe('translateEvent harness_trace', () => {
  it('应原样透传到 SSE 参数', () => {
    expect(
      translateEvent({
        type: 'harness_trace',
        kind: 'step/end',
        turn: 1,
        step: 3,
        data: {},
        timestamp: '2026-10-07T00:00:00.000Z',
      }),
    ).toEqual({
      type: 'harness_trace',
      kind: 'step/end',
      turn: 1,
      step: 3,
      data: {},
      timestamp: '2026-10-07T00:00:00.000Z',
    });
  });
});
