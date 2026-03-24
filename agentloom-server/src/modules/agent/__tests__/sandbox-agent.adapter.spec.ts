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

  describe('SSE event translation branch coverage', () => {
    async function createSessionAndPromptSse(
      sseLines: string[],
      params = defaultParams,
    ): Promise<AgentEvent[]> {
      const session = await adapter.createSession(params);
      mockSandboxService.getSandboxSession.mockResolvedValue({
        id: 'sandbox-001',
        status: 'ready',
        containerId: 'abc123def456',
      });
      mockDockerService.healthCheck.mockResolvedValue(true);
      mockDockerService.getPromptUrl.mockResolvedValue(
        'http://127.0.0.1:49123/v1/prompt',
      );

      globalThis.fetch = vi.fn().mockResolvedValue(createSseResponse(sseLines));

      return collectEvents(
        adapter.prompt(session.id, [{ type: 'text', text: 'test' }]),
      );
    }

    it('[DONE] SSE payload yields no events', async () => {
      const events = await createSessionAndPromptSse([
        'data: [DONE]\n\n',
        'data: {"type":"done","stopReason":"end_turn"}\n\n',
      ]);

      expect(events).toEqual([{ type: 'done', stopReason: 'end_turn' }]);
    });

    it('raw typed event without jsonrpc is translated', async () => {
      const events = await createSessionAndPromptSse([
        'data: {"type":"text_delta","data":{"delta":"raw"}}\n\n',
        'data: {"type":"done","stopReason":"end_turn"}\n\n',
      ]);

      expect(events[0]).toEqual({ type: 'message_chunk', content: 'raw' });
    });

    it('text_delta with record containing content key', async () => {
      const events = await createSessionAndPromptSse([
        'data: {"jsonrpc":"2.0","method":"event","params":{"type":"text_delta","data":{"content":"via-content"}}}\n\n',
        'data: {"jsonrpc":"2.0","method":"event","params":{"type":"done","data":{"stopReason":"end_turn"}}}\n\n',
      ]);

      expect(events[0]).toEqual({ type: 'message_chunk', content: 'via-content' });
    });

    it('text_delta with raw string data', async () => {
      const events = await createSessionAndPromptSse([
        'data: {"jsonrpc":"2.0","method":"event","params":{"type":"text_delta","data":"raw-string"}}\n\n',
        'data: {"jsonrpc":"2.0","method":"event","params":{"type":"done","data":{"stopReason":"end_turn"}}}\n\n',
      ]);

      expect(events[0]).toEqual({ type: 'message_chunk', content: 'raw-string' });
    });

    it('text_delta with empty string data yields no event', async () => {
      const events = await createSessionAndPromptSse([
        'data: {"jsonrpc":"2.0","method":"event","params":{"type":"text_delta","data":""}}\n\n',
        'data: {"jsonrpc":"2.0","method":"event","params":{"type":"done","data":{"stopReason":"end_turn"}}}\n\n',
      ]);

      expect(events).toEqual([{ type: 'done', stopReason: 'end_turn' }]);
    });

    it('tool_call_start event produces in_progress tool_call', async () => {
      const events = await createSessionAndPromptSse([
        'data: {"jsonrpc":"2.0","method":"event","params":{"type":"tool_call_start","data":{"toolCallId":"t1","toolName":"search","args":{"q":"foo"}}}}\n\n',
        'data: {"jsonrpc":"2.0","method":"event","params":{"type":"done","data":{"stopReason":"end_turn"}}}\n\n',
      ]);

      expect(events[0]).toEqual({
        type: 'tool_call',
        call: expect.objectContaining({
          id: 't1',
          tool: 'search',
          args: { q: 'foo' },
          status: 'in_progress',
        }),
      });
    });

    it('tool_call_end with isError=true produces failed status with fallback message', async () => {
      const events = await createSessionAndPromptSse([
        'data: {"jsonrpc":"2.0","method":"event","params":{"type":"tool_call_end","data":{"toolCallId":"t2","toolName":"cmd","isError":true}}}\n\n',
        'data: {"jsonrpc":"2.0","method":"event","params":{"type":"done","data":{"stopReason":"end_turn"}}}\n\n',
      ]);

      expect(events[0]).toEqual({
        type: 'tool_call',
        call: expect.objectContaining({
          id: 't2',
          tool: 'cmd',
          status: 'failed',
          error: 'Sandbox tool execution failed',
        }),
      });
    });

    it('tool_call_end with error object extracts message', async () => {
      const events = await createSessionAndPromptSse([
        'data: {"jsonrpc":"2.0","method":"event","params":{"type":"tool_call_end","data":{"toolCallId":"t3","toolName":"cmd","error":{"message":"boom"}}}}\n\n',
        'data: {"jsonrpc":"2.0","method":"event","params":{"type":"done","data":{"stopReason":"end_turn"}}}\n\n',
      ]);

      expect(events[0]).toEqual({
        type: 'tool_call',
        call: expect.objectContaining({
          status: 'failed',
          error: 'boom',
        }),
      });
    });

    it('tool_call_end with string error', async () => {
      const events = await createSessionAndPromptSse([
        'data: {"jsonrpc":"2.0","method":"event","params":{"type":"tool_call_end","data":{"toolCallId":"t4","toolName":"cmd","error":"string-err"}}}\n\n',
        'data: {"jsonrpc":"2.0","method":"event","params":{"type":"done","data":{"stopReason":"end_turn"}}}\n\n',
      ]);

      expect(events[0]).toEqual({
        type: 'tool_call',
        call: expect.objectContaining({
          status: 'failed',
          error: 'string-err',
        }),
      });
    });

    it('tool_call_end with error object lacking message uses JSON.stringify', async () => {
      const events = await createSessionAndPromptSse([
        'data: {"jsonrpc":"2.0","method":"event","params":{"type":"tool_call_end","data":{"toolCallId":"t5","toolName":"cmd","error":{"code":500}}}}\n\n',
        'data: {"jsonrpc":"2.0","method":"event","params":{"type":"done","data":{"stopReason":"end_turn"}}}\n\n',
      ]);

      expect(events[0]).toEqual({
        type: 'tool_call',
        call: expect.objectContaining({
          status: 'failed',
          error: '{"code":500}',
        }),
      });
    });

    it('normalizeStopReason aliases', async () => {
      for (const [input, expected] of [
        ['cancelled', 'cancelled'],
        ['aborted', 'cancelled'],
        ['max_tokens', 'max_tokens'],
        ['length', 'max_tokens'],
        ['toolUse', 'tool_use'],
        ['intervention_required', 'intervention_required'],
        ['something_else', 'end_turn'],
      ] as const) {
        const events = await createSessionAndPromptSse([
          `data: {"jsonrpc":"2.0","method":"event","params":{"type":"done","data":{"stopReason":"${input}"}}}\n\n`,
        ]);

        const doneEvt = events.find((e) => e.type === 'done');
        expect(doneEvt).toEqual({ type: 'done', stopReason: expected });
      }
    });

    it('normalizeToolArgs reads input field', async () => {
      const events = await createSessionAndPromptSse([
        'data: {"jsonrpc":"2.0","method":"event","params":{"type":"tool_call_start","data":{"toolCallId":"t6","toolName":"run","input":{"cmd":"ls"}}}}\n\n',
        'data: {"jsonrpc":"2.0","method":"event","params":{"type":"done","data":{"stopReason":"end_turn"}}}\n\n',
      ]);

      expect((events[0] as unknown as { type: 'tool_call'; call: { args: Record<string, unknown> } }).call.args).toEqual({ cmd: 'ls' });
    });

    it('normalizeToolArgs reads arguments field', async () => {
      const events = await createSessionAndPromptSse([
        'data: {"jsonrpc":"2.0","method":"event","params":{"type":"tool_call_start","data":{"toolCallId":"t7","toolName":"run","arguments":{"cmd":"ls"}}}}\n\n',
        'data: {"jsonrpc":"2.0","method":"event","params":{"type":"done","data":{"stopReason":"end_turn"}}}\n\n',
      ]);

      expect((events[0] as unknown as { type: 'tool_call'; call: { args: Record<string, unknown> } }).call.args).toEqual({ cmd: 'ls' });
    });

    it('normalizeToolArgs returns {} when no candidates match', async () => {
      const events = await createSessionAndPromptSse([
        'data: {"jsonrpc":"2.0","method":"event","params":{"type":"tool_call_start","data":{"toolCallId":"t8","toolName":"run"}}}\n\n',
        'data: {"jsonrpc":"2.0","method":"event","params":{"type":"done","data":{"stopReason":"end_turn"}}}\n\n',
      ]);

      expect((events[0] as unknown as { type: 'tool_call'; call: { args: Record<string, unknown> } }).call.args).toEqual({});
    });

    it('normalizeTransitions with valid entries', async () => {
      const transitions = [
        { from: 'pending', to: 'in_progress', timestamp: '2025-01-01T00:00:00Z', source: 'worker' },
        { to: 'completed', source: 'runtime' },
      ];
      const events = await createSessionAndPromptSse([
        `data: {"jsonrpc":"2.0","method":"event","params":{"type":"tool_call_end","data":{"toolCallId":"t9","toolName":"run","status":"completed","transitions":${JSON.stringify(transitions)}}}}\n\n`,
        'data: {"jsonrpc":"2.0","method":"event","params":{"type":"done","data":{"stopReason":"end_turn"}}}\n\n',
      ]);

      const call = (events[0] as unknown as { type: 'tool_call'; call: Record<string, unknown> }).call;
      const trans = call.transitions as Array<Record<string, unknown>>;
      expect(trans).toHaveLength(2);
      expect(trans[0].from).toBe('pending');
      expect(trans[0].to).toBe('in_progress');
      expect(trans[0].source).toBe('worker');
      expect(trans[1].to).toBe('completed');
    });

    it('normalizeTransitions skips non-record entries and entries without valid to', async () => {
      const transitions = [
        'not-an-object',
        { to: 'invalid_status' },
        { to: 'completed', source: 'user' },
      ];
      const events = await createSessionAndPromptSse([
        `data: {"jsonrpc":"2.0","method":"event","params":{"type":"tool_call_end","data":{"toolCallId":"t10","toolName":"run","status":"completed","transitions":${JSON.stringify(transitions)}}}}\n\n`,
        'data: {"jsonrpc":"2.0","method":"event","params":{"type":"done","data":{"stopReason":"end_turn"}}}\n\n',
      ]);

      const call = (events[0] as unknown as { type: 'tool_call'; call: Record<string, unknown> }).call;
      const trans = call.transitions as Array<Record<string, unknown>>;
      expect(trans).toHaveLength(1);
      expect(trans[0].to).toBe('completed');
      expect(trans[0].source).toBe('user');
    });

    it('normalizePermissionRequest fallback from data-level fields', async () => {
      const events = await createSessionAndPromptSse([
        'data: {"jsonrpc":"2.0","method":"event","params":{"type":"tool_call_update","data":{"toolCallId":"t11","toolName":"fs/write","description":"写入文件","resourcePaths":["/workspace/x.txt"]}}}\n\n',
        'data: {"jsonrpc":"2.0","method":"event","params":{"type":"done","data":{"stopReason":"end_turn"}}}\n\n',
      ]);

      const call = (events[0] as unknown as { type: 'tool_call'; call: Record<string, unknown> }).call;
      expect(call.permissionRequest).toEqual({
        description: '写入文件',
        resourcePaths: ['/workspace/x.txt'],
      });
    });

    it('normalizePermissionRequest with record value uses default description', async () => {
      const events = await createSessionAndPromptSse([
        'data: {"jsonrpc":"2.0","method":"event","params":{"type":"tool_call_update","data":{"toolCallId":"t12","toolName":"myTool","permissionRequest":{"resourcePaths":["/a"]}}}}\n\n',
        'data: {"jsonrpc":"2.0","method":"event","params":{"type":"done","data":{"stopReason":"end_turn"}}}\n\n',
      ]);

      const call = (events[0] as unknown as { type: 'tool_call'; call: Record<string, unknown> }).call;
      const perm = call.permissionRequest as Record<string, unknown>;
      expect(perm.description).toContain('myTool');
      expect(perm.resourcePaths).toEqual(['/a']);
    });

    it('buildToolCallEvent falls back to data.tool when toolName missing', async () => {
      const events = await createSessionAndPromptSse([
        'data: {"jsonrpc":"2.0","method":"event","params":{"type":"tool_call_start","data":{"toolCallId":"t13","tool":"alt_tool"}}}\n\n',
        'data: {"jsonrpc":"2.0","method":"event","params":{"type":"done","data":{"stopReason":"end_turn"}}}\n\n',
      ]);

      expect((events[0] as unknown as { type: 'tool_call'; call: { tool: string } }).call.tool).toBe('alt_tool');
    });

    it('buildToolCallEvent falls back to data.id when toolCallId missing', async () => {
      const events = await createSessionAndPromptSse([
        'data: {"jsonrpc":"2.0","method":"event","params":{"type":"tool_call_start","data":{"id":"alt-id","toolName":"run"}}}\n\n',
        'data: {"jsonrpc":"2.0","method":"event","params":{"type":"done","data":{"stopReason":"end_turn"}}}\n\n',
      ]);

      expect((events[0] as unknown as { type: 'tool_call'; call: { id: string } }).call.id).toBe('alt-id');
    });

    it('readToolCallStatus infers awaiting_permission when permissionRequest present', async () => {
      const events = await createSessionAndPromptSse([
        'data: {"jsonrpc":"2.0","method":"event","params":{"type":"tool_call_start","data":{"toolCallId":"t14","toolName":"fs/write","permissionRequest":{"description":"允许"}}}}\n\n',
        'data: {"jsonrpc":"2.0","method":"event","params":{"type":"done","data":{"stopReason":"end_turn"}}}\n\n',
      ]);

      expect((events[0] as unknown as { type: 'tool_call'; call: { status: string } }).call.status).toBe('awaiting_permission');
    });

    it('error event with fallback message from envelope.data', async () => {
      const events = await createSessionAndPromptSse([
        'data: {"jsonrpc":"2.0","method":"event","params":{"type":"error","data":"string-level error"}}\n\n',
      ]).catch((err: Error) => err);

      expect(events).toBeInstanceOf(Error);
      expect((events as Error).message).toBe('string-level error');
    });

    it('error event with no message uses default', async () => {
      const events = await createSessionAndPromptSse([
        'data: {"jsonrpc":"2.0","method":"event","params":{"type":"error","data":42}}\n\n',
      ]).catch((err: Error) => err);

      expect(events).toBeInstanceOf(Error);
      expect((events as Error).message).toBe('Sandbox agent error');
    });

    it('unknown container event type yields no events', async () => {
      const events = await createSessionAndPromptSse([
        'data: {"jsonrpc":"2.0","method":"event","params":{"type":"unknown_type","data":{}}}\n\n',
        'data: {"jsonrpc":"2.0","method":"event","params":{"type":"done","data":{"stopReason":"end_turn"}}}\n\n',
      ]);

      expect(events).toEqual([{ type: 'done', stopReason: 'end_turn' }]);
    });

    it('unrecognized parsed SSE data that is not AgentEvent or typed record yields no events', async () => {
      const events = await createSessionAndPromptSse([
        'data: {"foo":"bar"}\n\n',
        'data: {"type":"done","stopReason":"end_turn"}\n\n',
      ]);

      expect(events).toEqual([{ type: 'done', stopReason: 'end_turn' }]);
    });

    it('isAgentEvent validates plan type requires title and content', async () => {
      const events = await createSessionAndPromptSse([
        'data: {"type":"plan","title":"Plan A","content":"Do things"}\n\n',
        'data: {"type":"done","stopReason":"end_turn"}\n\n',
      ]);

      expect(events[0]).toEqual({
        type: 'plan',
        title: 'Plan A',
        content: 'Do things',
      });
    });

    it('isAgentEvent validates decision type requires suggestedContent', async () => {
      const events = await createSessionAndPromptSse([
        'data: {"type":"decision","suggestedContent":"suggest this"}\n\n',
        'data: {"type":"done","stopReason":"end_turn"}\n\n',
      ]);

      expect(events[0]).toEqual({
        type: 'decision',
        suggestedContent: 'suggest this',
      });
    });

    it('isAgentEvent rejects plan without title', async () => {
      const events = await createSessionAndPromptSse([
        'data: {"type":"plan","content":"missing title"}\n\n',
        'data: {"type":"done","stopReason":"end_turn"}\n\n',
      ]);

      expect(events).toEqual([{ type: 'done', stopReason: 'end_turn' }]);
    });

    it('isAgentEvent rejects decision without suggestedContent', async () => {
      const events = await createSessionAndPromptSse([
        'data: {"type":"decision","other":"field"}\n\n',
        'data: {"type":"done","stopReason":"end_turn"}\n\n',
      ]);

      expect(events).toEqual([{ type: 'done', stopReason: 'end_turn' }]);
    });

    it('isAgentEvent validates tool_call type requires record call', async () => {
      const events = await createSessionAndPromptSse([
        'data: {"type":"tool_call","call":"not-a-record"}\n\n',
        'data: {"type":"done","stopReason":"end_turn"}\n\n',
      ]);

      expect(events).toEqual([{ type: 'done', stopReason: 'end_turn' }]);
    });
  });

  describe('PTY SSE 事件翻译', () => {
    async function createSessionAndPromptSsePty(
      sseLines: string[],
      params = defaultParams,
    ): Promise<AgentEvent[]> {
      const session = await adapter.createSession(params);
      mockSandboxService.getSandboxSession.mockResolvedValue({
        id: 'sandbox-001',
        status: 'ready',
        containerId: 'abc123def456',
      });
      mockDockerService.healthCheck.mockResolvedValue(true);
      mockDockerService.getPromptUrl.mockResolvedValue(
        'http://127.0.0.1:49123/v1/prompt',
      );

      globalThis.fetch = vi.fn().mockResolvedValue(createSseResponse(sseLines));

      return collectEvents(
        adapter.prompt(session.id, [{ type: 'text', text: 'test' }]),
      );
    }

    it('pty_spawned SSE 事件翻译为 pty.spawned AgentEvent', async () => {
      const ptyInfo = {
        id: 'pty-001',
        pid: 1234,
        command: '/bin/bash',
        args: ['-l'],
        cwd: '/workspace',
        status: 'running',
        createdAt: '2026-03-25T00:00:00Z',
        lastActivityAt: '2026-03-25T00:00:00Z',
        title: 'bash',
        notifyOnExit: false,
        cols: 80,
        rows: 24,
        lineCount: 0,
      };
      const events = await createSessionAndPromptSsePty([
        `data: {"jsonrpc":"2.0","method":"event","params":{"type":"pty_spawned","data":{"sessionId":"pty-001","info":${JSON.stringify(ptyInfo)}}}}\n\n`,
        'data: {"jsonrpc":"2.0","method":"event","params":{"type":"done","data":{"stopReason":"end_turn"}}}\n\n',
      ]);

      expect(events[0]).toEqual({
        type: 'pty.spawned',
        sessionId: 'pty-001',
        info: ptyInfo,
      });
      expect(events[1]).toEqual({ type: 'done', stopReason: 'end_turn' });
    });

    it('pty_spawned 缺少 sessionId 时静默忽略', async () => {
      const events = await createSessionAndPromptSsePty([
        'data: {"jsonrpc":"2.0","method":"event","params":{"type":"pty_spawned","data":{"info":{}}}}\n\n',
        'data: {"jsonrpc":"2.0","method":"event","params":{"type":"done","data":{"stopReason":"end_turn"}}}\n\n',
      ]);

      expect(events).toEqual([{ type: 'done', stopReason: 'end_turn' }]);
    });

    it('pty_output SSE 事件翻译为 pty.output AgentEvent', async () => {
      const events = await createSessionAndPromptSsePty([
        'data: {"jsonrpc":"2.0","method":"event","params":{"type":"pty_output","data":{"sessionId":"pty-002","data":"hello world\\r\\n"}}}\n\n',
        'data: {"jsonrpc":"2.0","method":"event","params":{"type":"done","data":{"stopReason":"end_turn"}}}\n\n',
      ]);

      expect(events[0]).toEqual({
        type: 'pty.output',
        sessionId: 'pty-002',
        data: 'hello world\r\n',
      });
    });

    it('pty_output 缺少 sessionId 或 data 时静默忽略', async () => {
      const events = await createSessionAndPromptSsePty([
        'data: {"jsonrpc":"2.0","method":"event","params":{"type":"pty_output","data":{"sessionId":"pty-003"}}}\n\n',
        'data: {"jsonrpc":"2.0","method":"event","params":{"type":"pty_output","data":{"data":"orphan"}}}\n\n',
        'data: {"jsonrpc":"2.0","method":"event","params":{"type":"done","data":{"stopReason":"end_turn"}}}\n\n',
      ]);

      expect(events).toEqual([{ type: 'done', stopReason: 'end_turn' }]);
    });

    it('pty_exit SSE 事件翻译为 pty.exit AgentEvent（含 exitCode/exitSignal）', async () => {
      const events = await createSessionAndPromptSsePty([
        'data: {"jsonrpc":"2.0","method":"event","params":{"type":"pty_exit","data":{"sessionId":"pty-004","exitCode":0,"exitSignal":"SIGTERM"}}}\n\n',
        'data: {"jsonrpc":"2.0","method":"event","params":{"type":"done","data":{"stopReason":"end_turn"}}}\n\n',
      ]);

      expect(events[0]).toEqual({
        type: 'pty.exit',
        sessionId: 'pty-004',
        exitCode: 0,
        exitSignal: 'SIGTERM',
      });
    });

    it('pty_exit 无 exitCode/exitSignal 时省略可选字段', async () => {
      const events = await createSessionAndPromptSsePty([
        'data: {"jsonrpc":"2.0","method":"event","params":{"type":"pty_exit","data":{"sessionId":"pty-005"}}}\n\n',
        'data: {"jsonrpc":"2.0","method":"event","params":{"type":"done","data":{"stopReason":"end_turn"}}}\n\n',
      ]);

      expect(events[0]).toEqual({
        type: 'pty.exit',
        sessionId: 'pty-005',
      });
    });

    it('pty_exit 缺少 sessionId 时静默忽略', async () => {
      const events = await createSessionAndPromptSsePty([
        'data: {"jsonrpc":"2.0","method":"event","params":{"type":"pty_exit","data":{"exitCode":1}}}\n\n',
        'data: {"jsonrpc":"2.0","method":"event","params":{"type":"done","data":{"stopReason":"end_turn"}}}\n\n',
      ]);

      expect(events).toEqual([{ type: 'done', stopReason: 'end_turn' }]);
    });

    it('pty_killed SSE 事件翻译为 pty.killed AgentEvent', async () => {
      const events = await createSessionAndPromptSsePty([
        'data: {"jsonrpc":"2.0","method":"event","params":{"type":"pty_killed","data":{"sessionId":"pty-006"}}}\n\n',
        'data: {"jsonrpc":"2.0","method":"event","params":{"type":"done","data":{"stopReason":"end_turn"}}}\n\n',
      ]);

      expect(events[0]).toEqual({
        type: 'pty.killed',
        sessionId: 'pty-006',
      });
    });

    it('pty_killed 缺少 sessionId 时静默忽略', async () => {
      const events = await createSessionAndPromptSsePty([
        'data: {"jsonrpc":"2.0","method":"event","params":{"type":"pty_killed","data":{}}}\n\n',
        'data: {"jsonrpc":"2.0","method":"event","params":{"type":"done","data":{"stopReason":"end_turn"}}}\n\n',
      ]);

      expect(events).toEqual([{ type: 'done', stopReason: 'end_turn' }]);
    });

    it('pty_exit exitCode 为数字 0 时保留', async () => {
      const events = await createSessionAndPromptSsePty([
        'data: {"jsonrpc":"2.0","method":"event","params":{"type":"pty_exit","data":{"sessionId":"pty-zero","exitCode":0}}}\n\n',
        'data: {"jsonrpc":"2.0","method":"event","params":{"type":"done","data":{"stopReason":"end_turn"}}}\n\n',
      ]);

      expect(events[0]).toEqual({
        type: 'pty.exit',
        sessionId: 'pty-zero',
        exitCode: 0,
      });
    });

    it('pty_exit exitSignal 为数字时保留', async () => {
      const events = await createSessionAndPromptSsePty([
        'data: {"jsonrpc":"2.0","method":"event","params":{"type":"pty_exit","data":{"sessionId":"pty-sig","exitSignal":9}}}\n\n',
        'data: {"jsonrpc":"2.0","method":"event","params":{"type":"done","data":{"stopReason":"end_turn"}}}\n\n',
      ]);

      expect(events[0]).toEqual({
        type: 'pty.exit',
        sessionId: 'pty-sig',
        exitSignal: 9,
      });
    });
  });

  describe('PTY proxy 方法', () => {
    async function setupSandboxProxy() {
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
      return session;
    }

    it('listPtySessions 代理 GET 到容器', async () => {
      await setupSandboxProxy();
      const mockResult = [{ id: 'pty-001', status: 'running' }];
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue(mockResult),
      } as unknown as Response);

      const result = await adapter.listPtySessions(
        { executionId: 'exec-001' },
        'tenant-001',
      );

      expect(result).toEqual(mockResult);
      expect(globalThis.fetch).toHaveBeenCalledWith(
        'http://127.0.0.1:49123/v1/pty/sessions',
        expect.objectContaining({ method: 'GET' }),
      );
    });

    it('listPtySessions 容器返回非 ok 时抛出错误', async () => {
      await setupSandboxProxy();
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      } as unknown as Response);

      await expect(
        adapter.listPtySessions({ executionId: 'exec-001' }, 'tenant-001'),
      ).rejects.toThrow('PTY sessions 查询失败');
    });

    it('ptyBufferDump 代理 POST 到容器', async () => {
      await setupSandboxProxy();
      const mockResult = { lines: [{ lineNo: 1, text: 'hello' }], totalLines: 1 };
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue(mockResult),
      } as unknown as Response);

      const result = await adapter.ptyBufferDump(
        { executionId: 'exec-001' },
        'tenant-001',
        'pty-001',
        { offset: 0, limit: 100 },
      );

      expect(result).toEqual(mockResult);
      expect(globalThis.fetch).toHaveBeenCalledWith(
        'http://127.0.0.1:49123/v1/pty/buffer-dump',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ sessionId: 'pty-001', offset: 0, limit: 100 }),
        }),
      );
    });

    it('ptyBufferDump 含 pattern 选项', async () => {
      await setupSandboxProxy();
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ lines: [], totalLines: 0 }),
      } as unknown as Response);

      await adapter.ptyBufferDump(
        { executionId: 'exec-001' },
        'tenant-001',
        'pty-001',
        { pattern: 'error' },
      );

      expect(globalThis.fetch).toHaveBeenCalledWith(
        'http://127.0.0.1:49123/v1/pty/buffer-dump',
        expect.objectContaining({
          body: JSON.stringify({ sessionId: 'pty-001', pattern: 'error' }),
        }),
      );
    });

    it('ptyBufferDump 容器返回非 ok 时抛出错误', async () => {
      await setupSandboxProxy();
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
      } as unknown as Response);

      await expect(
        adapter.ptyBufferDump({ executionId: 'exec-001' }, 'tenant-001', 'pty-001'),
      ).rejects.toThrow('PTY buffer-dump 失败');
    });

    it('ptyWrite 代理 POST 到容器', async () => {
      await setupSandboxProxy();
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ success: true }),
      } as unknown as Response);

      const result = await adapter.ptyWrite(
        { executionId: 'exec-001' },
        'tenant-001',
        'pty-001',
        'ls -la\n',
      );

      expect(result).toEqual({ success: true });
      expect(globalThis.fetch).toHaveBeenCalledWith(
        'http://127.0.0.1:49123/v1/pty/write',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ sessionId: 'pty-001', data: 'ls -la\n' }),
        }),
      );
    });

    it('ptyWrite 容器返回非 ok 时抛出错误', async () => {
      await setupSandboxProxy();
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
      } as unknown as Response);

      await expect(
        adapter.ptyWrite({ executionId: 'exec-001' }, 'tenant-001', 'pty-001', 'x'),
      ).rejects.toThrow('PTY write 失败');
    });

    it('ptyWrite 使用 agentConversationId 绑定', async () => {
      await adapter.createSession({
        ...defaultParams,
        mode: 'conversation',
        context: { agentConversationId: 'conv-001' },
      });
      mockSandboxService.findByConversationId.mockResolvedValue({
        id: 'sandbox-conv',
        status: 'ready',
        containerId: 'conv-container',
      });
      mockDockerService.healthCheck.mockResolvedValue(true);
      mockDockerService.getPromptUrl.mockResolvedValue(
        'http://127.0.0.1:49456/v1/prompt',
      );
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ success: true }),
      } as unknown as Response);

      await adapter.ptyWrite(
        { agentConversationId: 'conv-001' },
        'tenant-001',
        'pty-conv',
        'echo hi\n',
      );

      expect(globalThis.fetch).toHaveBeenCalledWith(
        'http://127.0.0.1:49456/v1/pty/write',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ sessionId: 'pty-conv', data: 'echo hi\n' }),
        }),
      );
    });
  });

  describe('readSandboxBinding nested serverSandbox', () => {
    it('reads executionId from nested serverSandbox', async () => {
      const session = await adapter.createSession({
        ...defaultParams,
        context: {
          serverSandbox: { executionId: 'nested-exec-001' },
        },
      });

      expect(session.status).toBe('active');
      expect(mockSandboxService.getSandboxSession).toHaveBeenCalledWith(
        'nested-exec-001',
        'tenant-001',
      );
    });

    it('reads agentConversationId from nested serverSandbox', async () => {
      const session = await adapter.createSession({
        ...defaultParams,
        context: {
          serverSandbox: { agentConversationId: 'nested-conv-001' },
        },
      });

      expect(session.status).toBe('active');
      expect(mockSandboxService.findByConversationId).toHaveBeenCalledWith(
        'nested-conv-001',
        'tenant-001',
      );
    });

    it('top-level executionId takes precedence over nested', async () => {
      const session = await adapter.createSession({
        ...defaultParams,
        context: {
          executionId: 'top-exec',
          serverSandbox: { executionId: 'nested-exec' },
        },
      });

      expect(session.status).toBe('active');
      expect(mockSandboxService.getSandboxSession).toHaveBeenCalledWith(
        'top-exec',
        'tenant-001',
      );
    });
  });

  describe('prompt response edge cases', () => {
    it('prompt with response.ok=false throws error', async () => {
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

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        text: vi.fn().mockResolvedValue('Bad Gateway'),
      } as unknown as Response);

      await expect(
        collectEvents(
          adapter.prompt(session.id, [{ type: 'text', text: 'test' }]),
        ),
      ).rejects.toThrow();
    });

    it('prompt with null response body throws error', async () => {
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

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        body: null,
      } as unknown as Response);

      await expect(
        collectEvents(
          adapter.prompt(session.id, [{ type: 'text', text: 'test' }]),
        ),
      ).rejects.toThrow();
    });
  });

  describe('cancel edge cases', () => {
    it('cancel abort failure is swallowed', async () => {
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

      globalThis.fetch = vi.fn().mockRejectedValue(new Error('abort network failed'));

      await expect(adapter.cancel(session.id)).resolves.toBeUndefined();
      const loaded = await adapter.loadSession(session.id);
      expect(loaded.status).toBe('completed');
    });
  });

  describe('resolveSessionIdForConversation via session scan', () => {
    it('finds session by scanning sessions when conversationSessionIds has no entry', async () => {
      await adapter.createSession({
        ...defaultParams,
        mode: 'conversation',
        context: { agentConversationId: 'conv-scan' },
      });

      const pending = adapter.awaitToolPermission('conv-scan', {
        toolCallId: 'tool-scan',
        toolName: 'test',
      });

      await Promise.resolve();
      await adapter.resolveConversationToolPermission('conv-scan', 'tool-scan', 'approve');

      await expect(pending).resolves.toEqual({ allowed: true });
    });
  });
});
