import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@mariozechner/pi-coding-agent', () => ({}));

import type {
  PiExtensionAPI,
  PiToolDefinition,
  PiToolCallEvent,
  PiToolExecutionStartEvent,
  PiToolExecutionEndEvent,
  PiToolCallEventResult,
  AgentLoomExtensionEvent,
} from '../src/agentloom-extension.js';
import { createAgentLoomExtension } from '../src/agentloom-extension.js';

type ToolCallHandler = (
  event: PiToolCallEvent,
  ctx: unknown,
) => PiToolCallEventResult | Promise<PiToolCallEventResult | void> | void;

type ExecutionStartHandler = (
  event: PiToolExecutionStartEvent,
  ctx: unknown,
) => void;

type ExecutionEndHandler = (
  event: PiToolExecutionEndEvent,
  ctx: unknown,
) => void;

function createMockPi() {
  const registeredTools: PiToolDefinition[] = [];
  const handlers: Record<string, Function[]> = {};

  const pi: PiExtensionAPI = {
    registerTool(tool: PiToolDefinition) {
      registeredTools.push(tool);
    },
    on(event: string, handler: Function) {
      if (!handlers[event]) handlers[event] = [];
      handlers[event].push(handler);
    },
  };

  return {
    pi,
    registeredTools,
    handlers,
    getToolCallHandlers: () =>
      (handlers['tool_call'] ?? []) as ToolCallHandler[],
    getExecutionStartHandlers: () =>
      (handlers['tool_execution_start'] ?? []) as ExecutionStartHandler[],
    getExecutionEndHandlers: () =>
      (handlers['tool_execution_end'] ?? []) as ExecutionEndHandler[],
  };
}

describe('createAgentLoomExtension', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('permission interception', () => {
    it('blocks tool call when permission denied', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({ allowed: false }),
        }),
      );

      const onEvent = vi.fn();
      const factory = createAgentLoomExtension({
        sessionId: 'sess-1',
        permissionCallbackUrl: 'http://loom/callback',
        onEvent,
      });

      const mock = createMockPi();
      factory(mock.pi);

      const handlers = mock.getToolCallHandlers();
      expect(handlers).toHaveLength(1);

      const result = await handlers[0](
        {
          type: 'tool_call',
          toolCallId: 'tc-42',
          toolName: 'readFile',
          input: { path: '/etc/passwd' },
        },
        {},
      );

      expect(result).toEqual({
        block: true,
        reason: 'Permission denied by AgentLoom',
      });
      expect(onEvent).toHaveBeenCalledWith({
        type: 'tool_permission_denied',
        toolCallId: 'tc-42',
        toolName: 'readFile',
        input: { path: '/etc/passwd' },
      });
    });

    it('allows tool call when permission granted', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({ allowed: true }),
        }),
      );

      const factory = createAgentLoomExtension({
        sessionId: 'sess-1',
        permissionCallbackUrl: 'http://loom/callback',
      });

      const mock = createMockPi();
      factory(mock.pi);

      const result = await mock.getToolCallHandlers()[0](
        {
          type: 'tool_call',
          toolCallId: 'tc-1',
          toolName: 'ls',
          input: {},
        },
        {},
      );

      expect(result).toEqual({ block: false });
    });

    it('sends correct payload to permission callback', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ allowed: true }),
      });
      vi.stubGlobal('fetch', fetchMock);

      const factory = createAgentLoomExtension({
        sessionId: 'sess-abc',
        permissionCallbackUrl: 'http://loom/perm',
      });

      const mock = createMockPi();
      factory(mock.pi);

      await mock.getToolCallHandlers()[0](
        {
          type: 'tool_call',
          toolCallId: 'tc-99',
          toolName: 'exec',
          input: { cmd: 'ls' },
        },
        {},
      );

      expect(fetchMock).toHaveBeenCalledWith(
        'http://loom/perm',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            toolName: 'exec',
            toolCallId: 'tc-99',
            input: { cmd: 'ls' },
            sessionId: 'sess-abc',
          }),
        }),
      );
    });

    it('blocks when fetch fails (default deny)', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockRejectedValue(new Error('network error')),
      );

      const factory = createAgentLoomExtension({
        sessionId: 'sess-1',
        permissionCallbackUrl: 'http://loom/callback',
      });

      const mock = createMockPi();
      factory(mock.pi);

      const result = await mock.getToolCallHandlers()[0](
        {
          type: 'tool_call',
          toolCallId: 'tc-1',
          toolName: 'rm',
          input: {},
        },
        {},
      );

      expect(result).toEqual({
        block: true,
        reason: 'Permission denied by AgentLoom',
      });
    });

    it('does not register tool_call handler when no permissionCallbackUrl', () => {
      const factory = createAgentLoomExtension({
        sessionId: 'sess-1',
      });

      const mock = createMockPi();
      factory(mock.pi);

      expect(mock.getToolCallHandlers()).toHaveLength(0);
    });
  });

  describe('event forwarding', () => {
    it('forwards tool_execution_start events', () => {
      const onEvent = vi.fn();
      const factory = createAgentLoomExtension({
        sessionId: 'sess-1',
        onEvent,
      });

      const mock = createMockPi();
      factory(mock.pi);

      const handlers = mock.getExecutionStartHandlers();
      expect(handlers).toHaveLength(1);

      handlers[0](
        {
          type: 'tool_execution_start',
          toolCallId: 'tc-5',
          toolName: 'grep',
          args: { pattern: 'foo' },
        },
        {},
      );

      expect(onEvent).toHaveBeenCalledWith({
        type: 'tool_execution_start',
        toolCallId: 'tc-5',
        toolName: 'grep',
        args: { pattern: 'foo' },
      });
    });

    it('forwards tool_execution_end events', () => {
      const onEvent = vi.fn();
      const factory = createAgentLoomExtension({
        sessionId: 'sess-1',
        onEvent,
      });

      const mock = createMockPi();
      factory(mock.pi);

      const handlers = mock.getExecutionEndHandlers();
      expect(handlers).toHaveLength(1);

      handlers[0](
        {
          type: 'tool_execution_end',
          toolCallId: 'tc-5',
          toolName: 'grep',
          result: 'found 3 matches',
          isError: false,
        },
        {},
      );

      expect(onEvent).toHaveBeenCalledWith({
        type: 'tool_execution_end',
        toolCallId: 'tc-5',
        toolName: 'grep',
        result: 'found 3 matches',
        isError: false,
      });
    });

    it('does not register event handlers when no onEvent callback', () => {
      const factory = createAgentLoomExtension({
        sessionId: 'sess-1',
      });

      const mock = createMockPi();
      factory(mock.pi);

      expect(mock.getExecutionStartHandlers()).toHaveLength(0);
      expect(mock.getExecutionEndHandlers()).toHaveLength(0);
    });
  });

  describe('factory shape', () => {
    it('returns a function (ExtensionFactory signature)', () => {
      const factory = createAgentLoomExtension({ sessionId: 's' });
      expect(typeof factory).toBe('function');
    });

    it('works with empty options (no tools, no callbacks)', () => {
      const factory = createAgentLoomExtension({ sessionId: 's' });
      const mock = createMockPi();

      expect(() => factory(mock.pi)).not.toThrow();
      expect(mock.registeredTools).toHaveLength(0);
      expect(mock.getToolCallHandlers()).toHaveLength(0);
      expect(mock.getExecutionStartHandlers()).toHaveLength(0);
    });
  });
});
