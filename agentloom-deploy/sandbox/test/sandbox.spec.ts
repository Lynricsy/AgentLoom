import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IAgentSession, SandboxAgentEvent, AgentEventListener } from '../src/types.js';

function createMockSession(): IAgentSession & {
  _listeners: AgentEventListener[];
  _emit: (event: SandboxAgentEvent) => void;
} {
  const listeners: AgentEventListener[] = [];
  return {
    _listeners: listeners,
    _emit: (event) => { for (const fn of listeners) fn(event); },
    prompt: vi.fn().mockResolvedValue(undefined),
    abort: vi.fn().mockResolvedValue(undefined),
    subscribe: vi.fn((listener: AgentEventListener) => {
      listeners.push(listener);
      return () => {
        const idx = listeners.indexOf(listener);
        if (idx >= 0) listeners.splice(idx, 1);
      };
    }),
    dispose: vi.fn(),
  };
}

vi.mock('@mariozechner/pi-coding-agent', () => ({}));

vi.mock('../src/acp-adapter.js', async () => {
  const actual = await vi.importActual<typeof import('../src/acp-adapter.js')>('../src/acp-adapter.js');
  return {
    ...actual,
    loadSandboxConfig: vi.fn().mockResolvedValue({
      model: 'test-model',
      systemPrompt: 'test prompt',
    }),
  };
});

import {
  translateEvent,
  wrapEnvelope,
  formatSseMessage,
  requestPermission,
  streamSessionEvents,
} from '../src/event-stream.js';
import { AcpAdapter, type SessionFactory } from '../src/acp-adapter.js';

describe('translateEvent', () => {
  it('should translate message_update with text_delta to text_delta', () => {
    const result = translateEvent({
      type: 'message_update',
      assistantMessageEvent: {
        type: 'text_delta',
        delta: 'hello',
      },
    });
    expect(result).toEqual({ type: 'text_delta', text: 'hello' });
  });

  it('should keep backward compatibility for legacy text content events', () => {
    const result = translateEvent({
      type: 'message_update',
      assistantMessageEvent: {
        type: 'content',
        content: { type: 'text', text: 'legacy hello' },
      },
    });
    expect(result).toEqual({ type: 'text_delta', text: 'legacy hello' });
  });

  it('should return null for message_update without text content', () => {
    expect(translateEvent({ type: 'message_update' })).toBeNull();
  });

  it('should translate tool_execution_start to tool_call_start', () => {
    const result = translateEvent({
      type: 'tool_execution_start',
      toolName: 'bash',
      toolCallId: 'tc-1',
      args: { command: 'ls' },
    });
    expect(result).toEqual({
      type: 'tool_call_start',
      toolName: 'bash',
      toolCallId: 'tc-1',
      input: { command: 'ls' },
    });
  });

  it('should translate tool_execution_update to tool_call_update', () => {
    const result = translateEvent({
      type: 'tool_execution_update',
      toolCallId: 'tc-1',
      toolName: 'bash',
      content: 'output line',
    });
    expect(result).toEqual({
      type: 'tool_call_update',
      toolCallId: 'tc-1',
      toolName: 'bash',
      content: 'output line',
    });
  });

  it('should read tool_execution_update partialResult content blocks', () => {
    const result = translateEvent({
      type: 'tool_execution_update',
      toolCallId: 'tc-1',
      toolName: 'lookup_memory',
      partialResult: {
        content: [{ type: 'text', text: 'partial tool output' }],
      },
    });
    expect(result).toEqual({
      type: 'tool_call_update',
      toolCallId: 'tc-1',
      toolName: 'lookup_memory',
      content: 'partial tool output',
    });
  });

  it('should translate tool_execution_end to tool_call_end', () => {
    const result = translateEvent({
      type: 'tool_execution_end',
      toolCallId: 'tc-1',
      toolName: 'bash',
      result: { exitCode: 0 },
      isError: false,
    });
    expect(result).toEqual({
      type: 'tool_call_end',
      toolCallId: 'tc-1',
      toolName: 'bash',
      result: { exitCode: 0 },
      isError: false,
    });
  });

  it('should translate assistant message_end provider errors to error events', () => {
    const result = translateEvent({
      type: 'message_end',
      message: {
        role: 'assistant',
        stopReason: 'error',
        errorMessage: '403 {"error":{"type":"forbidden","message":"Request not allowed"}}',
      },
    });
    expect(result).toEqual({
      type: 'error',
      code: 'MODEL_PROVIDER_ERROR',
      message: '403 {"error":{"type":"forbidden","message":"Request not allowed"}}',
    });
  });

  it('should translate agent_end to done', () => {
    expect(translateEvent({ type: 'agent_end' })).toEqual({ type: 'done' });
  });

  it('should return null for unhandled event types', () => {
    expect(translateEvent({ type: 'agent_start' })).toBeNull();
    expect(translateEvent({ type: 'turn_start' })).toBeNull();
    expect(translateEvent({ type: 'turn_end' })).toBeNull();
    expect(translateEvent({ type: 'message_start' })).toBeNull();
    expect(translateEvent({ type: 'message_end' })).toBeNull();
  });
});

