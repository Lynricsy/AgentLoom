import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SandboxAgentAdapter } from '../sandbox-agent.adapter';
import type { CreateSessionParams } from '../types/agent-session.types';
import type { AgentEvent } from '../types/agent-event.types';

vi.mock('@nestjs/common', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@nestjs/common')>();
  class MockLogger {
    debug = vi.fn();
    error = vi.fn();
    log = vi.fn();
    warn = vi.fn();
  }
  return {
    ...actual,
    Logger: MockLogger,
  };
});

describe('SandboxAgentAdapter', () => {
  let adapter: SandboxAgentAdapter;
  let mockSandboxService: {
    getSandboxSession: ReturnType<typeof vi.fn>;
    findByConversationId: ReturnType<typeof vi.fn>;
  };
  let mockDockerService: {
    getPromptUrl: ReturnType<typeof vi.fn>;
    healthCheck: ReturnType<typeof vi.fn>;
    getSessionUrl: ReturnType<typeof vi.fn>;
  };

  const defaultParams: CreateSessionParams = {
    agentId: 'agent-001',
    mode: 'workflow',
    tenantId: 'tenant-001',
    llmModelConfigId: 'model-config-001',
    systemPrompt: 'You are a sandbox agent.',
    mcpServers: {},
    context: { executionId: 'exec-001' },
  };

  let savedFetch: typeof globalThis.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    savedFetch = globalThis.fetch;
    mockSandboxService = {
      getSandboxSession: vi.fn().mockResolvedValue({
        id: 'sandbox-001',
        status: 'ready',
        containerId: 'abc123def456',
      }),
      findByConversationId: vi.fn().mockResolvedValue({
        id: 'sandbox-001',
        status: 'ready',
        containerId: 'abc123def456',
      }),
    };
    mockDockerService = {
      getPromptUrl: vi.fn(),
      healthCheck: vi.fn().mockResolvedValue(true),
      getSessionUrl: vi
        .fn()
        .mockResolvedValue('http://127.0.0.1:49123/v1/session'),
    };
    // createSession 的容器初始化 POST 默认返回成功
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ success: true }),
    } as unknown as Response);
    adapter = new SandboxAgentAdapter(
      mockSandboxService as never,
      mockDockerService as never,
    );
  });

  afterEach(() => {
    globalThis.fetch = savedFetch;
  });

  async function collectEvents(iterable: AsyncIterable<AgentEvent>) {
    const events: AgentEvent[] = [];
    for await (const event of iterable) {
      events.push(event);
    }
    return events;
  }

  function createSseResponse(chunks: string[]): Response {
    const encoder = new TextEncoder();
    return {
      ok: true,
      status: 200,
      body: {
        getReader: () => {
          let index = 0;
          return {
            read: vi.fn(async () => {
              if (index >= chunks.length) {
                return { done: true, value: undefined };
              }

              const value = encoder.encode(chunks[index]);
              index += 1;
              return { done: false, value };
            }),
          };
        },
      },
    } as unknown as Response;
  }

  describe('createSession', () => {
    it('应创建具有 sandbox 工作区路径的会话', async () => {
      const session = await adapter.createSession(defaultParams);

      expect(session.id).toBeDefined();
      expect(session.agentId).toBe('agent-001');
      expect(session.mode).toBe('workflow');
      expect(session.context.cwd).toBe('/workspace/');
      expect(session.status).toBe('active');
      expect(session.tenantId).toBe('tenant-001');
      expect(session.context.workflowState).toEqual({
        executionId: 'exec-001',
      });
    });

    it('应保留 mcpServers 配置', async () => {
      const session = await adapter.createSession({
        ...defaultParams,
        mcpServers: {
          sandbox: { url: 'http://mcp:3000' } as never,
        },
      });

      expect(Object.keys(session.context.mcpServers ?? {})).toHaveLength(1);
    });

    it('有 executionId 和 tenantId 时应调用容器 session 初始化', async () => {
      const session = await adapter.createSession(defaultParams);

      expect(mockSandboxService.getSandboxSession).toHaveBeenCalledWith(
        'exec-001',
        'tenant-001',
      );
      expect(mockDockerService.healthCheck).toHaveBeenCalledWith(
        'abc123def456',
      );
      expect(mockDockerService.getSessionUrl).toHaveBeenCalledWith(
        'abc123def456',
      );
      expect(globalThis.fetch).toHaveBeenCalledWith(
        'http://127.0.0.1:49123/v1/session',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: expect.stringContaining('"createCodingTools":true'),
        }),
      );
      expect(session.status).toBe('active');
    });

    it('有 agentConversationId 和 tenantId 时也应调用 conversation sandbox 初始化', async () => {
      const session = await adapter.createSession({
        ...defaultParams,
        context: { agentConversationId: 'conv-001' },
      });

      expect(mockSandboxService.findByConversationId).toHaveBeenCalledWith(
        'conv-001',
        'tenant-001',
      );
      expect(mockDockerService.healthCheck).toHaveBeenCalledWith(
        'abc123def456',
      );
      expect(mockDockerService.getSessionUrl).toHaveBeenCalledWith(
        'abc123def456',
      );
      expect(session.status).toBe('active');
    });

    it('容器 session 初始化失败时应设置会话状态为 error 并抛出', async () => {
      globalThis.fetch = vi
        .fn()
        .mockRejectedValue(new Error('Container session init failed'));

      await expect(adapter.createSession(defaultParams)).rejects.toThrow(
        'Container session init failed',
      );
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    });

    it('容器端点尚未监听时应重试 session 初始化', async () => {
      vi.useFakeTimers();
      const connectionRefusedError = new Error('fetch failed', {
        cause: { code: 'ECONNREFUSED' },
      });
      globalThis.fetch = vi
        .fn()
        .mockRejectedValueOnce(connectionRefusedError)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: vi.fn().mockResolvedValue({ success: true }),
        } as unknown as Response);

      try {
        const createSessionPromise = adapter.createSession(defaultParams);
        await vi.advanceTimersByTimeAsync(1_000);

        const session = await createSessionPromise;

        expect(globalThis.fetch).toHaveBeenCalledTimes(2);
        expect(session.status).toBe('active');
      } finally {
        vi.useRealTimers();
      }
    });

    it('无 sandbox binding 时应跳过容器 session 初始化', async () => {
      const session = await adapter.createSession({
        ...defaultParams,
        context: {},
      });

      expect(mockSandboxService.getSandboxSession).not.toHaveBeenCalled();
      expect(mockSandboxService.findByConversationId).not.toHaveBeenCalled();
      expect(mockDockerService.getSessionUrl).not.toHaveBeenCalled();
      expect(session.status).toBe('active');
    });
  });

  describe('loadSession', () => {
    it('应加载已存在的会话', async () => {
      const created = await adapter.createSession(defaultParams);
      const loaded = await adapter.loadSession(created.id);
      expect(loaded.id).toBe(created.id);
    });

    it('不存在的会话应抛出 SandboxNotFoundException', async () => {
      await expect(adapter.loadSession('non-existent-id')).rejects.toThrow();
    });
  });

  describe('prompt', () => {
    it('sandbox ready 后应请求容器端点并解析 SSE 事件', async () => {
      const session = await adapter.createSession(defaultParams);
      mockSandboxService.getSandboxSession.mockResolvedValue({
        id: 'sandbox-001',
        status: 'ready',
        containerId: 'abc123def456',
      });
      mockDockerService.healthCheck.mockResolvedValue(true);
      mockDockerService.getPromptUrl.mockResolvedValue(
        'http://127.0.0.1:49123/v1/prompt',
      );

      const originalFetch = globalThis.fetch;
      const encoder = new TextEncoder();
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        body: {
          getReader: () => {
            let emitted = false;
            return {
              read: vi.fn(async () => {
                if (emitted) {
                  return { done: true, value: undefined };
                }
                emitted = true;
                return {
                  done: false,
                  value: encoder.encode(
                    'data: {"type":"message_chunk","content":"hello"}\n\n' +
                      'data: {"type":"done","stopReason":"end_turn"}\n\n',
                  ),
                };
              }),
            };
          },
        },
      } as unknown as Response);

      const events = await collectEvents(
        adapter.prompt(session.id, [{ type: 'text', text: 'hello' }]),
      );

      expect(events).toEqual([
        { type: 'message_chunk', content: 'hello' },
        { type: 'done', stopReason: 'end_turn' },
      ]);
      expect(mockSandboxService.getSandboxSession).toHaveBeenCalledWith(
        'exec-001',
        'tenant-001',
      );
      expect(mockDockerService.healthCheck).toHaveBeenCalledWith(
        'abc123def456',
      );
      expect(mockDockerService.getPromptUrl).toHaveBeenCalledWith(
        'abc123def456',
      );
      expect(globalThis.fetch).toHaveBeenCalledWith(
        'http://127.0.0.1:49123/v1/prompt',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            sessionId: session.id,
            content: [{ type: 'text', text: 'hello' }],
            cwd: '/workspace/',
          }),
        }),
      );

      globalThis.fetch = originalFetch;
    });

    it('应把容器 JSON-RPC SSE 事件翻译为规范 AgentEvent', async () => {
      const session = await adapter.createSession(defaultParams);
      mockDockerService.getPromptUrl.mockResolvedValue(
        'http://127.0.0.1:49123/v1/prompt',
      );

      globalThis.fetch = vi.fn().mockResolvedValue(
        createSseResponse([
          'data: {"jsonrpc":"2.0","method":"event","params":{"type":"text_delta","data":{"delta":"hello"}}}\n\n',
          'data: {"jsonrpc":"2.0","method":"event","params":{"type":"tool_call_update","data":{"toolCallId":"tool-1","toolName":"fs/write_text_file","input":{"path":"/workspace/a.txt"},"status":"awaiting_permission","permissionRequest":{"description":"允许写入文件","resourcePaths":["/workspace/a.txt"]}}}}\n\n',
          'data: {"jsonrpc":"2.0","method":"event","params":{"type":"tool_call_end","data":{"toolCallId":"tool-1","toolName":"fs/write_text_file","status":"completed","result":{"ok":true}}}}\n\n',
          'data: {"jsonrpc":"2.0","method":"event","params":{"type":"done","data":{"stopReason":"tool_use"}}}\n\n',
        ]),
      );

      const events = await collectEvents(
        adapter.prompt(session.id, [{ type: 'text', text: 'hello' }]),
      );

      expect(events).toEqual([
        { type: 'message_chunk', content: 'hello' },
        {
          type: 'tool_call',
          call: {
            id: 'tool-1',
            tool: 'fs/write_text_file',
            args: { path: '/workspace/a.txt' },
            status: 'awaiting_permission',
            permissionRequest: {
              description: '允许写入文件',
              resourcePaths: ['/workspace/a.txt'],
            },
          },
        },
        {
          type: 'tool_call',
          call: {
            id: 'tool-1',
            tool: 'fs/write_text_file',
            args: {},
            status: 'completed',
            result: { ok: true },
          },
        },
        { type: 'done', stopReason: 'tool_use' },
      ]);
    });

    it('容器 error 事件应抛给上层', async () => {
      const session = await adapter.createSession(defaultParams);
      mockDockerService.getPromptUrl.mockResolvedValue(
        'http://127.0.0.1:49123/v1/prompt',
      );

      globalThis.fetch = vi.fn().mockResolvedValue(
        createSseResponse([
          'data: {"jsonrpc":"2.0","method":"event","params":{"type":"error","data":{"message":"sandbox exploded"}}}\n\n',
        ]),
      );

      await expect(
        collectEvents(adapter.prompt(session.id, [{ type: 'text', text: 'hello' }])),
      ).rejects.toThrow('sandbox exploded');
    });

    it('缺失 sandbox binding 时应抛出错误', async () => {
      const session = await adapter.createSession({
        ...defaultParams,
        context: {},
      });

      await expect(
        collectEvents(
          adapter.prompt(session.id, [{ type: 'text', text: 'hello' }]),
        ),
      ).rejects.toThrow(
        'Sandbox workflow context missing sandbox binding or tenantId',
      );
    });

    it('conversation sandbox ready 后应通过 conversationId 请求容器端点', async () => {
      const session = await adapter.createSession({
        ...defaultParams,
        context: { agentConversationId: 'conv-001' },
      });
      mockSandboxService.findByConversationId.mockResolvedValue({
        id: 'sandbox-001',
        status: 'ready',
        containerId: 'abc123def456',
      });
      mockDockerService.healthCheck.mockResolvedValue(true);
      mockDockerService.getPromptUrl.mockResolvedValue(
        'http://127.0.0.1:49123/v1/prompt',
      );

      const originalFetch = globalThis.fetch;
      const encoder = new TextEncoder();
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        body: {
          getReader: () => {
            let emitted = false;
            return {
              read: vi.fn(async () => {
                if (emitted) {
                  return { done: true, value: undefined };
                }
                emitted = true;
                return {
                  done: false,
                  value: encoder.encode(
                    'data: {"type":"message_chunk","content":"hello"}\n\n' +
                      'data: {"type":"done","stopReason":"end_turn"}\n\n',
                  ),
                };
              }),
            };
          },
        },
      } as unknown as Response);

      const events = await collectEvents(
        adapter.prompt(session.id, [{ type: 'text', text: 'hello' }]),
      );

      expect(events).toEqual([
        { type: 'message_chunk', content: 'hello' },
        { type: 'done', stopReason: 'end_turn' },
      ]);
      expect(mockSandboxService.findByConversationId).toHaveBeenCalledWith(
        'conv-001',
        'tenant-001',
      );

      globalThis.fetch = originalFetch;
    });

    it('fetch 失败时应将错误抛给上层', async () => {
      const session = await adapter.createSession(defaultParams);
      mockSandboxService.getSandboxSession.mockResolvedValue({
        id: 'sandbox-001',
        status: 'ready',
        containerId: 'abc123def456',
      });
      mockDockerService.healthCheck.mockResolvedValue(true);
      mockDockerService.getPromptUrl.mockResolvedValue(
        'http://127.0.0.1:49123/v1/prompt',
      );

      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi
        .fn()
        .mockRejectedValue(new Error('Connection refused'));

      await expect(
        collectEvents(
          adapter.prompt(session.id, [{ type: 'text', text: 'hello' }]),
        ),
      ).rejects.toThrow('Connection refused');

      globalThis.fetch = originalFetch;
    });

    it('AbortError 应返回 cancelled stopReason', async () => {
      const session = await adapter.createSession(defaultParams);
      mockSandboxService.getSandboxSession.mockResolvedValue({
        id: 'sandbox-001',
        status: 'ready',
        containerId: 'abc123def456',
      });
      mockDockerService.healthCheck.mockResolvedValue(true);
      mockDockerService.getPromptUrl.mockResolvedValue(
        'http://127.0.0.1:49123/v1/prompt',
      );

      const abortError = new Error('Aborted');
      abortError.name = 'AbortError';

      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockRejectedValue(abortError);

      const events = await collectEvents(
        adapter.prompt(session.id, [{ type: 'text', text: 'hello' }]),
      );

      expect(events).toHaveLength(1);
      expect(events[0]).toEqual({ type: 'done', stopReason: 'cancelled' });

      globalThis.fetch = originalFetch;
    });

    it('应将 content 推入 session history', async () => {
      const session = await adapter.createSession(defaultParams);
      mockSandboxService.getSandboxSession.mockResolvedValue({
        id: 'sandbox-001',
        status: 'ready',
        containerId: 'abc123def456',
      });
      mockDockerService.healthCheck.mockResolvedValue(true);
      mockDockerService.getPromptUrl.mockResolvedValue(
        'http://127.0.0.1:49123/v1/prompt',
      );

      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockRejectedValue(
        Object.assign(new Error('Aborted'), {
          name: 'AbortError',
        }),
      );

      const content = [{ type: 'text' as const, text: 'hello' }];
      await collectEvents(adapter.prompt(session.id, content));

      const loaded = await adapter.loadSession(session.id);
      expect(loaded.context.history).toHaveLength(1);

      globalThis.fetch = originalFetch;
    });
  });

  describe('cancel', () => {
    it('应调用容器 /v1/abort', async () => {
      const session = await adapter.createSession(defaultParams);
      mockDockerService.getPromptUrl.mockResolvedValue(
        'http://127.0.0.1:49123/v1/prompt',
      );
      globalThis.fetch = vi
        .fn()
        .mockResolvedValueOnce({ ok: true, status: 200 } as Response)
        .mockResolvedValueOnce({ ok: true, status: 200 } as Response);

      await adapter.cancel(session.id);

      expect(globalThis.fetch).toHaveBeenLastCalledWith(
        'http://127.0.0.1:49123/v1/abort',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ sessionId: session.id }),
        }),
      );
    });

    it('应将会话状态设为 completed', async () => {
      const session = await adapter.createSession(defaultParams);
      mockDockerService.getPromptUrl.mockResolvedValue(
        'http://127.0.0.1:49123/v1/prompt',
      );
      globalThis.fetch = vi
        .fn()
        .mockResolvedValueOnce({ ok: true, status: 200 } as Response)
        .mockResolvedValueOnce({ ok: true, status: 200 } as Response);
      await adapter.cancel(session.id);

      const loaded = await adapter.loadSession(session.id);
      expect(loaded.status).toBe('completed');
    });

    it('不存在的会话取消不应抛出异常', async () => {
      await expect(adapter.cancel('non-existent')).resolves.toBeUndefined();
    });
  });

  describe('tool permission gate', () => {
    it('应等待 resolveConversationToolPermission 后允许工具执行', async () => {
      const session = await adapter.createSession({
        ...defaultParams,
        mode: 'conversation',
        context: { agentConversationId: 'conv-001' },
      });

      const pending = adapter.awaitToolPermission('conv-001', {
        toolCallId: 'tool-1',
        toolName: 'fs/write_text_file',
        input: { path: '/workspace/a.txt' },
      });

      await Promise.resolve();
      await adapter.resolveConversationToolPermission(
        'conv-001',
        'tool-1',
        'approve',
      );

      await expect(pending).resolves.toEqual({ allowed: true });
      await expect(
        adapter.resolveToolPermission(session.id, 'tool-1', 'approve'),
      ).rejects.toThrow('has no pending tool permission');
    });

    it('deny 时应返回 allowed=false', async () => {
      await adapter.createSession({
        ...defaultParams,
        mode: 'conversation',
        context: { agentConversationId: 'conv-001' },
      });

      const pending = adapter.awaitToolPermission('conv-001', {
        toolCallId: 'tool-2',
        toolName: 'fs/write_text_file',
      });

      await Promise.resolve();
      await adapter.resolveConversationToolPermission('conv-001', 'tool-2', 'deny');

      await expect(pending).resolves.toEqual({ allowed: false });
    });

    it('30 秒超时后应默认 deny', async () => {
      vi.useFakeTimers();

      try {
        await adapter.createSession({
          ...defaultParams,
          mode: 'conversation',
          context: { agentConversationId: 'conv-001' },
        });

        const pending = adapter.awaitToolPermission('conv-001', {
          toolCallId: 'tool-timeout',
          toolName: 'fs/write_text_file',
        });

        await vi.advanceTimersByTimeAsync(30_000);

        await expect(pending).resolves.toEqual({ allowed: false });
      } finally {
        vi.useRealTimers();
      }
    });

    it('缺少 conversation session 映射时应抛错', async () => {
      await expect(
        adapter.awaitToolPermission('missing-conversation', {
          toolCallId: 'tool-1',
          toolName: 'fs/write_text_file',
        }),
      ).rejects.toThrow('Sandbox conversation session not found');
    });

    it('重复挂起同一 toolCallId 时应抛错', async () => {
      await adapter.createSession({
        ...defaultParams,
        mode: 'conversation',
        context: { agentConversationId: 'conv-001' },
      });

      const first = adapter.awaitToolPermission('conv-001', {
        toolCallId: 'tool-dup',
        toolName: 'fs/write_text_file',
      });

      await Promise.resolve();

      await expect(
        adapter.awaitToolPermission('conv-001', {
          toolCallId: 'tool-dup',
          toolName: 'fs/write_text_file',
        }),
      ).rejects.toThrow('already has pending tool permission');

      await adapter.resolveConversationToolPermission('conv-001', 'tool-dup', 'deny');
      await expect(first).resolves.toEqual({ allowed: false });
    });
  });
});
