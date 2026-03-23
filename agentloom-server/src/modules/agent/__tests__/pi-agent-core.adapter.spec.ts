import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ToolSet } from 'ai';
import { Logger } from '@nestjs/common';
import { runInTenantTransaction } from '../../../common/interceptors/tenant-transaction.context';
import { PiAgentCoreAdapter } from '../pi-agent-core.adapter';
import type { AgentEvent } from '../types/agent-event.types';
import type { CreateSessionParams } from '../types/agent-session.types';
import type { ContentBlock } from '../types/content-block.types';

const hoisted = vi.hoisted(() => {
  type MockAgentOptions = {
    streamFn?: unknown;
    sessionId?: string;
    beforeToolCall?: (
      context: Record<string, unknown>,
      signal?: AbortSignal,
    ) => Promise<{ block: boolean; reason?: string } | undefined>;
    initialState?: Record<string, unknown>;
  };

  class MockPiAgent {
    static instances: MockPiAgent[] = [];
    static script: ((agent: MockPiAgent, input: string) => Promise<void>) | null =
      null;

    readonly listeners = new Set<(event: Record<string, unknown>) => void>();
    readonly abortController = new AbortController();
    readonly setTools = vi.fn((tools: unknown[]) => {
      this.tools = tools;
    });
    readonly abort = vi.fn(() => {
      this.abortController.abort();
    });
    readonly prompt = vi.fn(async (input: string) => {
      this.promptInputs.push(input);
      await MockPiAgent.script?.(this, input);
    });

    streamFn: unknown;
    tools: unknown[] = [];
    promptInputs: string[] = [];

    constructor(public readonly options: MockAgentOptions = {}) {
      this.streamFn = options.streamFn;
      MockPiAgent.instances.push(this);
    }

    subscribe(listener: (event: Record<string, unknown>) => void): () => void {
      this.listeners.add(listener);
      return () => this.listeners.delete(listener);
    }

    emit(event: Record<string, unknown>): void {
      for (const listener of this.listeners) {
        listener(event);
      }
    }

    static reset(): void {
      MockPiAgent.instances = [];
      MockPiAgent.script = null;
    }
  }

  return {
    MockPiAgent,
    streamFnFactory: vi.fn((model: unknown, toolSet?: ToolSet) => ({
      model,
      toolSet,
      tag: 'mock-stream-fn',
    })),
    importPiAgentCore: vi.fn(async () => ({ Agent: MockPiAgent })),
    zodToTypeBox: vi.fn((schema: unknown) => ({ converted: schema })),
    getTenantDb: vi.fn((db: unknown) => db),
  };
});

vi.mock('../../../common/providers/tenant-aware-db.provider', () => ({
  getTenantDb: hoisted.getTenantDb,
}));

vi.mock('../../../common/interceptors/tenant-transaction.context', () => ({
  runInTenantTransaction: vi.fn(
    async (
      db: unknown,
      _tenantId: string,
      operation: (tenantDb: unknown) => Promise<unknown>,
    ) => operation(db),
  ),
}));

vi.mock('../pi-imports', () => ({
  importPiAgentCore: hoisted.importPiAgentCore,
}));

vi.mock('../stream-fn.adapter', () => ({
  createVercelStreamFn: hoisted.streamFnFactory,
}));

vi.mock('../tool-schema-converter', () => ({
  zodToTypeBox: hoisted.zodToTypeBox,
}));

function createSelectChain(result: unknown) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi
        .fn()
        .mockResolvedValue(Array.isArray(result) ? result : [result]),
    }),
  };
}

async function collectEvents(
  iterable: AsyncIterable<AgentEvent>,
): Promise<AgentEvent[]> {
  const events: AgentEvent[] = [];
  for await (const event of iterable) {
    events.push(event);
  }
  return events;
}

async function collectIteratorRest(
  iterator: AsyncIterator<AgentEvent>,
): Promise<AgentEvent[]> {
  const events: AgentEvent[] = [];
  while (true) {
    const next = await iterator.next();
    if (next.done) {
      return events;
    }
    events.push(next.value);
  }
}