describe('wrapEnvelope + formatSseMessage', () => {
  it('should wrap params in ACP JSON-RPC 2.0 envelope', () => {
    const envelope = wrapEnvelope({ type: 'text_delta', text: 'hi' });
    expect(envelope).toEqual({
      jsonrpc: '2.0',
      method: 'event',
      params: { type: 'text_delta', text: 'hi' },
    });
  });

  it('should format envelope as SSE data line', () => {
    const envelope = wrapEnvelope({ type: 'done' });
    const message = formatSseMessage(envelope);
    expect(message).toBe(
      `data: ${JSON.stringify({ jsonrpc: '2.0', method: 'event', params: { type: 'done' } })}\n\n`,
    );
  });
});

describe('requestPermission', () => {
  it('should return true when callback responds with allowed: true', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ allowed: true }), { status: 200 }),
    );

    const result = await requestPermission('http://localhost:3000/callback', {
      toolName: 'bash',
      toolCallId: 'tc-1',
      input: {},
      sessionId: 's-1',
    });

    expect(result).toBe(true);
    expect(fetchSpy).toHaveBeenCalledOnce();
    fetchSpy.mockRestore();
  });

  it('should return false when callback responds with allowed: false', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ allowed: false }), { status: 200 }),
    );

    const result = await requestPermission('http://localhost:3000/callback', {
      toolName: 'bash',
      toolCallId: 'tc-1',
      input: {},
      sessionId: 's-1',
    });

    expect(result).toBe(false);
    fetchSpy.mockRestore();
  });

  it('should return false on network error (default deny)', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));

    const result = await requestPermission('http://localhost:3000/callback', {
      toolName: 'bash',
      toolCallId: 'tc-1',
      input: {},
      sessionId: 's-1',
    });

    expect(result).toBe(false);
    fetchSpy.mockRestore();
  });

  it('should return false on non-OK HTTP status', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('error', { status: 500 }),
    );

    const result = await requestPermission('http://localhost:3000/callback', {
      toolName: 'bash',
      toolCallId: 'tc-1',
      input: {},
      sessionId: 's-1',
    });

    expect(result).toBe(false);
    fetchSpy.mockRestore();
  });
});

describe('streamSessionEvents', () => {
  it('should stream text_delta events via SSE', () => {
    const mock = createMockSession();
    const chunks: string[] = [];
    let ended = false;

    streamSessionEvents({
      session: mock,
      sessionId: 'test-session',
      write: (c) => chunks.push(c),
      end: () => { ended = true; },
    });

    mock._emit({
      type: 'message_update',
      assistantMessageEvent: {
        type: 'text_delta',
        delta: 'Hello world',
      },
    });

    expect(chunks).toHaveLength(1);
    const parsed = JSON.parse(chunks[0]!.replace('data: ', '').trim());
    expect(parsed.params.type).toBe('text_delta');
    expect(parsed.params.text).toBe('Hello world');
    expect(ended).toBe(false);
  });

  it('should close stream on agent_end (done event)', () => {
    const mock = createMockSession();
    const chunks: string[] = [];
    let ended = false;

    streamSessionEvents({
      session: mock,
      sessionId: 'test-session',
      write: (c) => chunks.push(c),
      end: () => { ended = true; },
    });

    mock._emit({ type: 'agent_end' });

    expect(chunks).toHaveLength(1);
    const parsed = JSON.parse(chunks[0]!.replace('data: ', '').trim());
    expect(parsed.params.type).toBe('done');
    expect(ended).toBe(true);
  });

  it('should surface assistant provider errors via SSE error event', () => {
    const mock = createMockSession();
    const chunks: string[] = [];
    let ended = false;

    streamSessionEvents({
      session: mock,
      sessionId: 'test-session',
      write: (c) => chunks.push(c),
      end: () => { ended = true; },
    });

    mock._emit({
      type: 'message_end',
      message: {
        role: 'assistant',
        stopReason: 'error',
        errorMessage: '403 {"error":{"type":"forbidden","message":"Request not allowed"}}',
      },
    });

    expect(chunks).toHaveLength(1);
    const parsed = JSON.parse(chunks[0]!.replace('data: ', '').trim());
    expect(parsed.params).toEqual({
      type: 'error',
      code: 'MODEL_PROVIDER_ERROR',
      message: '403 {"error":{"type":"forbidden","message":"Request not allowed"}}',
    });
    expect(ended).toBe(true);
  });

  it('should unsubscribe and close on external cleanup call', () => {
    const mock = createMockSession();
    const chunks: string[] = [];
    let ended = false;

    const cleanup = streamSessionEvents({
      session: mock,
      sessionId: 'test-session',
      write: (c) => chunks.push(c),
      end: () => { ended = true; },
    });

    cleanup();

    mock._emit({
      type: 'message_update',
      assistantMessageEvent: {
        type: 'text_delta',
        delta: 'should not appear',
      },
    });

    expect(chunks).toHaveLength(0);
    expect(ended).toBe(true);
  });

  it('should skip events that translate to null', () => {
    const mock = createMockSession();
    const chunks: string[] = [];

    streamSessionEvents({
      session: mock,
      sessionId: 'test-session',
      write: (c) => chunks.push(c),
      end: () => {},
    });

    mock._emit({ type: 'agent_start' });
    mock._emit({ type: 'turn_start' });
    mock._emit({ type: 'message_start' });

    expect(chunks).toHaveLength(0);
  });
});

