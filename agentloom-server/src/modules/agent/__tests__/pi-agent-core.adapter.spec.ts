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
    typeBoxToZod: vi.fn((schema: unknown) => ({ typeBoxConverted: schema })),
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
  typeBoxToZod: hoisted.typeBoxToZod,
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
  let mockMcpService: {
    resolveRuntimeConnection: ReturnType<typeof vi.fn>;
    callRuntimeTool: ReturnType<typeof vi.fn>;
  };
  let mockRagService: { search: ReturnType<typeof vi.fn> };

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
    hoisted.typeBoxToZod.mockClear();
    hoisted.zodToTypeBox.mockClear();
    hoisted.getTenantDb.mockClear();

    mockDb = { select: vi.fn() };
    mockPiAiAdapter = { getModel: vi.fn().mockResolvedValue('mock-language-model') };
    mockMcpService = {
      resolveRuntimeConnection: vi.fn().mockResolvedValue({
        transportType: 'streamable_http',
        url: 'https://example.com/mcp',
      }),
      callRuntimeTool: vi.fn().mockResolvedValue({ hits: ['doc-1'] }),
    };
    mockRagService = {
      search: vi.fn().mockResolvedValue([
        {
          chunkId: 'chunk-1',
          score: 0.91,
          content: 'AgentLoom 文档',
          location: null,
          documentId: 'doc-1',
          knowledgeBaseId: 'kb-1',
          chunkIndex: 0,
        },
      ]),
    };

    type AdapterArgs = ConstructorParameters<typeof PiAgentCoreAdapter>;
    adapter = new PiAgentCoreAdapter(
      mockDb as unknown as AdapterArgs[0],
      mockPiAiAdapter as unknown as AdapterArgs[1],
      mockMcpService as unknown as AdapterArgs[2],
      mockRagService as unknown as AdapterArgs[3],
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

    it('会保留 runtimeConfig 到 session 快照', async () => {
      mockDb.select.mockReturnValueOnce(createSelectChain([defaultModelConfig]));
      const runtimeConfig = {
        tools: [
          {
            toolId: 'http-tool-1',
            toolType: 'http' as const,
            name: 'search_docs',
            url: 'https://example.com/search',
            method: 'GET' as const,
            enabled: true,
          },
        ],
      };

      const session = await adapter.createSession(
        createParams({
          runtimeConfig,
        }),
      );

      expect(session.runtimeConfig).toEqual(runtimeConfig);
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

    it('会把 runtimeConfig 的 MCP 工具与额外 provider 一起注入 prompt', async () => {
      mockDb.select
        .mockReturnValueOnce(
          createSelectChain([
            {
              mcpServerConfigId: 'mcp-server-1',
              name: 'searchDocs',
              title: '搜索文档',
              description: '从 MCP 文档源中检索内容',
              inputSchema: {
                type: 'object',
                properties: {
                  query: { type: 'string' },
                },
                required: ['query'],
              },
            },
          ]),
        )
        .mockReturnValueOnce(createSelectChain([defaultModelConfig]));
      hoisted.typeBoxToZod.mockReturnValueOnce({ type: 'mcp-zod' });

      const session = await adapter.createSession(
        createParams({
          runtimeConfig: {
            tools: [
              {
                toolId: 'mcp-tool-1',
                toolType: 'mcp',
                name: 'search_docs',
                description: '搜索产品文档',
                enabled: true,
                mcpToolDefinitionId: 'tool-def-1',
                parameterOverrides: { locale: 'zh-CN' },
              },
            ],
          },
        }),
      );
      adapter.registerSessionToolProvider(
        session.id,
        () =>
          ({
            manual_tool: {
              description: '手工注册工具',
              inputSchema: { type: 'manual-schema' },
              execute: vi.fn().mockResolvedValue({ ok: true }),
            },
          }) as unknown as ToolSet,
      );

      hoisted.MockPiAgent.script = async (agent) => {
        agent.emit({
          type: 'agent_end',
          messages: [{ role: 'assistant', stopReason: 'stop' }],
        });
      };

      await collectEvents(adapter.prompt(session.id, [{ type: 'text', text: 'hi' }]));

      const agent = hoisted.MockPiAgent.instances[0];
      expect(agent.setTools).toHaveBeenLastCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ name: 'search_docs' }),
          expect.objectContaining({ name: 'manual_tool' }),
        ]),
      );
      const injectedTools = agent.setTools.mock.lastCall?.[0] as Array<{
        name: string;
        execute: (toolCallId: string, params: unknown) => Promise<{ details: unknown }>;
      }>;
      const runtimeTool = injectedTools.find((tool) => tool.name === 'search_docs');
      await expect(
        runtimeTool?.execute('call-mcp', { query: 'AgentLoom' }),
      ).resolves.toMatchObject({
        details: { hits: ['doc-1'] },
      });
      expect(hoisted.typeBoxToZod).toHaveBeenCalledWith({
        type: 'object',
        properties: {
          query: { type: 'string' },
        },
        required: ['query'],
      });
      expect(mockMcpService.resolveRuntimeConnection).toHaveBeenCalledWith(
        'mcp-server-1',
        'tenant-001',
      );
      expect(mockMcpService.callRuntimeTool).toHaveBeenCalledWith(
        {
          transportType: 'streamable_http',
          url: 'https://example.com/mcp',
        },
        'searchDocs',
        {
          query: 'AgentLoom',
          locale: 'zh-CN',
        },
      );
    });

    it('会把 knowledgeBindings 注入为可调用检索工具', async () => {
      mockDb.select.mockReturnValueOnce(createSelectChain([defaultModelConfig]));

      const session = await adapter.createSession(
        createParams({
          runtimeConfig: {
            knowledgeBindings: [
              {
                knowledgeBaseId: 'kb-1',
                topK: 5,
                similarityThreshold: 0.42,
                enabled: true,
              },
            ],
          },
        }),
      );

      hoisted.MockPiAgent.script = async (agent) => {
        const knowledgeTool = agent.tools.find(
          (tool) =>
            (tool as { name?: string }).name === 'searchKnowledge_kb-1',
        ) as {
          execute: (toolCallId: string, params: unknown) => Promise<{
            details: unknown;
          }>;
        };

        await expect(
          knowledgeTool.execute('call-kb', { query: 'AgentLoom', topK: 2 }),
        ).resolves.toMatchObject({
          details: {
            knowledgeBaseId: 'kb-1',
            total: 1,
            results: expect.any(Array),
          },
        });

        agent.emit({
          type: 'agent_end',
          messages: [{ role: 'assistant', stopReason: 'stop' }],
        });
      };

      await collectEvents(adapter.prompt(session.id, [{ type: 'text', text: 'search' }]));

      const agent = hoisted.MockPiAgent.instances[0];
      expect(agent.setTools).toHaveBeenLastCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ name: 'searchKnowledge_kb-1' }),
        ]),
      );
      expect(mockRagService.search).toHaveBeenCalledWith('AgentLoom', 'tenant-001', {
        knowledgeBaseId: 'kb-1',
        limit: 2,
        scoreThreshold: 0.42,
      });
    });

    it('runtimeConfig 的空 tools 与空 knowledgeBindings 不会破坏 session 创建', async () => {
      mockDb.select.mockReturnValueOnce(createSelectChain([defaultModelConfig]));
      const session = await adapter.createSession(
        createParams({
          runtimeConfig: {
            tools: [],
            knowledgeBindings: [],
          },
        }),
      );

      hoisted.MockPiAgent.script = async (agent) => {
        expect(agent.tools).toEqual([]);
        agent.emit({
          type: 'agent_end',
          messages: [{ role: 'assistant', stopReason: 'stop' }],
        });
      };

      await collectEvents(adapter.prompt(session.id, [{ type: 'text', text: 'noop' }]));

      const agent = hoisted.MockPiAgent.instances[0];
      expect(agent.setTools).toHaveBeenLastCalledWith([]);
      expect(hoisted.typeBoxToZod).not.toHaveBeenCalled();
      expect(mockMcpService.resolveRuntimeConnection).not.toHaveBeenCalled();
      expect(mockRagService.search).not.toHaveBeenCalled();
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

  describe('convertToolSetToPiTools branch coverage', () => {
    function registerToolProvider(
      sessionId: string,
      toolSet: ToolSet,
    ): void {
      adapter.registerSessionToolProvider(sessionId, async () => toolSet);
    }

    it('tool.execute 缺失时返回 "Tool has no execute function"', async () => {
      mockDb.select.mockReturnValueOnce(createSelectChain([defaultModelConfig]));
      const session = await adapter.createSession(createParams());

      registerToolProvider(session.id, {
        myTool: {
          description: 'no-exec',
          inputSchema: { _type: 'ZodString' } as never,
        },
      } as ToolSet);

      hoisted.MockPiAgent.script = async (agent) => {
        const piTool = agent.tools[0] as {
          execute: (id: string, params: unknown) => Promise<unknown>;
        };
        const result = await piTool.execute('call-no-exec', {});
        expect(result).toEqual({
          content: [{ type: 'text', text: 'Tool has no execute function' }],
          details: null,
        });

        agent.emit({
          type: 'agent_end',
          messages: [{ role: 'assistant', stopReason: 'stop' }],
        });
      };

      await collectEvents(
        adapter.prompt(session.id, [{ type: 'text', text: 'go' }]),
      );
    });

    it('tool.execute 返回 null 时 text 为空字符串', async () => {
      mockDb.select.mockReturnValueOnce(createSelectChain([defaultModelConfig]));
      const session = await adapter.createSession(createParams());

      registerToolProvider(session.id, {
        myTool: {
          description: 'null-tool',
          inputSchema: { _type: 'ZodString' } as never,
          execute: vi.fn().mockResolvedValue(null),
        },
      } as unknown as ToolSet);

      hoisted.MockPiAgent.script = async (agent) => {
        const piTool = agent.tools[0] as {
          execute: (id: string, params: unknown) => Promise<unknown>;
        };
        const result = await piTool.execute('call-null', {});
        expect(result).toEqual({
          content: [{ type: 'text', text: '' }],
          details: null,
        });

        agent.emit({
          type: 'agent_end',
          messages: [{ role: 'assistant', stopReason: 'stop' }],
        });
      };

      await collectEvents(
        adapter.prompt(session.id, [{ type: 'text', text: 'go' }]),
      );
    });

    it('tool.execute 返回 string 时直接使用该 string', async () => {
      mockDb.select.mockReturnValueOnce(createSelectChain([defaultModelConfig]));
      const session = await adapter.createSession(createParams());

      registerToolProvider(session.id, {
        myTool: {
          description: 'str-tool',
          inputSchema: { _type: 'ZodString' } as never,
          execute: vi.fn().mockResolvedValue('hello world'),
        },
      } as unknown as ToolSet);

      hoisted.MockPiAgent.script = async (agent) => {
        const piTool = agent.tools[0] as {
          execute: (id: string, params: unknown) => Promise<unknown>;
        };
        const result = await piTool.execute('call-str', {});
        expect(result).toEqual({
          content: [{ type: 'text', text: 'hello world' }],
          details: 'hello world',
        });

        agent.emit({
          type: 'agent_end',
          messages: [{ role: 'assistant', stopReason: 'stop' }],
        });
      };

      await collectEvents(
        adapter.prompt(session.id, [{ type: 'text', text: 'go' }]),
      );
    });

    it('tool.execute 返回 object 时 JSON.stringify', async () => {
      mockDb.select.mockReturnValueOnce(createSelectChain([defaultModelConfig]));
      const session = await adapter.createSession(createParams());

      registerToolProvider(session.id, {
        myTool: {
          description: 'obj-tool',
          inputSchema: { _type: 'ZodString' } as never,
          execute: vi.fn().mockResolvedValue({ key: 'value' }),
        },
      } as unknown as ToolSet);

      hoisted.MockPiAgent.script = async (agent) => {
        const piTool = agent.tools[0] as {
          execute: (id: string, params: unknown) => Promise<unknown>;
        };
        const result = await piTool.execute('call-obj', {});
        expect(result).toEqual({
          content: [{ type: 'text', text: '{"key":"value"}' }],
          details: { key: 'value' },
        });

        agent.emit({
          type: 'agent_end',
          messages: [{ role: 'assistant', stopReason: 'stop' }],
        });
      };

      await collectEvents(
        adapter.prompt(session.id, [{ type: 'text', text: 'go' }]),
      );
    });
  });

  describe('translatePiEvent branch coverage', () => {
    it('message_update 非 text_delta 类型时返回空', async () => {
      mockDb.select.mockReturnValueOnce(createSelectChain([defaultModelConfig]));
      const session = await adapter.createSession(createParams());

      hoisted.MockPiAgent.script = async (agent) => {
        // 非 text_delta 类型
        agent.emit({
          type: 'message_update',
          assistantMessageEvent: { type: 'other_type', delta: 'data' },
        });
        // 无 delta string
        agent.emit({
          type: 'message_update',
          assistantMessageEvent: { type: 'text_delta', delta: 123 },
        });
        // unknown event type
        agent.emit({ type: 'something_unknown' });
        // agent_end
        agent.emit({
          type: 'agent_end',
          messages: [{ role: 'assistant', stopReason: 'stop' }],
        });
      };

      const events = await collectEvents(
        adapter.prompt(session.id, [{ type: 'text', text: 'hi' }]),
      );
      // 只有 done 事件，前面的 message_update 和 unknown 都被过滤
      expect(events).toEqual([{ type: 'done', stopReason: 'end_turn' }]);
    });

    it('tool_execution_end isError=true 时使用 stringifyToolError', async () => {
      mockDb.select.mockReturnValueOnce(createSelectChain([defaultModelConfig]));
      const session = await adapter.createSession(createParams());

      hoisted.MockPiAgent.script = async (agent) => {
        agent.emit({
          type: 'tool_execution_end',
          toolCallId: 'err-call',
          toolName: 'myTool',
          result: { details: 'direct error string' },
          isError: true,
        });
        agent.emit({
          type: 'agent_end',
          messages: [{ role: 'assistant', stopReason: 'stop' }],
        });
      };

      const events = await collectEvents(
        adapter.prompt(session.id, [{ type: 'text', text: 'hi' }]),
      );
      expect(events[0]).toEqual({
        type: 'tool_call',
        call: {
          id: 'err-call',
          tool: 'myTool',
          args: {},
          status: 'failed',
          error: 'direct error string',
        },
      });
    });

    it('tool_execution_end isError=true content 结构错误时使用 fallback', async () => {
      mockDb.select.mockReturnValueOnce(createSelectChain([defaultModelConfig]));
      const session = await adapter.createSession(createParams());

      hoisted.MockPiAgent.script = async (agent) => {
        // stringifyToolError with content array (text extraction)
        agent.emit({
          type: 'tool_execution_end',
          toolCallId: 'err-content',
          toolName: 'myTool',
          result: {
            details: {
              content: [
                { type: 'text', text: 'error line 1' },
                { type: 'text', text: 'error line 2' },
                { type: 'image', data: 'binary' }, // 非 text
              ],
            },
          },
          isError: true,
        });
        agent.emit({
          type: 'agent_end',
          messages: [{ role: 'assistant', stopReason: 'stop' }],
        });
      };

      const events = await collectEvents(
        adapter.prompt(session.id, [{ type: 'text', text: 'hi' }]),
      );
      expect(events[0]).toMatchObject({
        type: 'tool_call',
        call: {
          id: 'err-content',
          status: 'failed',
          error: 'error line 1\nerror line 2',
        },
      });
    });

    it('tool_execution_end isError=true 空 content 使用 fallback "Tool execution failed"', async () => {
      mockDb.select.mockReturnValueOnce(createSelectChain([defaultModelConfig]));
      const session = await adapter.createSession(createParams());

      hoisted.MockPiAgent.script = async (agent) => {
        // content 数组全部为空文本
        agent.emit({
          type: 'tool_execution_end',
          toolCallId: 'err-empty',
          toolName: 'myTool',
          result: { details: { content: [{ type: 'text', text: '' }] } },
          isError: true,
        });
        agent.emit({
          type: 'agent_end',
          messages: [{ role: 'assistant', stopReason: 'stop' }],
        });
      };

      const events = await collectEvents(
        adapter.prompt(session.id, [{ type: 'text', text: 'hi' }]),
      );
      expect(events[0]).toMatchObject({
        type: 'tool_call',
        call: {
          id: 'err-empty',
          status: 'failed',
          error: 'Tool execution failed',
        },
      });
    });

    it('tool_execution_end isError=true 纯数字错误使用 fallback', async () => {
      mockDb.select.mockReturnValueOnce(createSelectChain([defaultModelConfig]));
      const session = await adapter.createSession(createParams());

      hoisted.MockPiAgent.script = async (agent) => {
        agent.emit({
          type: 'tool_execution_end',
          toolCallId: 'err-num',
          toolName: 'myTool',
          result: { details: 42 },
          isError: true,
        });
        agent.emit({
          type: 'agent_end',
          messages: [{ role: 'assistant', stopReason: 'stop' }],
        });
      };

      const events = await collectEvents(
        adapter.prompt(session.id, [{ type: 'text', text: 'hi' }]),
      );
      expect(events[0]).toMatchObject({
        type: 'tool_call',
        call: { id: 'err-num', status: 'failed', error: 'Tool execution failed' },
      });
    });

    it('mapStopReason 处理 tool_use 别名', async () => {
      mockDb.select.mockReturnValueOnce(createSelectChain([defaultModelConfig]));
      const session = await adapter.createSession(createParams());

      hoisted.MockPiAgent.script = async (agent) => {
        agent.emit({
          type: 'agent_end',
          messages: [{ role: 'assistant', stopReason: 'tool_use' }],
        });
      };

      const events = await collectEvents(
        adapter.prompt(session.id, [{ type: 'text', text: 'hi' }]),
      );
      expect(events).toEqual([{ type: 'done', stopReason: 'tool_use' }]);
    });

    it('tool_execution_start 无 toolCallId/toolName 时使用 fallback', async () => {
      mockDb.select.mockReturnValueOnce(createSelectChain([defaultModelConfig]));
      const session = await adapter.createSession(createParams());

      hoisted.MockPiAgent.script = async (agent) => {
        agent.emit({
          type: 'tool_execution_start',
          // 无 toolCallId, toolName
          args: { data: 1 },
        });
        agent.emit({
          type: 'agent_end',
          messages: [{ role: 'assistant', stopReason: 'stop' }],
        });
      };

      const events = await collectEvents(
        adapter.prompt(session.id, [{ type: 'text', text: 'hi' }]),
      );
      expect(events[0]).toMatchObject({
        type: 'tool_call',
        call: {
          tool: 'unknown_tool',
          args: { data: 1 },
          status: 'in_progress',
        },
      });
      // id should be a UUID (36 chars)
      expect(
        (events[0] as { call: { id: string } }).call.id,
      ).toHaveLength(36);
    });
  });

  describe('serializeContentBlocks branch coverage', () => {
    it('序列化 audio/resource/resource_link/default 类型 content block', async () => {
      mockDb.select.mockReturnValueOnce(createSelectChain([defaultModelConfig]));
      const session = await adapter.createSession(createParams());

      const blocks: ContentBlock[] = [
        { type: 'audio', mimeType: 'audio/wav', data: 'base64data' } as ContentBlock,
        {
          type: 'resource',
          uri: 'file://test.txt',
          text: 'resource-text',
        } as ContentBlock,
        {
          type: 'resource',
          uri: 'file://blob.bin',
          blob: 'blob-data',
        } as ContentBlock,
        {
          type: 'resource',
          uri: 'file://fallback.txt',
        } as ContentBlock,
        {
          type: 'resource_link',
          uri: 'https://example.com',
          title: 'Example',
        } as ContentBlock,
        {
          type: 'resource_link',
          uri: 'https://notitle.com',
        } as ContentBlock,
        { type: 'unknown_type' } as unknown as ContentBlock,
      ];

      hoisted.MockPiAgent.script = async (agent) => {
        // 验证 prompt 接收到的序列化文本
        const text = agent.promptInputs[0];
        expect(text).toContain('[audio:audio/wav]');
        expect(text).toContain('resource-text');
        expect(text).toContain('blob-data');
        expect(text).toContain('[resource:file://fallback.txt]');
        expect(text).toContain('Example');
        expect(text).toContain('[resource_link:https://notitle.com]');

        agent.emit({
          type: 'agent_end',
          messages: [{ role: 'assistant', stopReason: 'stop' }],
        });
      };

      await collectEvents(adapter.prompt(session.id, blocks));
    });
  });

  describe('extractResourcePaths branch coverage', () => {
    it('从数组类型的参数中提取资源路径', async () => {
      mockDb.select.mockReturnValueOnce(createSelectChain([defaultModelConfig]));
      const session = await adapter.createSession(createParams());

      hoisted.MockPiAgent.script = async (agent) => {
        const result = await agent.options.beforeToolCall?.(
          {
            toolCall: {
              id: 'call-paths',
              name: 'multi_file',
              arguments: {
                paths: ['/tmp/a.txt', '/tmp/b.txt', '', 42],
                cwd: '/workspace',
              },
            },
            args: {
              paths: ['/tmp/a.txt', '/tmp/b.txt', '', 42],
              cwd: '/workspace',
            },
          },
          agent.abortController.signal,
        );

        if (!result?.block) {
          agent.emit({
            type: 'agent_end',
            messages: [{ role: 'assistant', stopReason: 'stop' }],
          });
        }
      };

      const iterator = adapter
        .prompt(session.id, [{ type: 'text', text: 'go' }])
        [Symbol.asyncIterator]();
      const first = await iterator.next();

      expect(first.value).toMatchObject({
        type: 'tool_call',
        call: {
          id: 'call-paths',
          status: 'awaiting_permission',
          permissionRequest: {
            resourcePaths: expect.arrayContaining([
              '/tmp/a.txt',
              '/tmp/b.txt',
              '/workspace',
            ]),
          },
        },
      });

      await adapter.resolveToolPermission(session.id, 'call-paths', 'approve');
      await collectIteratorRest(iterator);
    });
  });

  describe('signal pre-aborted', () => {
    it('signal 已 aborted 时立即 cancel permission', async () => {
      mockDb.select.mockReturnValueOnce(createSelectChain([defaultModelConfig]));
      const session = await adapter.createSession(createParams());

      hoisted.MockPiAgent.script = async (agent) => {
        // 先 abort signal
        agent.abortController.abort();

        const result = await agent.options.beforeToolCall?.(
          {
            toolCall: {
              id: 'call-aborted',
              name: 'fs.read',
              arguments: { path: '/test' },
            },
            args: { path: '/test' },
          },
          agent.abortController.signal,
        );

        // cancelled → block=true
        expect(result).toEqual({
          block: true,
          reason: 'Tool execution cancelled.',
        });

        agent.emit({
          type: 'agent_end',
          messages: [{ role: 'assistant', stopReason: 'aborted' }],
        });
      };

      const events = await collectEvents(
        adapter.prompt(session.id, [{ type: 'text', text: 'go' }]),
      );
      // 应该有 awaiting_permission + done(cancelled)
      expect(events.at(-1)).toEqual({ type: 'done', stopReason: 'cancelled' });
    });
  });

  describe('prompt error path', () => {
    it('agent.prompt 抛错时 session 状态变为 error', async () => {
      mockDb.select.mockReturnValueOnce(createSelectChain([defaultModelConfig]));
      const session = await adapter.createSession(createParams());

      hoisted.MockPiAgent.script = async () => {
        throw new Error('LLM provider failed');
      };

      await expect(
        collectEvents(
          adapter.prompt(session.id, [{ type: 'text', text: 'go' }]),
        ),
      ).rejects.toThrow('LLM provider failed');
      expect((await adapter.loadSession(session.id)).status).toBe('error');
    });
  });

  describe('getToolCallId/getToolName fallback', () => {
    it('从 toolCallId 别名提取 id', async () => {
      mockDb.select.mockReturnValueOnce(createSelectChain([defaultModelConfig]));
      const session = await adapter.createSession(createParams());

      hoisted.MockPiAgent.script = async (agent) => {
        await agent.options.beforeToolCall?.(
          {
            toolCall: {
              toolCallId: 'alt-id-123',
              toolName: 'alt-tool',
            },
            args: {},
          },
          agent.abortController.signal,
        );

        agent.emit({
          type: 'agent_end',
          messages: [{ role: 'assistant', stopReason: 'stop' }],
        });
      };

      const iterator = adapter
        .prompt(session.id, [{ type: 'text', text: 'go' }])
        [Symbol.asyncIterator]();
      const first = await iterator.next();

      expect(first.value).toMatchObject({
        type: 'tool_call',
        call: {
          id: 'alt-id-123',
          tool: 'alt-tool',
          status: 'awaiting_permission',
        },
      });

      await adapter.resolveToolPermission(session.id, 'alt-id-123', 'approve');
      await collectIteratorRest(iterator);
    });

    it('id/name 均缺失时使用 fallback', async () => {
      mockDb.select.mockReturnValueOnce(createSelectChain([defaultModelConfig]));
      const session = await adapter.createSession(createParams());

      hoisted.MockPiAgent.script = async (agent) => {
        await agent.options.beforeToolCall?.(
          {
            toolCall: {},
            args: {},
          },
          agent.abortController.signal,
        );

        agent.emit({
          type: 'agent_end',
          messages: [{ role: 'assistant', stopReason: 'stop' }],
        });
      };

      const iterator = adapter
        .prompt(session.id, [{ type: 'text', text: 'go' }])
        [Symbol.asyncIterator]();
      const first = await iterator.next();

      const call = (first.value as { call: { id: string; tool: string } }).call;
      expect(call.id).toHaveLength(36); // UUID
      expect(call.tool).toBe('unknown_tool');

      await adapter.resolveToolPermission(session.id, call.id, 'approve');
      await collectIteratorRest(iterator);
    });
  });
});