describe('PiAgentCoreAdapter', () => {
  let adapter: PiAgentCoreAdapter;
  let mockDb: { select: ReturnType<typeof vi.fn> };
  let mockPiAiAdapter: { getModel: ReturnType<typeof vi.fn> };

  const NOW = new Date('2026-03-23T10:00:00.000Z');
  const defaultModelConfig = {
    id: 'model-config-001',
    tenantId: 'tenant-001',
    provider: 'openai',
    modelName: 'gpt-4.1-mini',
    apiKeyId: 'api-key-001',
    isDefault: true,
  };

  function createParams(
    overrides: Partial<CreateSessionParams> = {},
  ): CreateSessionParams {
    return {
      agentId: 'agent-001',
      mode: 'conversation',
      tenantId: 'tenant-001',
      systemPrompt: '你是一个测试助手',
      ...overrides,
    };
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    vi.spyOn(Logger.prototype, 'debug').mockImplementation(() => {});
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});

    hoisted.MockPiAgent.reset();
    hoisted.streamFnFactory.mockClear();
    hoisted.importPiAgentCore.mockClear();
    hoisted.zodToTypeBox.mockClear();
    hoisted.getTenantDb.mockClear();

    mockDb = { select: vi.fn() };
    mockPiAiAdapter = { getModel: vi.fn().mockResolvedValue('mock-language-model') };

    type AdapterArgs = ConstructorParameters<typeof PiAgentCoreAdapter>;
    adapter = new PiAgentCoreAdapter(
      mockDb as unknown as AdapterArgs[0],
      mockPiAiAdapter as unknown as AdapterArgs[1],
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('createSession', () => {
    it('会创建 conversation session 并保留上下文元信息', async () => {
      mockDb.select.mockReturnValueOnce(createSelectChain([defaultModelConfig]));

      const session = await adapter.createSession(
        createParams({
          cwd: '/workspace/demo',
          mcpServers: {
            docs: {
              transportType: 'streamable_http',
              url: 'https://example.com/mcp',
            },
          },
          serverSandbox: { executionId: 'exec-001' },
        }),
      );

      expect(session).toMatchObject({
        agentId: 'agent-001',
        mode: 'conversation',
        tenantId: 'tenant-001',
        status: 'active',
        context: {
          history: [],
          cwd: '/workspace/demo',
          mcpServers: {
            docs: {
              transportType: 'streamable_http',
              url: 'https://example.com/mcp',
            },
          },
          serverSandbox: { executionId: 'exec-001' },
        },
      });
    });

    it('会解析模型并通过动态导入创建 pi Agent 实例', async () => {
      mockDb.select.mockReturnValueOnce(createSelectChain([defaultModelConfig]));

      const session = await adapter.createSession(createParams());
      const agent = hoisted.MockPiAgent.instances[0];

      expect(hoisted.importPiAgentCore).toHaveBeenCalledTimes(1);
      expect(mockPiAiAdapter.getModel).toHaveBeenCalledWith(defaultModelConfig);
      expect(hoisted.streamFnFactory).toHaveBeenCalledWith(
        'mock-language-model',
        undefined,
      );
      expect(agent.options.sessionId).toBe(session.id);
      expect(agent.options.initialState).toMatchObject({
        systemPrompt: '你是一个测试助手',
        model: 'mock-language-model',
        tools: [],
      });
      expect(typeof agent.options.beforeToolCall).toBe('function');
    });

    it('workflow 模式会把初始 context 映射为 workflowState', async () => {
      mockDb.select.mockReturnValueOnce(createSelectChain([defaultModelConfig]));

      const session = await adapter.createSession(
        createParams({
          mode: 'workflow',
          context: {
            executionId: 'exec-001',
            stepId: 'step-001',
          },
        }),
      );

      expect(session.context.workflowState).toEqual({
        executionId: 'exec-001',
        stepId: 'step-001',
      });
    });

    it('缺少 tenantId 时会拒绝创建 session', async () => {
      await expect(
        adapter.createSession(
          createParams({
            tenantId: undefined,
          }),
        ),
      ).rejects.toThrow(/缺少 tenantId/i);
    });
  });

  describe('loadSession', () => {
    it('会返回已创建的 session', async () => {
      mockDb.select.mockReturnValueOnce(createSelectChain([defaultModelConfig]));
      const session = await adapter.createSession(createParams());

      await expect(adapter.loadSession(session.id)).resolves.toEqual(session);
    });

    it('不存在的 session 会抛错', async () => {
      await expect(adapter.loadSession('missing')).rejects.toThrow(/not found/i);
    });
  });

  describe('tool provider lifecycle', () => {
    it('prompt 前注册 provider 会刷新 streamFn 并调用 zodToTypeBox 转换工具 schema', async () => {
      mockDb.select.mockReturnValueOnce(createSelectChain([defaultModelConfig]));
      const session = await adapter.createSession(createParams());
      const toolSet = {
        'docs/search': {
          description: '搜索文档',
          inputSchema: { type: 'zod-object' },
          execute: vi.fn().mockResolvedValue({ hits: [] }),
        },
      } as unknown as ToolSet;

      adapter.registerSessionToolProvider(session.id, () => toolSet);
      hoisted.MockPiAgent.script = async (agent) => {
        agent.emit({
          type: 'agent_end',
          messages: [{ role: 'assistant', stopReason: 'stop' }],
        });
      };

      await collectEvents(adapter.prompt(session.id, [{ type: 'text', text: 'hi' }]));

      const agent = hoisted.MockPiAgent.instances[0];
      expect(hoisted.zodToTypeBox).toHaveBeenCalledWith({ type: 'zod-object' });
      expect(agent.setTools).toHaveBeenCalledWith([
        expect.objectContaining({
          name: 'docs/search',
          label: 'docs/search',
          description: '搜索文档',
          parameters: { converted: { type: 'zod-object' } },
        }),
      ]);
      expect(hoisted.streamFnFactory).toHaveBeenLastCalledWith(
        'mock-language-model',
        toolSet,
      );
    });

    it('unregister 后 prompt 不再注入 tools', async () => {
      mockDb.select.mockReturnValueOnce(createSelectChain([defaultModelConfig]));
      const session = await adapter.createSession(createParams());
      adapter.registerSessionToolProvider(session.id, () => ({
        toolA: {
          description: 'A',
          inputSchema: { type: 'schema' },
          execute: vi.fn(),
        },
      }) as unknown as ToolSet);
      adapter.unregisterSessionToolProvider(session.id);

      hoisted.MockPiAgent.script = async (agent) => {
        agent.emit({
          type: 'agent_end',
          messages: [{ role: 'assistant', stopReason: 'stop' }],
        });
      };

      await collectEvents(adapter.prompt(session.id, [{ type: 'text', text: 'hi' }]));

      const agent = hoisted.MockPiAgent.instances[0];
      expect(agent.setTools).toHaveBeenCalledWith([]);
      expect(hoisted.zodToTypeBox).not.toHaveBeenCalled();
    });
  });

  describe('prompt event translation', () => {
    it('会序列化 ContentBlock 并调用 agent.prompt(text)', async () => {
      mockDb.select.mockReturnValueOnce(createSelectChain([defaultModelConfig]));
      const session = await adapter.createSession(createParams());
      const blocks: ContentBlock[] = [
        { type: 'text', text: '看这张图' },
        { type: 'image', data: 'base64', mimeType: 'image/png' },
        { type: 'resource_link', uri: 'https://docs.example.com' },
      ];

      hoisted.MockPiAgent.script = async (agent, input) => {
        expect(input).toBe('看这张图\n\n[image:image/png]\n\n[resource_link:https://docs.example.com]');
        agent.emit({
          type: 'agent_end',
          messages: [{ role: 'assistant', stopReason: 'stop' }],
        });
      };

      await collectEvents(adapter.prompt(session.id, blocks));

      expect(hoisted.MockPiAgent.instances[0]?.prompt).toHaveBeenCalledWith(
        '看这张图\n\n[image:image/png]\n\n[resource_link:https://docs.example.com]',
      );
      const loaded = await adapter.loadSession(session.id);
      expect(loaded.context.history).toEqual(blocks);
    });

    it('会把 message_update(text_delta) 映射为 message_chunk', async () => {
      mockDb.select.mockReturnValueOnce(createSelectChain([defaultModelConfig]));
      const session = await adapter.createSession(createParams());

      hoisted.MockPiAgent.script = async (agent) => {
        agent.emit({
          type: 'message_update',
          assistantMessageEvent: { type: 'text_delta', delta: '你好，' },
        });
        agent.emit({
          type: 'message_update',
          assistantMessageEvent: { type: 'text_delta', delta: '主人' },
        });
        agent.emit({
          type: 'agent_end',
          messages: [{ role: 'assistant', stopReason: 'stop' }],
        });
      };

      await expect(
        collectEvents(adapter.prompt(session.id, [{ type: 'text', text: 'hi' }])),
      ).resolves.toEqual([
        { type: 'message_chunk', content: '你好，' },
        { type: 'message_chunk', content: '主人' },
        { type: 'done', stopReason: 'end_turn' },
      ]);

      expect((await adapter.loadSession(session.id)).context.history).toEqual([
        { type: 'text', text: 'hi' },
        { type: 'text', text: '你好，主人' },
      ]);
    });

    it('会忽略非 text_delta 的 message_update', async () => {
      mockDb.select.mockReturnValueOnce(createSelectChain([defaultModelConfig]));
      const session = await adapter.createSession(createParams());

      hoisted.MockPiAgent.script = async (agent) => {
        agent.emit({
          type: 'message_update',
          assistantMessageEvent: { type: 'thinking_delta', delta: '思考中' },
        });
        agent.emit({
          type: 'agent_end',
          messages: [{ role: 'assistant', stopReason: 'stop' }],
        });
      };

      await expect(
        collectEvents(adapter.prompt(session.id, [{ type: 'text', text: 'hi' }])),
      ).resolves.toEqual([{ type: 'done', stopReason: 'end_turn' }]);
    });

    it('会把 tool_execution_start 映射为 in_progress tool_call', async () => {
      mockDb.select.mockReturnValueOnce(createSelectChain([defaultModelConfig]));
      const session = await adapter.createSession(createParams());

      hoisted.MockPiAgent.script = async (agent) => {
        agent.emit({
          type: 'tool_execution_start',
          toolCallId: 'call-1',
          toolName: 'docs/search',
          args: { query: 'agentloom' },
        });
        agent.emit({
          type: 'agent_end',
          messages: [{ role: 'assistant', stopReason: 'toolUse' }],
        });
      };

      await expect(
        collectEvents(adapter.prompt(session.id, [{ type: 'text', text: 'hi' }])),
      ).resolves.toEqual([
        {
          type: 'tool_call',
          call: {
            id: 'call-1',
            tool: 'docs/search',
            args: { query: 'agentloom' },
            status: 'in_progress',
          },
        },
        { type: 'done', stopReason: 'tool_use' },
      ]);
    });

    it('会把 tool_execution_end(success) 映射为 completed tool_call', async () => {
      mockDb.select.mockReturnValueOnce(createSelectChain([defaultModelConfig]));
      const session = await adapter.createSession(createParams());

      hoisted.MockPiAgent.script = async (agent) => {
        agent.emit({
          type: 'tool_execution_end',
          toolCallId: 'call-1',
          toolName: 'docs/search',
          result: {
            details: { hits: ['a'] },
          },
          isError: false,
        });
        agent.emit({
          type: 'agent_end',
          messages: [{ role: 'assistant', stopReason: 'stop' }],
        });
      };

      await expect(
        collectEvents(adapter.prompt(session.id, [{ type: 'text', text: 'hi' }])),
      ).resolves.toEqual([
        {
          type: 'tool_call',
          call: {
            id: 'call-1',
            tool: 'docs/search',
            args: {},
            status: 'completed',
            result: { hits: ['a'] },
          },
        },
        { type: 'done', stopReason: 'end_turn' },
      ]);
    });

    it('会把 tool_execution_end(error) 映射为 failed tool_call', async () => {
      mockDb.select.mockReturnValueOnce(createSelectChain([defaultModelConfig]));
      const session = await adapter.createSession(createParams());

      hoisted.MockPiAgent.script = async (agent) => {
        agent.emit({
          type: 'tool_execution_end',
          toolCallId: 'call-err',
          toolName: 'docs/search',
          result: {
            content: [{ type: 'text', text: '权限不足' }],
          },
          isError: true,
        });
        agent.emit({
          type: 'agent_end',
          messages: [{ role: 'assistant', stopReason: 'stop' }],
        });
      };

      await expect(
        collectEvents(adapter.prompt(session.id, [{ type: 'text', text: 'hi' }])),
      ).resolves.toEqual([
        {
          type: 'tool_call',
          call: {
            id: 'call-err',
            tool: 'docs/search',
            args: {},
            status: 'failed',
            error: '权限不足',
          },
        },
        { type: 'done', stopReason: 'end_turn' },
      ]);
    });

    it.each([
      ['stop', 'end_turn'],
      ['length', 'max_tokens'],
      ['toolUse', 'tool_use'],
      ['aborted', 'cancelled'],
    ] as const)(
      '会把 agent_end stopReason=%s 映射为 %s',
      async (source, target) => {
        mockDb.select.mockReturnValueOnce(createSelectChain([defaultModelConfig]));
        const session = await adapter.createSession(createParams());

        hoisted.MockPiAgent.script = async (agent) => {
          agent.emit({
            type: 'agent_end',
            messages: [{ role: 'assistant', stopReason: source }],
          });
        };

        await expect(
          collectEvents(adapter.prompt(session.id, [{ type: 'text', text: 'hi' }])),
        ).resolves.toEqual([{ type: 'done', stopReason: target }]);
      },
    );
  });

  describe('permission gate', () => {
    it('approve 后会继续执行工具并输出 tool_call + done', async () => {
      mockDb.select.mockReturnValueOnce(createSelectChain([defaultModelConfig]));
      const session = await adapter.createSession(createParams());

      hoisted.MockPiAgent.script = async (agent) => {
        const result = await agent.options.beforeToolCall?.(
          {
            toolCall: {
              id: 'call-1',
              name: 'filesystem.read',
              arguments: { path: '/tmp/demo.txt' },
            },
            args: { path: '/tmp/demo.txt' },
          },
          agent.abortController.signal,
        );

        if (!result?.block) {
          agent.emit({
            type: 'tool_execution_start',
            toolCallId: 'call-1',
            toolName: 'filesystem.read',
            args: { path: '/tmp/demo.txt' },
          });
          agent.emit({
            type: 'tool_execution_end',
            toolCallId: 'call-1',
            toolName: 'filesystem.read',
            result: { details: { content: 'ok' } },
            isError: false,
          });
        }

        agent.emit({
          type: 'agent_end',
          messages: [{ role: 'assistant', stopReason: 'stop' }],
        });
      };

      const iterator = adapter.prompt(session.id, [{ type: 'text', text: 'read' }])[Symbol.asyncIterator]();
      const first = await iterator.next();

      expect(first.value).toEqual({
        type: 'tool_call',
        call: {
          id: 'call-1',
          tool: 'filesystem.read',
          args: { path: '/tmp/demo.txt' },
          status: 'awaiting_permission',
          permissionRequest: {
            description: '工具 filesystem.read 需要主人授权后才能执行。',
            resourcePaths: ['/tmp/demo.txt'],
          },
        },
      });

      await adapter.resolveToolPermission(session.id, 'call-1', 'approve');

      const rest = await collectIteratorRest(iterator);
      expect(rest).toEqual([
        {
          type: 'tool_call',
          call: {
            id: 'call-1',
            tool: 'filesystem.read',
            args: { path: '/tmp/demo.txt' },
            status: 'in_progress',
          },
        },
        {
          type: 'tool_call',
          call: {
            id: 'call-1',
            tool: 'filesystem.read',
            args: {},
            status: 'completed',
            result: { content: 'ok' },
          },
        },
        { type: 'done', stopReason: 'end_turn' },
      ]);
    });

    it('deny 后会发出 denied 并阻止后续错误结果重复透传', async () => {
      mockDb.select.mockReturnValueOnce(createSelectChain([defaultModelConfig]));
      const session = await adapter.createSession(createParams());

      hoisted.MockPiAgent.script = async (agent) => {
        const result = await agent.options.beforeToolCall?.(
          {
            toolCall: {
              id: 'call-2',
              name: 'filesystem.write',
              arguments: { path: '/tmp/demo.txt' },
            },
            args: { path: '/tmp/demo.txt' },
          },
          agent.abortController.signal,
        );

        if (result?.block) {
          agent.emit({
            type: 'tool_execution_end',
            toolCallId: 'call-2',
            toolName: 'filesystem.write',
            result: { content: [{ type: 'text', text: result.reason }] },
            isError: true,
          });
        }

        agent.emit({
          type: 'agent_end',
          messages: [{ role: 'assistant', stopReason: 'stop' }],
        });
      };

      const iterator = adapter.prompt(session.id, [{ type: 'text', text: 'write' }])[Symbol.asyncIterator]();
      expect((await iterator.next()).value).toMatchObject({
        type: 'tool_call',
        call: { id: 'call-2', status: 'awaiting_permission' },
      });

      await adapter.resolveToolPermission(session.id, 'call-2', 'deny');

      const rest = await collectIteratorRest(iterator);
      expect(rest).toEqual([
        {
          type: 'tool_call',
          call: {
            id: 'call-2',
            tool: 'filesystem.write',
            args: { path: '/tmp/demo.txt' },
            status: 'denied',
            permissionRequest: {
              description: '工具 filesystem.write 需要主人授权后才能执行。',
              resourcePaths: ['/tmp/demo.txt'],
            },
          },
        },
        { type: 'done', stopReason: 'end_turn' },
      ]);
    });

    it('30 秒超时会默认 deny', async () => {
      mockDb.select.mockReturnValueOnce(createSelectChain([defaultModelConfig]));
      const session = await adapter.createSession(createParams());

      hoisted.MockPiAgent.script = async (agent) => {
        const result = await agent.options.beforeToolCall?.(
          {
            toolCall: {
              id: 'call-timeout',
              name: 'filesystem.write',
              arguments: { path: '/tmp/demo.txt' },
            },
            args: { path: '/tmp/demo.txt' },
          },
          agent.abortController.signal,
        );

        if (result?.block) {
          agent.emit({
            type: 'agent_end',
            messages: [{ role: 'assistant', stopReason: 'stop' }],
          });
        }
      };

      const iterator = adapter.prompt(session.id, [{ type: 'text', text: 'write' }])[Symbol.asyncIterator]();
      expect((await iterator.next()).value).toMatchObject({
        type: 'tool_call',
        call: { id: 'call-timeout', status: 'awaiting_permission' },
      });

      await vi.advanceTimersByTimeAsync(30_000);

      const rest = await collectIteratorRest(iterator);
      expect(rest).toEqual([
        {
          type: 'tool_call',
          call: {
            id: 'call-timeout',
            tool: 'filesystem.write',
            args: { path: '/tmp/demo.txt' },
            status: 'denied',
            permissionRequest: {
              description: '工具 filesystem.write 需要主人授权后才能执行。',
              resourcePaths: ['/tmp/demo.txt'],
            },
          },
        },
        { type: 'done', stopReason: 'end_turn' },
      ]);
    });

    it('未命中 pending gate 时 resolveToolPermission 会抛错', async () => {
      await expect(
        adapter.resolveToolPermission('missing-session', 'missing-call', 'approve'),
      ).rejects.toThrow(/no pending tool permission/i);
    });
  });

  describe('cancel', () => {
    it('会调用 agent.abort 并把 session 标记为 completed', async () => {
      mockDb.select.mockReturnValueOnce(createSelectChain([defaultModelConfig]));
      const session = await adapter.createSession(createParams());
      const agent = hoisted.MockPiAgent.instances[0];

      await adapter.cancel(session.id);

      expect(agent.abort).toHaveBeenCalledTimes(1);
      expect((await adapter.loadSession(session.id)).status).toBe('completed');
    });

    it('取消不存在的 session 不会抛错', async () => {
      await expect(adapter.cancel('missing')).resolves.toBeUndefined();
    });
  });

  it('会通过 runInTenantTransaction 解析默认模型配置', async () => {
    mockDb.select.mockReturnValueOnce(createSelectChain([defaultModelConfig]));

    await adapter.createSession(createParams());

    expect(runInTenantTransaction).toHaveBeenCalledWith(
      mockDb,
      'tenant-001',
      expect.any(Function),
    );
    expect(hoisted.getTenantDb).toHaveBeenCalledWith(mockDb);
  });
});