describe('AcpAdapter', () => {
  let mockFactory: SessionFactory;
  let mockSession: ReturnType<typeof createMockSession>;

  beforeEach(() => {
    mockSession = createMockSession();
    mockFactory = vi.fn().mockResolvedValue(mockSession);
  });

  it('should create a session and return sessionId', async () => {
    const adapter = new AcpAdapter(mockFactory);
    await adapter.init();

    const result = await adapter.createNewSession({});
    expect(result.sessionId).toBeDefined();
    expect(typeof result.sessionId).toBe('string');
    expect(result.sessionId.length).toBeGreaterThan(0);
  });

  it('should retrieve a created session', async () => {
    const adapter = new AcpAdapter(mockFactory);
    await adapter.init();

    const { sessionId } = await adapter.createNewSession({});
    const entry = adapter.getSession(sessionId);

    expect(entry).toBeDefined();
    expect(entry!.id).toBe(sessionId);
    expect(entry!.session).toBe(mockSession);
    expect(entry!.isStreaming).toBe(false);
  });

  it('should preserve caller provided sessionId', async () => {
    const adapter = new AcpAdapter(mockFactory);
    await adapter.init();

    const result = await adapter.createNewSession({ sessionId: 'requested-session' });
    const entry = adapter.getSession('requested-session');

    expect(result.sessionId).toBe('requested-session');
    expect(entry).toBeDefined();
    expect(entry!.id).toBe('requested-session');
  });

  it('should return undefined for nonexistent session', async () => {
    const adapter = new AcpAdapter(mockFactory);
    await adapter.init();

    expect(adapter.getSession('nonexistent')).toBeUndefined();
  });

  it('should abort a session', async () => {
    const adapter = new AcpAdapter(mockFactory);
    await adapter.init();

    const { sessionId } = await adapter.createNewSession({});
    const result = await adapter.abort(sessionId);

    expect(result).toEqual({ success: true });
    expect(mockSession.abort).toHaveBeenCalledOnce();
  });

  it('should throw when aborting nonexistent session', async () => {
    const adapter = new AcpAdapter(mockFactory);
    await adapter.init();

    await expect(adapter.abort('nonexistent')).rejects.toThrow("Session 'nonexistent' not found");
  });

  it('should dispose all sessions on disposeAll', async () => {
    const adapter = new AcpAdapter(mockFactory);
    await adapter.init();

    const { sessionId: id1 } = await adapter.createNewSession({});
    const session2 = createMockSession();
    mockFactory = vi.fn().mockResolvedValue(session2);

    adapter.disposeAll();

    expect(mockSession.dispose).toHaveBeenCalledOnce();
    expect(adapter.getSession(id1)).toBeUndefined();
  });

  it('should mark session streaming state', async () => {
    const adapter = new AcpAdapter(mockFactory);
    await adapter.init();

    const { sessionId } = await adapter.createNewSession({});

    adapter.markStreaming(sessionId, true, 'http://callback');
    const entry = adapter.getSession(sessionId);
    expect(entry!.isStreaming).toBe(true);
    expect(entry!.permissionCallbackUrl).toBe('http://callback');

    adapter.markStreaming(sessionId, false);
    expect(adapter.getSession(sessionId)!.isStreaming).toBe(false);
  });

  it('should pass cwd to session factory', async () => {
    const adapter = new AcpAdapter(mockFactory);
    await adapter.init();

    await adapter.createNewSession({ cwd: '/custom/dir' });
    expect(mockFactory).toHaveBeenCalledWith(
      '/custom/dir',
      expect.any(Object),
      { cwd: '/custom/dir' },
    );
  });

  it('should default cwd to /workspace', async () => {
    const adapter = new AcpAdapter(mockFactory);
    await adapter.init();

    await adapter.createNewSession({});
    expect(mockFactory).toHaveBeenCalledWith(
      '/workspace',
      expect.any(Object),
      {},
    );
  });
});
