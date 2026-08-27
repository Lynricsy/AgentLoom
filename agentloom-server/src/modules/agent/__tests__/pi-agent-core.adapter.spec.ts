import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ToolSet } from 'ai';
import { Logger } from '@nestjs/common';
import { z } from 'zod';
import { runInTenantTransaction } from '../../../common/interceptors/tenant-transaction.context';
import type { AgentToolPermissionSyncService } from '../agent-tool-permission-sync.service';
import { PiAgentCoreAdapter } from '../pi-agent-core.adapter';
import type { AgentEvent } from '../types/agent-event.types';
import type { CreateSessionParams } from '../types/agent-session.types';
import type { ContentBlock } from '../types/content-block.types';
import { ToolPermissionResolutionNotAllowedException } from '../../../common/exceptions/tool-call.exceptions';

const hoisted = vi.hoisted(() => {
  type MockAgentOptions = {
    streamFn?: unknown;
    sessionId?: string;
    getApiKey?: (provider: string) => Promise<string | undefined>;
    beforeToolCall?: (
      context: Record<string, unknown>,
      signal?: AbortSignal,
    ) => Promise<{ block: boolean; reason?: string } | undefined>;
    initialState?: Record<string, unknown>;
  };

  class MockPiAgent {
    static instances: MockPiAgent[] = [];
    static script:
      | ((agent: MockPiAgent, input: string) => Promise<void>)
      | null = null;

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
    importPiAgentCore: vi.fn(async () => ({ Agent: MockPiAgent })),
    typeBoxToZod: vi.fn((schema: unknown) => ({ typeBoxConverted: schema })),
    normalizeFlexibleSchemaJson: vi.fn((schema: unknown) => schema),
    flexibleSchemaToTypeBox: vi.fn((schema: unknown) => ({
      converted: schema,
    })),
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

vi.mock('../tool-schema-converter', () => ({
  typeBoxToZod: hoisted.typeBoxToZod,
  normalizeFlexibleSchemaJson: hoisted.normalizeFlexibleSchemaJson,
  flexibleSchemaToTypeBox: hoisted.flexibleSchemaToTypeBox,
}));

function createSelectChain(result: unknown) {
  return {
    from: vi.fn().mockReturnValue({
      innerJoin: vi.fn().mockReturnValue({
        where: vi
          .fn()
          .mockResolvedValue(Array.isArray(result) ? result : [result]),
      }),
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
  let mockPiAiAdapter: { getPiRuntimeModel: ReturnType<typeof vi.fn> };
  let mockMcpService: {
    resolveRuntimeConnection: ReturnType<typeof vi.fn>;
    callRuntimeTool: ReturnType<typeof vi.fn>;
  };
  let mockRagService: { search: ReturnType<typeof vi.fn> };
  let mockToolPermissionSyncService: {
    registerPendingResolution: ReturnType<typeof vi.fn>;
    unregisterPendingResolution: ReturnType<typeof vi.fn>;
    publishResolution: ReturnType<typeof vi.fn>;
  };

  const NOW = new Date('2026-03-23T10:00:00.000Z');
  const storedModelConfig = {
    id: 'model-config-001',
    orgId: 'org-001',
    tenantId: 'tenant-001',
    providerId: 'provider-001',
    name: 'GPT-4.1 Mini',
    modelId: 'gpt-4.1-mini',
    modelType: 'chat',
    isEnabled: true,
    isDefault: true,
    capabilities: {},
    contextWindow: 128_000,
    maxOutputTokens: 4_096,
    pricing: null,
    parameters: {},
    metadataSource: 'manual',
    timeoutMs: 30_000,
    embeddingDimensions: null,
    createdAt: NOW,
    updatedAt: NOW,
  };

  const storedProvider = {
    id: 'provider-001',
    orgId: 'org-001',
    tenantId: 'tenant-001',
    slug: 'openai',
    name: 'OpenAI',
    iconUrl: null,
    baseUrl: null,
    defaultBaseUrl: null,
    isBuiltin: true,
    isEnabled: true,
    apiProtocol: 'openai_chat',
    apiKeyId: 'api-key-001',
    sortOrder: 0,
    createdAt: NOW,
    updatedAt: NOW,
  };

  const defaultModelConfig = {
    config: storedModelConfig,
    provider: storedProvider,
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
    hoisted.importPiAgentCore.mockClear();
    hoisted.typeBoxToZod.mockClear();
    hoisted.normalizeFlexibleSchemaJson.mockClear();
    hoisted.flexibleSchemaToTypeBox.mockClear();
    hoisted.getTenantDb.mockClear();

    mockDb = { select: vi.fn() };
    mockPiAiAdapter = {
      getPiRuntimeModel: vi.fn().mockResolvedValue({
        model: {
          id: 'mock-model-id',
          name: 'mock-model-name',
          api: 'anthropic-messages',
          provider: 'mock-provider',
          baseUrl: 'https://mock-base',
          reasoning: true,
          input: ['text'],
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
          contextWindow: 128000,
          maxTokens: 4096,
        },
        apiKey: 'mock-api-key',
      }),
    };
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
    mockToolPermissionSyncService = {
      registerPendingResolution: vi.fn(),
      unregisterPendingResolution: vi.fn(),
      publishResolution: vi.fn().mockResolvedValue(undefined),
    };

    type AdapterArgs = ConstructorParameters<typeof PiAgentCoreAdapter>;
    adapter = new PiAgentCoreAdapter(
      mockDb as unknown as AdapterArgs[0],
      mockPiAiAdapter as unknown as AdapterArgs[1],
      mockMcpService as unknown as AdapterArgs[2],
      mockRagService as unknown as AdapterArgs[3],
      undefined,
      mockToolPermissionSyncService as unknown as AgentToolPermissionSyncService,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('createSession', () => {
    it('会创建 conversation session 并保留上下文元信息', async () => {
      mockDb.select.mockReturnValueOnce(
        createSelectChain([defaultModelConfig]),
      );

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
      mockDb.select.mockReturnValueOnce(
        createSelectChain([defaultModelConfig]),
      );

      const session = await adapter.createSession(createParams());
      const agent = hoisted.MockPiAgent.instances[0];

      expect(hoisted.importPiAgentCore).toHaveBeenCalledTimes(1);
      expect(mockPiAiAdapter.getPiRuntimeModel).toHaveBeenCalledWith({
        ...storedModelConfig,
        provider: storedProvider,
      });
      expect(agent.options.sessionId).toBe(session.id);
      expect(agent.options.initialState).toMatchObject({
        systemPrompt: '你是一个测试助手',
        model: expect.objectContaining({
          id: 'mock-model-id',
          provider: 'mock-provider',
        }),
        tools: [],
      });
      expect(agent.options.getApiKey).toBeTypeOf('function');
      expect(typeof agent.options.beforeToolCall).toBe('function');
    });

    it('workflow 模式会把初始 context 映射为 workflowState', async () => {
      mockDb.select.mockReturnValueOnce(
        createSelectChain([defaultModelConfig]),
      );

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
      mockDb.select.mockReturnValueOnce(
        createSelectChain([defaultModelConfig]),
      );
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
      mockDb.select.mockReturnValueOnce(
        createSelectChain([defaultModelConfig]),
      );
      const session = await adapter.createSession(createParams());

      await expect(adapter.loadSession(session.id)).resolves.toEqual(session);
    });

    it('不存在的 session 会抛错', async () => {
      await expect(adapter.loadSession('missing')).rejects.toThrow(
        /not found/i,
      );
    });
  });

  describe('tool provider lifecycle', () => {
    it('prompt 前注册 provider 会刷新 tools 并转换工具 schema', async () => {
      mockDb.select.mockReturnValueOnce(
        createSelectChain([defaultModelConfig]),
      );
      const session = await adapter.createSession(createParams());
      const toolSet = {
        'docs/search': {
          description: '搜索文档',
          inputSchema: z.object({ query: z.string() }),
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

      await collectEvents(
        adapter.prompt(session.id, [{ type: 'text', text: 'hi' }]),
      );

      const agent = hoisted.MockPiAgent.instances[0];
      expect(hoisted.flexibleSchemaToTypeBox).toHaveBeenCalledWith(
        toolSet['docs/search'].inputSchema,
      );
      expect(agent.setTools).toHaveBeenCalledWith([
        expect.objectContaining({
          name: 'docs/search',
          label: 'docs/search',
          description: '搜索文档',
          parameters: {
            converted: toolSet['docs/search'].inputSchema,
          },
        }),
      ]);
    });

    it('unregister 后 prompt 不再注入 tools', async () => {
      mockDb.select.mockReturnValueOnce(
        createSelectChain([defaultModelConfig]),
      );
      const session = await adapter.createSession(createParams());
      adapter.registerSessionToolProvider(
        session.id,
        () =>
          ({
            toolA: {
              description: 'A',
              inputSchema: { type: 'schema' },
              execute: vi.fn(),
            },
          }) as unknown as ToolSet,
      );
      adapter.unregisterSessionToolProvider(session.id);

      hoisted.MockPiAgent.script = async (agent) => {
        agent.emit({
          type: 'agent_end',
          messages: [{ role: 'assistant', stopReason: 'stop' }],
        });
      };

      await collectEvents(
        adapter.prompt(session.id, [{ type: 'text', text: 'hi' }]),
      );

      const agent = hoisted.MockPiAgent.instances[0];
      expect(agent.setTools).toHaveBeenCalledWith([]);
      expect(hoisted.flexibleSchemaToTypeBox).not.toHaveBeenCalled();
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

      await collectEvents(
        adapter.prompt(session.id, [{ type: 'text', text: 'hi' }]),
      );

      const agent = hoisted.MockPiAgent.instances[0];
      expect(agent.setTools).toHaveBeenLastCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ name: 'search_docs' }),
          expect.objectContaining({ name: 'manual_tool' }),
        ]),
      );
      const injectedTools = agent.setTools.mock.lastCall?.[0] as Array<{
        name: string;
        execute: (
          toolCallId: string,
          params: unknown,
        ) => Promise<{ details: unknown }>;
      }>;
      const runtimeTool = injectedTools.find(
        (tool) => tool.name === 'search_docs',
      );
      await expect(
        runtimeTool?.execute('call-mcp', { query: 'AgentLoom' }),
      ).resolves.toMatchObject({
        details: { hits: ['doc-1'] },
      });
      expect(hoisted.normalizeFlexibleSchemaJson).toHaveBeenCalledWith({
        type: 'object',
        properties: {
          query: { type: 'string' },
        },
        required: ['query'],
      });
      expect(hoisted.flexibleSchemaToTypeBox).toHaveBeenCalledWith(
        expect.objectContaining({
          jsonSchema: expect.objectContaining({
            required: ['query'],
            properties: {
              query: { type: 'string' },
            },
          }),
        }),
      );
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
      mockDb.select.mockReturnValueOnce(
        createSelectChain([defaultModelConfig]),
      );

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
          (tool) => (tool as { name?: string }).name === 'search_knowledge',
        ) as {
          execute: (
            toolCallId: string,
            params: unknown,
          ) => Promise<{
            details: unknown;
          }>;
        };

        await expect(
          knowledgeTool.execute('call-kb', {
            query: 'AgentLoom',
            knowledgeBaseIds: ['kb-1'],
            topK: 2,
          }),
        ).resolves.toMatchObject({
          details: {
            knowledgeBaseIds: ['kb-1'],
            total: 1,
            results: expect.any(Array),
          },
        });

        agent.emit({
          type: 'agent_end',
          messages: [{ role: 'assistant', stopReason: 'stop' }],
        });
      };

      await collectEvents(
        adapter.prompt(session.id, [{ type: 'text', text: 'search' }]),
      );

      const agent = hoisted.MockPiAgent.instances[0];
      expect(agent.setTools).toHaveBeenLastCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ name: 'search_knowledge' }),
        ]),
      );
      expect(mockRagService.search).toHaveBeenCalledWith(
        'AgentLoom',
        'tenant-001',
        {
          knowledgeBaseIds: ['kb-1'],
          limit: 2,
          scoreThreshold: 0.42,
        },
      );
    });

    it('runtimeConfig 的空 tools 与空 knowledgeBindings 不会破坏 session 创建', async () => {
      mockDb.select.mockReturnValueOnce(
        createSelectChain([defaultModelConfig]),
      );
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

      await collectEvents(
        adapter.prompt(session.id, [{ type: 'text', text: 'noop' }]),
      );

      const agent = hoisted.MockPiAgent.instances[0];
      expect(agent.setTools).toHaveBeenLastCalledWith([]);
      expect(hoisted.typeBoxToZod).not.toHaveBeenCalled();
      expect(mockMcpService.resolveRuntimeConnection).not.toHaveBeenCalled();
      expect(mockRagService.search).not.toHaveBeenCalled();
    });
  });

  describe('prompt event translation', () => {
    it('会序列化 ContentBlock 并调用 agent.prompt(text)', async () => {
      mockDb.select.mockReturnValueOnce(
        createSelectChain([defaultModelConfig]),
      );
      const session = await adapter.createSession(createParams());
      const blocks: ContentBlock[] = [
        { type: 'text', text: '看这张图' },
        { type: 'image', data: 'base64', mimeType: 'image/png' },
        { type: 'resource_link', uri: 'https://docs.example.com' },
      ];

      hoisted.MockPiAgent.script = async (agent, input) => {
        expect(input).toBe(
          '看这张图\n\n[image:image/png]\n\n[resource_link:https://docs.example.com]',
        );
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
      mockDb.select.mockReturnValueOnce(
        createSelectChain([defaultModelConfig]),
      );
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
        collectEvents(
          adapter.prompt(session.id, [{ type: 'text', text: 'hi' }]),
        ),
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
      mockDb.select.mockReturnValueOnce(
        createSelectChain([defaultModelConfig]),
      );
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
        collectEvents(
          adapter.prompt(session.id, [{ type: 'text', text: 'hi' }]),
        ),
      ).resolves.toEqual([{ type: 'done', stopReason: 'end_turn' }]);
    });

    it('会把 tool_execution_start 映射为 in_progress tool_call', async () => {
      mockDb.select.mockReturnValueOnce(
        createSelectChain([defaultModelConfig]),
      );
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
        collectEvents(
          adapter.prompt(session.id, [{ type: 'text', text: 'hi' }]),
        ),
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
      mockDb.select.mockReturnValueOnce(
        createSelectChain([defaultModelConfig]),
      );
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
        collectEvents(
          adapter.prompt(session.id, [{ type: 'text', text: 'hi' }]),
        ),
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
      mockDb.select.mockReturnValueOnce(
        createSelectChain([defaultModelConfig]),
      );
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
        collectEvents(
          adapter.prompt(session.id, [{ type: 'text', text: 'hi' }]),
        ),
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
        mockDb.select.mockReturnValueOnce(
          createSelectChain([defaultModelConfig]),
        );
        const session = await adapter.createSession(createParams());

        hoisted.MockPiAgent.script = async (agent) => {
          agent.emit({
            type: 'agent_end',
            messages: [{ role: 'assistant', stopReason: source }],
          });
        };

        await expect(
          collectEvents(
            adapter.prompt(session.id, [{ type: 'text', text: 'hi' }]),
          ),
        ).resolves.toEqual([{ type: 'done', stopReason: target }]);
      },
    );
  });

  describe('permission gate', () => {
    it('普通 conversation 会自动放行非自进化工具调用', async () => {
      mockDb.select.mockReturnValueOnce(
        createSelectChain([defaultModelConfig]),
      );
      const session = await adapter.createSession(createParams());

      hoisted.MockPiAgent.script = async (agent) => {
        const result = await agent.options.beforeToolCall?.(
          {
            toolCall: {
              id: 'call-normal',
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
            toolCallId: 'call-normal',
            toolName: 'filesystem.read',
            args: { path: '/tmp/demo.txt' },
          });
          agent.emit({
            type: 'tool_execution_end',
            toolCallId: 'call-normal',
            toolName: 'filesystem.read',
            result: { details: { content: 'ok' } },
            isError: false,
          });
        }

        agent.emit({
          type: 'agent_end',
          messages: [{ role: 'assistant', stopReason: 'toolUse' }],
        });
      };

      await expect(
        collectEvents(
          adapter.prompt(session.id, [{ type: 'text', text: 'read' }]),
        ),
      ).resolves.toEqual([
        {
          type: 'tool_call',
          call: {
            id: 'call-normal',
            tool: 'filesystem.read',
            args: { path: '/tmp/demo.txt' },
            status: 'in_progress',
          },
        },
        {
          type: 'tool_call',
          call: {
            id: 'call-normal',
            tool: 'filesystem.read',
            args: {},
            status: 'completed',
            result: { content: 'ok' },
          },
        },
        { type: 'done', stopReason: 'tool_use' },
      ]);
      expect(
        mockToolPermissionSyncService.registerPendingResolution,
      ).not.toHaveBeenCalled();
    });

    it('LLM_SUGGEST workflow session 会自动放行工具调用，不进入 awaiting_permission', async () => {
      mockDb.select.mockReturnValueOnce(
        createSelectChain([defaultModelConfig]),
      );
      const session = await adapter.createSession(
        createParams({
          mode: 'workflow',
          autonomyMode: 'LLM_SUGGEST',
          context: {
            executionId: 'exec-001',
            stepId: 'step-001',
            nodeId: 'node-001',
          },
        }),
      );

      hoisted.MockPiAgent.script = async (agent) => {
        const result = await agent.options.beforeToolCall?.(
          {
            toolCall: {
              id: 'call-auto',
              name: 'fast_search',
              arguments: { query: 'AgentLoom' },
            },
            args: { query: 'AgentLoom' },
          },
          agent.abortController.signal,
        );

        if (!result?.block) {
          agent.emit({
            type: 'tool_execution_start',
            toolCallId: 'call-auto',
            toolName: 'fast_search',
            args: { query: 'AgentLoom' },
          });
          agent.emit({
            type: 'tool_execution_end',
            toolCallId: 'call-auto',
            toolName: 'fast_search',
            result: { details: { summary: 'ok' } },
            isError: false,
          });
        }

        agent.emit({
          type: 'agent_end',
          messages: [{ role: 'assistant', stopReason: 'toolUse' }],
        });
      };

      await expect(
        collectEvents(
          adapter.prompt(session.id, [{ type: 'text', text: 'search' }]),
        ),
      ).resolves.toEqual([
        {
          type: 'tool_call',
          call: {
            id: 'call-auto',
            tool: 'fast_search',
            args: { query: 'AgentLoom' },
            status: 'in_progress',
          },
        },
        {
          type: 'tool_call',
          call: {
            id: 'call-auto',
            tool: 'fast_search',
            args: {},
            status: 'completed',
            result: { summary: 'ok' },
          },
        },
        { type: 'done', stopReason: 'tool_use' },
      ]);
      expect(
        mockToolPermissionSyncService.registerPendingResolution,
      ).not.toHaveBeenCalled();
    });

    it('workflowState.autoApproveToolPermissions=true 时会自动放行工具调用', async () => {
      mockDb.select.mockReturnValueOnce(
        createSelectChain([defaultModelConfig]),
      );
      const session = await adapter.createSession(
        createParams({
          mode: 'workflow',
          context: {
            executionId: 'exec-002',
            stepId: 'step-002',
            nodeId: 'node-002',
            autoApproveToolPermissions: true,
          },
        }),
      );

      hoisted.MockPiAgent.script = async (agent) => {
        const result = await agent.options.beforeToolCall?.(
          {
            toolCall: {
              id: 'call-system',
              name: 'fast_search',
              arguments: { query: 'daily news' },
            },
            args: { query: 'daily news' },
          },
          agent.abortController.signal,
        );

        if (!result?.block) {
          agent.emit({
            type: 'tool_execution_start',
            toolCallId: 'call-system',
            toolName: 'fast_search',
            args: { query: 'daily news' },
          });
          agent.emit({
            type: 'tool_execution_end',
            toolCallId: 'call-system',
            toolName: 'fast_search',
            result: { details: { headlines: 3 } },
            isError: false,
          });
        }

        agent.emit({
          type: 'agent_end',
          messages: [{ role: 'assistant', stopReason: 'toolUse' }],
        });
      };

      await expect(
        collectEvents(
          adapter.prompt(session.id, [{ type: 'text', text: 'summarize' }]),
        ),
      ).resolves.toEqual([
        {
          type: 'tool_call',
          call: {
            id: 'call-system',
            tool: 'fast_search',
            args: { query: 'daily news' },
            status: 'in_progress',
          },
        },
        {
          type: 'tool_call',
          call: {
            id: 'call-system',
            tool: 'fast_search',
            args: {},
            status: 'completed',
            result: { headlines: 3 },
          },
        },
        { type: 'done', stopReason: 'tool_use' },
      ]);
      expect(
        mockToolPermissionSyncService.registerPendingResolution,
      ).not.toHaveBeenCalled();
    });

    it('approve 后会继续执行工具并输出 tool_call + done', async () => {
      mockDb.select.mockReturnValueOnce(
        createSelectChain([defaultModelConfig]),
      );
      const session = await adapter.createSession(createParams());

      hoisted.MockPiAgent.script = async (agent) => {
        const result = await agent.options.beforeToolCall?.(
          {
            toolCall: {
              id: 'call-1',
              name: 'apply_change',
              arguments: { proposal: { requiresConfirmation: true } },
            },
            args: { proposal: { requiresConfirmation: true } },
          },
          agent.abortController.signal,
        );

        if (!result?.block) {
          agent.emit({
            type: 'tool_execution_start',
            toolCallId: 'call-1',
            toolName: 'apply_change',
            args: { proposal: { requiresConfirmation: true } },
          });
          agent.emit({
            type: 'tool_execution_end',
            toolCallId: 'call-1',
            toolName: 'apply_change',
            result: { details: { content: 'ok' } },
            isError: false,
          });
        }

        agent.emit({
          type: 'agent_end',
          messages: [{ role: 'assistant', stopReason: 'stop' }],
        });
      };

      const iterator = adapter
        .prompt(session.id, [{ type: 'text', text: 'read' }])
        [Symbol.asyncIterator]();
      const first = await iterator.next();

      expect(first.value).toEqual({
        type: 'tool_call',
        call: {
          id: 'call-1',
          tool: 'apply_change',
          args: { proposal: { requiresConfirmation: true } },
          status: 'awaiting_permission',
          permissionRequest: {
            description: '工具 apply_change 需要主人授权后才能执行。',
          },
        },
      });
      expect(
        mockToolPermissionSyncService.registerPendingResolution,
      ).toHaveBeenCalledWith(session.id, 'call-1', expect.any(Function));

      await adapter.resolveToolPermission(session.id, 'call-1', 'approve');

      const rest = await collectIteratorRest(iterator);
      expect(rest).toEqual([
        {
          type: 'tool_call',
          call: {
            id: 'call-1',
            tool: 'apply_change',
            args: { proposal: { requiresConfirmation: true } },
            status: 'in_progress',
          },
        },
        {
          type: 'tool_call',
          call: {
            id: 'call-1',
            tool: 'apply_change',
            args: {},
            status: 'completed',
            result: { content: 'ok' },
          },
        },
        { type: 'done', stopReason: 'end_turn' },
      ]);
      expect(
        mockToolPermissionSyncService.unregisterPendingResolution,
      ).toHaveBeenCalledWith(session.id, 'call-1');
    });

    it('deny 后会发出 denied 并阻止后续错误结果重复透传', async () => {
      mockDb.select.mockReturnValueOnce(
        createSelectChain([defaultModelConfig]),
      );
      const session = await adapter.createSession(createParams());

      hoisted.MockPiAgent.script = async (agent) => {
        const result = await agent.options.beforeToolCall?.(
          {
            toolCall: {
              id: 'call-2',
              name: 'create_resource',
              arguments: { kind: 'skill' },
            },
            args: { kind: 'skill' },
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

      const iterator = adapter
        .prompt(session.id, [{ type: 'text', text: 'write' }])
        [Symbol.asyncIterator]();
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
            tool: 'create_resource',
            args: { kind: 'skill' },
            status: 'denied',
            permissionRequest: {
              description: '工具 create_resource 需要主人授权后才能执行。',
            },
          },
        },
        { type: 'done', stopReason: 'end_turn' },
      ]);
    });

    it('30 秒超时会默认 deny', async () => {
      mockDb.select.mockReturnValueOnce(
        createSelectChain([defaultModelConfig]),
      );
      const session = await adapter.createSession(createParams());

      hoisted.MockPiAgent.script = async (agent) => {
        const result = await agent.options.beforeToolCall?.(
          {
            toolCall: {
              id: 'call-timeout',
              name: 'apply_change',
              arguments: { proposal: { requiresConfirmation: true } },
            },
            args: { proposal: { requiresConfirmation: true } },
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

      const iterator = adapter
        .prompt(session.id, [{ type: 'text', text: 'write' }])
        [Symbol.asyncIterator]();
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
            tool: 'apply_change',
            args: { proposal: { requiresConfirmation: true } },
            status: 'denied',
            permissionRequest: {
              description: '工具 apply_change 需要主人授权后才能执行。',
            },
          },
        },
        { type: 'done', stopReason: 'end_turn' },
      ]);
    });

    it('未命中本地 pending gate 时会回退到分布式广播', async () => {
      await expect(
        adapter.resolveToolPermission(
          'missing-session',
          'missing-call',
          'approve',
        ),
      ).resolves.toBeUndefined();

      expect(
        mockToolPermissionSyncService.publishResolution,
      ).toHaveBeenCalledWith('missing-session', 'missing-call', 'approve');
    });
  });

  describe('cancel', () => {
    it('会调用 agent.abort 并把 session 标记为 completed', async () => {
      mockDb.select.mockReturnValueOnce(
        createSelectChain([defaultModelConfig]),
      );
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
    function registerToolProvider(sessionId: string, toolSet: ToolSet): void {
      adapter.registerSessionToolProvider(sessionId, async () => toolSet);
    }

    it('tool.execute 缺失时返回 "Tool has no execute function"', async () => {
      mockDb.select.mockReturnValueOnce(
        createSelectChain([defaultModelConfig]),
      );
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
      mockDb.select.mockReturnValueOnce(
        createSelectChain([defaultModelConfig]),
      );
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
      mockDb.select.mockReturnValueOnce(
        createSelectChain([defaultModelConfig]),
      );
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
      mockDb.select.mockReturnValueOnce(
        createSelectChain([defaultModelConfig]),
      );
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
      mockDb.select.mockReturnValueOnce(
        createSelectChain([defaultModelConfig]),
      );
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
      mockDb.select.mockReturnValueOnce(
        createSelectChain([defaultModelConfig]),
      );
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
      mockDb.select.mockReturnValueOnce(
        createSelectChain([defaultModelConfig]),
      );
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
      mockDb.select.mockReturnValueOnce(
        createSelectChain([defaultModelConfig]),
      );
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
      mockDb.select.mockReturnValueOnce(
        createSelectChain([defaultModelConfig]),
      );
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
        call: {
          id: 'err-num',
          status: 'failed',
          error: 'Tool execution failed',
        },
      });
    });

    it('mapStopReason 处理 tool_use 别名', async () => {
      mockDb.select.mockReturnValueOnce(
        createSelectChain([defaultModelConfig]),
      );
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
      mockDb.select.mockReturnValueOnce(
        createSelectChain([defaultModelConfig]),
      );
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
      expect((events[0] as { call: { id: string } }).call.id).toHaveLength(36);
    });
  });

  describe('serializeContentBlocks branch coverage', () => {
    it('序列化 audio/resource/resource_link/default 类型 content block', async () => {
      mockDb.select.mockReturnValueOnce(
        createSelectChain([defaultModelConfig]),
      );
      const session = await adapter.createSession(createParams());

      const blocks: ContentBlock[] = [
        {
          type: 'audio',
          mimeType: 'audio/wav',
          data: 'base64data',
        } as ContentBlock,
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

  describe('普通工具免审批回归', () => {
    it('携带 path/paths/cwd 的普通工具也不会进入 awaiting_permission', async () => {
      mockDb.select.mockReturnValueOnce(
        createSelectChain([defaultModelConfig]),
      );
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
            type: 'tool_execution_start',
            toolCallId: 'call-paths',
            toolName: 'multi_file',
            args: {
              paths: ['/tmp/a.txt', '/tmp/b.txt', '', 42],
              cwd: '/workspace',
            },
          });
          agent.emit({
            type: 'agent_end',
            messages: [{ role: 'assistant', stopReason: 'stop' }],
          });
        }
      };

      await expect(
        collectEvents(
          adapter.prompt(session.id, [{ type: 'text', text: 'go' }]),
        ),
      ).resolves.toEqual([
        {
          type: 'tool_call',
          call: {
            id: 'call-paths',
            tool: 'multi_file',
            args: {
              paths: ['/tmp/a.txt', '/tmp/b.txt', '', 42],
              cwd: '/workspace',
            },
            status: 'in_progress',
          },
        },
        { type: 'done', stopReason: 'end_turn' },
      ]);
      expect(
        mockToolPermissionSyncService.registerPendingResolution,
      ).not.toHaveBeenCalled();
    });
  });

  describe('signal pre-aborted', () => {
    it('signal 已 aborted 时立即 cancel permission', async () => {
      mockDb.select.mockReturnValueOnce(
        createSelectChain([defaultModelConfig]),
      );
      const session = await adapter.createSession(createParams());

      hoisted.MockPiAgent.script = async (agent) => {
        // 先 abort signal
        agent.abortController.abort();

        const result = await agent.options.beforeToolCall?.(
          {
            toolCall: {
              id: 'call-aborted',
              name: 'apply_change',
              arguments: { proposal: { requiresConfirmation: true } },
            },
            args: { proposal: { requiresConfirmation: true } },
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
      mockDb.select.mockReturnValueOnce(
        createSelectChain([defaultModelConfig]),
      );
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
    it('从 toolCallId 别名提取 id', () => {
      expect(
        (
          adapter as unknown as {
            getToolCallId: (context: unknown) => string;
          }
        ).getToolCallId({
          toolCall: {
            toolCallId: 'alt-id-123',
            toolName: 'alt-tool',
          },
        }),
      ).toBe('alt-id-123');
    });

    it('id/name 均缺失时使用 fallback', () => {
      const helper = adapter as unknown as {
        getToolCallId: (context: unknown) => string;
        getToolName: (context: unknown) => string;
      };

      expect(helper.getToolCallId({ toolCall: {} })).toHaveLength(36);
      expect(helper.getToolName({ toolCall: {} })).toBe('unknown_tool');
    });
  });
  describe('code tool runtime behavior', () => {
    it('normalizes every supported language and forwards code, input, overrides, and timeout', async () => {
      const execute = vi.fn().mockImplementation(async (params: unknown) => ({
        success: true,
        output: params,
        stdout: '',
        stderr: '',
        executionTimeMs: 1,
      }));
      type AdapterArgs = ConstructorParameters<typeof PiAgentCoreAdapter>;
      adapter = new PiAgentCoreAdapter(
        mockDb as unknown as AdapterArgs[0],
        mockPiAiAdapter as unknown as AdapterArgs[1],
        mockMcpService as unknown as AdapterArgs[2],
        mockRagService as unknown as AdapterArgs[3],
        { execute } as unknown as AdapterArgs[4],
        mockToolPermissionSyncService as unknown as AdapterArgs[5],
      );
      mockDb.select.mockReturnValueOnce(
        createSelectChain([defaultModelConfig]),
      );

      const session = await adapter.createSession(
        createParams({
          runtimeConfig: {
            tools: [
              {
                toolId: 'ts',
                name: 'Type Script',
                description: 'typed execution',
                toolType: 'code',
                language: 'typescript',
                code: 'output = input',
                timeout: 9,
                parameterOverrides: { fixed: true },
                enabled: true,
              },
              {
                toolId: 'js',
                name: '123 JS',
                toolType: 'code',
                language: 'javascript',
                enabled: true,
              },
              {
                toolId: 'py',
                name: 'Python',
                toolType: 'code',
                language: 'python',
                code: 'output = input',
                enabled: true,
              },
              {
                toolId: 'sh',
                name: 'Bash',
                language: 'bash',
                code: 'echo ok',
                enabled: true,
              },
              {
                toolId: 'disabled',
                name: 'Disabled',
                toolType: 'code',
                language: 'javascript',
                enabled: false,
              },
              {
                toolId: 'invalid',
                name: 'Invalid',
                toolType: 'code',
                language: 'ruby',
                enabled: true,
              } as never,
            ],
            knowledgeBindings: [],
          },
        }),
      );

      hoisted.MockPiAgent.script = async (agent) => {
        expect(
          agent.tools.map((item) => (item as { name: string }).name),
        ).toEqual(['Type_Script', 'tool_123_JS', 'Python', 'Bash']);
        for (const piTool of agent.tools as Array<{
          execute: (
            id: string,
            params: unknown,
            signal?: AbortSignal,
          ) => Promise<unknown>;
        }>) {
          await piTool.execute('code-call', { runtime: 1 });
        }
        agent.emit({
          type: 'agent_end',
          messages: [{ role: 'assistant', stopReason: 'stop' }],
        });
      };

      await collectEvents(
        adapter.prompt(session.id, [{ type: 'text', text: 'run code' }]),
      );

      expect(execute.mock.calls.map(([params]) => params)).toEqual([
        {
          language: 'typescript',
          code: 'output = input',
          input: { runtime: 1, fixed: true },
          timeout: 9,
        },
        {
          language: 'javascript',
          code: '',
          input: { runtime: 1 },
          timeout: 30,
        },
        {
          language: 'python',
          code: 'output = input',
          input: { runtime: 1 },
          timeout: 30,
        },
        {
          language: 'bash',
          code: 'echo ok',
          input: { runtime: 1 },
          timeout: 30,
        },
      ]);
      expect(hoisted.flexibleSchemaToTypeBox).toHaveBeenCalledTimes(8);
      expect(hoisted.flexibleSchemaToTypeBox.mock.calls[0]?.[0]).toMatchObject({
        jsonSchema: {
          type: 'object',
          properties: {
            input: {
              description: '传入代码工具的结构化输入',
            },
          },
          additionalProperties: true,
        },
      });
    });

    it('returns an actionable tool result when CodeExecutionService is absent', async () => {
      mockDb.select.mockReturnValueOnce(
        createSelectChain([defaultModelConfig]),
      );
      const session = await adapter.createSession(
        createParams({
          runtimeConfig: {
            tools: [
              {
                toolId: 'code-1',
                name: '',
                toolType: 'code',
                language: 'python',
                enabled: true,
              },
            ],
            knowledgeBindings: [],
          },
        }),
      );

      hoisted.MockPiAgent.script = async (agent) => {
        const tool = agent.tools[0] as {
          name: string;
          description: string;
          execute: (
            id: string,
            params: unknown,
          ) => Promise<{
            content: Array<{ text: string }>;
            details: unknown;
          }>;
        };
        expect(tool.name).toBe('code_code-1');
        expect(tool.description).toBe('执行 python 代码片段');
        const result = await tool.execute('call', 'not-an-object');
        expect(result.details).toEqual({
          success: false,
          message:
            'In-process runtime 未配置 CodeExecutionService，无法执行 python 代码工具。',
          toolId: 'code-1',
          language: 'python',
          code: '',
          input: {},
        });
        expect(result.content[0]?.text).toContain('CodeExecutionService');
        agent.emit({
          type: 'agent_end',
          messages: [{ role: 'assistant', stopReason: 'stop' }],
        });
      };

      await collectEvents(
        adapter.prompt(session.id, [{ type: 'text', text: 'run' }]),
      );
    });
  });

  describe('session stream and abort boundaries', () => {
    it('uses explicit session id and omits API-key callback when the model has no key', async () => {
      mockPiAiAdapter.getPiRuntimeModel.mockResolvedValueOnce({
        model: { id: 'without-key' },
      });
      mockDb.select.mockReturnValueOnce(
        createSelectChain([defaultModelConfig]),
      );

      const session = await adapter.createSession(
        createParams({
          sessionId: 'fixed-session',
          systemPrompt: undefined,
          cwd: undefined,
          mcpServers: undefined,
          serverSandbox: undefined,
        }),
      );
      const agent = hoisted.MockPiAgent.instances[0];

      expect(session.id).toBe('fixed-session');
      expect(session.context).toEqual({ history: [] });
      expect(agent.options.initialState).toMatchObject({ systemPrompt: '' });
      expect(agent.options).not.toHaveProperty('getApiKey');
    });

    it('aborting an active permission wait cancels the gate and preserves completed status', async () => {
      mockDb.select.mockReturnValueOnce(
        createSelectChain([defaultModelConfig]),
      );
      const session = await adapter.createSession(createParams());
      hoisted.MockPiAgent.script = async (agent) => {
        const decision = await agent.options.beforeToolCall?.(
          {
            toolCall: {
              id: 'abort-call',
              name: 'apply_change',
              arguments: { path: '/tmp/a' },
            },
          },
          agent.abortController.signal,
        );
        expect(decision).toEqual({
          block: true,
          reason: 'Tool execution cancelled.',
        });
        agent.emit({
          type: 'agent_end',
          messages: [{ role: 'assistant', stopReason: 'aborted' }],
        });
      };

      const iterator = adapter
        .prompt(session.id, [{ type: 'text', text: 'mutate' }])
        [Symbol.asyncIterator]();
      await expect(iterator.next()).resolves.toMatchObject({
        value: {
          type: 'tool_call',
          call: { id: 'abort-call', status: 'awaiting_permission' },
        },
      });

      await adapter.cancel(session.id);
      await expect(collectIteratorRest(iterator)).resolves.toEqual([
        { type: 'done', stopReason: 'cancelled' },
      ]);
      expect((await adapter.loadSession(session.id)).status).toBe('completed');
      expect(
        mockToolPermissionSyncService.unregisterPendingResolution,
      ).toHaveBeenCalledWith(session.id, 'abort-call');
    });

    it('does not append empty assistant history after a stream with no text deltas', async () => {
      mockDb.select.mockReturnValueOnce(
        createSelectChain([defaultModelConfig]),
      );
      const session = await adapter.createSession(createParams());
      hoisted.MockPiAgent.script = async (agent) => {
        agent.emit({
          type: 'message_update',
          assistantMessageEvent: { type: 'text_delta', delta: '' },
        });
        agent.emit({
          type: 'agent_end',
          messages: [],
        });
      };

      await expect(
        collectEvents(
          adapter.prompt(session.id, [{ type: 'text', text: 'silent' }]),
        ),
      ).resolves.toEqual([
        { type: 'message_chunk', content: '' },
        { type: 'done', stopReason: 'end_turn' },
      ]);
      expect((await adapter.loadSession(session.id)).context.history).toEqual([
        { type: 'text', text: 'silent' },
      ]);
    });
    it('normalizes non-Error prompt failures for stream consumers', async () => {
      mockDb.select.mockReturnValueOnce(
        createSelectChain([defaultModelConfig]),
      );
      const session = await adapter.createSession(createParams());
      hoisted.MockPiAgent.script = async () => {
        throw 'string failure';
      };

      await expect(
        collectEvents(
          adapter.prompt(session.id, [{ type: 'text', text: 'fail' }]),
        ),
      ).rejects.toThrow('string failure');
      expect((await adapter.loadSession(session.id)).status).toBe('error');
    });

    it('resolves an explicitly selected model and rejects missing selected/default models', async () => {
      mockDb.select.mockReturnValueOnce(
        createSelectChain([defaultModelConfig]),
      );
      const selected = await adapter.createSession(
        createParams({ llmModelConfigId: 'model-config-001' }),
      );
      expect(selected.llmModelConfigId).toBe('model-config-001');

      mockDb.select.mockReturnValueOnce(createSelectChain([]));
      await expect(
        adapter.createSession(
          createParams({
            sessionId: 'missing-selected',
            llmModelConfigId: 'missing-model',
          }),
        ),
      ).rejects.toThrow('LLM 模型配置不存在: missing-model');

      mockDb.select.mockReturnValueOnce(createSelectChain([]));
      await expect(
        adapter.createSession(
          createParams({
            sessionId: 'missing-default',
            llmModelConfigId: undefined,
          }),
        ),
      ).rejects.toThrow('租户 tenant-001 未配置默认 LLM 模型');
    });
  });
  describe('remaining runtime branch contracts', () => {
    it('normalizes inferred HTTP tools and drops malformed runtime bindings', async () => {
      mockDb.select.mockReturnValueOnce(
        createSelectChain([defaultModelConfig]),
      );

      await adapter.createSession(
        createParams({
          runtimeConfig: {
            tools: [
              {
                toolId: 'inferred-http',
                name: '9 status!',
                url: 'https://example.com/status',
                enabled: true,
              } as never,
              {
                toolId: 'missing-url',
                name: 'broken-http',
                toolType: 'http',
                enabled: true,
              } as never,
              {
                toolId: 'unknown',
                name: 'unknown',
                enabled: true,
              } as never,
            ],
          },
        }),
      );

      const tools = hoisted.MockPiAgent.instances[0]?.options.initialState
        ?.tools as Array<{
        name: string;
        description: string;
      }>;
      expect(tools).toEqual([
        expect.objectContaining({
          name: 'tool_9_status_',
          description: '通过 GET https://example.com/status 调用 HTTP 接口',
        }),
      ]);
    });

    it('omits MCP and knowledge tools when their optional services are unavailable', async () => {
      type AdapterArgs = ConstructorParameters<typeof PiAgentCoreAdapter>;
      adapter = new PiAgentCoreAdapter(
        mockDb as unknown as AdapterArgs[0],
        mockPiAiAdapter as unknown as AdapterArgs[1],
        undefined,
        undefined,
        undefined,
        mockToolPermissionSyncService as unknown as AdapterArgs[5],
      );
      mockDb.select.mockReturnValueOnce(
        createSelectChain([defaultModelConfig]),
      );

      await adapter.createSession(
        createParams({
          runtimeConfig: {
            tools: [
              {
                toolId: 'mcp-without-service',
                toolType: 'mcp',
                mcpServerConfigId: 'mcp-1',
                toolName: 'search',
                enabled: true,
              } as never,
            ],
            knowledgeBindings: [
              {
                knowledgeBaseId: 'kb-1',
                enabled: true,
              },
            ],
          },
        }),
      );

      expect(hoisted.MockPiAgent.instances[0]?.tools).toEqual([]);
    });

    it('uses direct MCP descriptors, skips incomplete descriptors, and blocks stdio without a sandbox', async () => {
      mockMcpService.resolveRuntimeConnection.mockResolvedValueOnce({
        transportType: 'stdio',
        command: 'node',
      });
      mockDb.select.mockReturnValueOnce(
        createSelectChain([defaultModelConfig]),
      );
      const session = await adapter.createSession(
        createParams({
          runtimeConfig: {
            runtimeMode: 'no_sandbox',
            tools: [
              {
                toolId: 'direct-mcp',
                toolType: 'mcp',
                mcpServerConfigId: 'mcp-direct',
                toolName: 'raw search',
                enabled: true,
              } as never,
              {
                toolId: 'incomplete-mcp',
                toolType: 'mcp',
                enabled: true,
              } as never,
            ],
          },
        }),
      );

      hoisted.MockPiAgent.script = async (agent) => {
        const piTool = agent.tools[0] as {
          name: string;
          description: string;
          execute: (id: string, params: unknown) => Promise<unknown>;
        };
        expect(agent.tools).toHaveLength(1);
        expect(piTool.name).toBe('raw_search');
        expect(piTool.description).toBe('');
        await expect(
          piTool.execute('mcp-call', { query: 'docs' }),
        ).rejects.toThrow('禁止执行 stdio MCP');
        agent.emit({
          type: 'agent_end',
          messages: [{ role: 'assistant', stopReason: 'stop' }],
        });
      };

      await collectEvents(
        adapter.prompt(session.id, [{ type: 'text', text: 'search' }]),
      );
      expect(mockMcpService.resolveRuntimeConnection).toHaveBeenCalledWith(
        'mcp-direct',
        'tenant-001',
      );
      expect(mockMcpService.callRuntimeTool).not.toHaveBeenCalled();
      expect(hoisted.normalizeFlexibleSchemaJson).toHaveBeenCalledWith(
        undefined,
      );
    });

    it('validates knowledge IDs and derives defaults for multi-binding searches', async () => {
      mockDb.select.mockReturnValueOnce(
        createSelectChain([defaultModelConfig]),
      );
      const session = await adapter.createSession(
        createParams({
          runtimeConfig: {
            knowledgeBindings: [
              {
                knowledgeBaseId: 'kb-1',
                topK: 3,
                similarityThreshold: 0.4,
                enabled: true,
              },
              {
                knowledgeBaseId: 'kb-2',
                topK: 12,
                similarityThreshold: 0.7,
                enabled: true,
              },
            ],
          },
        }),
      );

      hoisted.MockPiAgent.script = async (agent) => {
        const knowledgeTool = agent.tools[0] as {
          execute: (
            id: string,
            params: unknown,
          ) => Promise<{
            details: {
              knowledgeBaseIds: string[];
              total: number;
            };
          }>;
        };
        await expect(knowledgeTool.execute('missing', {})).rejects.toThrow(
          '必须提供 knowledgeBaseIds',
        );
        await expect(
          knowledgeTool.execute('invalid', {
            knowledgeBaseIds: ['kb-1', '', 7, 'kb-other'],
          }),
        ).rejects.toThrow('非法 ID: kb-other');

        const result = await knowledgeTool.execute('valid', {
          query: 42,
          knowledgeBaseIds: ['kb-1', 'kb-2'],
          topK: Number.NaN,
        });
        expect(result.details).toMatchObject({
          knowledgeBaseIds: ['kb-1', 'kb-2'],
          total: 1,
        });
        agent.emit({
          type: 'agent_end',
          messages: [{ role: 'assistant', stopReason: 'stop' }],
        });
      };

      await collectEvents(
        adapter.prompt(session.id, [{ type: 'text', text: 'knowledge' }]),
      );
      expect(mockRagService.search).toHaveBeenCalledWith('', 'tenant-001', {
        knowledgeBaseIds: ['kb-1', 'kb-2'],
        limit: 12,
      });
    });

    it('preserves raw tool results, normalizes defaults, and exposes Error messages', async () => {
      mockDb.select.mockReturnValueOnce(
        createSelectChain([defaultModelConfig]),
      );
      const session = await adapter.createSession(createParams());
      adapter.registerSessionToolProvider(session.id, async () => ({}));
      const execute = vi.fn().mockResolvedValue(undefined);
      adapter.registerSessionToolProvider(
        session.id,
        async () =>
          ({
            rawTool: {
              inputSchema: z.object({}),
              execute,
            },
          }) as unknown as ToolSet,
      );

      hoisted.MockPiAgent.script = async (agent) => {
        const piTool = agent.tools[0] as {
          description: string;
          execute: (
            id: string,
            params: unknown,
            signal?: AbortSignal,
          ) => Promise<{ content: Array<{ text: string }>; details: unknown }>;
        };
        expect(piTool.description).toBe('');
        await expect(
          piTool.execute(
            'raw-call',
            { value: 1 },
            agent.abortController.signal,
          ),
        ).resolves.toEqual({
          content: [{ type: 'text', text: '' }],
          details: undefined,
        });

        agent.emit({
          type: 'message_update',
          assistantMessageEvent: null,
        });
        agent.emit({
          type: 'tool_execution_start',
          toolCallId: '',
          toolName: '',
          args: 'not-an-object',
        });
        agent.emit({
          type: 'tool_execution_end',
          toolCallId: 'raw-result',
          toolName: 'rawTool',
          result: { raw: true },
          isError: false,
        });
        agent.emit({
          type: 'tool_execution_end',
          toolCallId: 'error-result',
          toolName: 'rawTool',
          result: { details: new Error('process failed') },
          isError: true,
        });
        agent.emit({ type: 'agent_end' });
      };

      const events = await collectEvents(
        adapter.prompt(session.id, [{ type: 'text', text: 'raw' }]),
      );
      expect(execute).toHaveBeenCalledWith(
        { value: 1 },
        expect.objectContaining({
          toolCallId: 'raw-call',
          abortSignal: expect.any(AbortSignal),
        }),
      );
      expect(events).toEqual([
        {
          type: 'tool_call',
          call: {
            id: expect.any(String),
            tool: 'unknown_tool',
            args: {},
            status: 'in_progress',
          },
        },
        {
          type: 'tool_call',
          call: {
            id: 'raw-result',
            tool: 'rawTool',
            args: {},
            status: 'completed',
            result: { raw: true },
          },
        },
        {
          type: 'tool_call',
          call: {
            id: 'error-result',
            tool: 'rawTool',
            args: {},
            status: 'failed',
            error: 'process failed',
          },
        },
        { type: 'done', stopReason: 'end_turn' },
      ]);
    });

    it('rejects duplicate permission waits and missing local or distributed gates', async () => {
      mockDb.select.mockReturnValueOnce(
        createSelectChain([defaultModelConfig]),
      );
      const session = await adapter.createSession(createParams());
      hoisted.MockPiAgent.script = async (agent) => {
        const context = {
          toolCall: {
            id: 'duplicate-call',
            name: 'apply_change',
            arguments: { path: '/tmp/change' },
          },
        };
        const first = agent.options.beforeToolCall?.(context);
        await expect(agent.options.beforeToolCall?.(context)).rejects.toThrow(
          'already has a pending tool permission',
        );
        await adapter.resolveToolPermission(
          session.id,
          'duplicate-call',
          'approve',
        );
        await expect(first).resolves.toBeUndefined();
        agent.emit({
          type: 'agent_end',
          messages: [{ role: 'assistant', stopReason: 'stop' }],
        });
      };

      await collectEvents(
        adapter.prompt(session.id, [{ type: 'text', text: 'change' }]),
      );

      type AdapterArgs = ConstructorParameters<typeof PiAgentCoreAdapter>;
      const adapterWithoutSync = new PiAgentCoreAdapter(
        mockDb as unknown as AdapterArgs[0],
        mockPiAiAdapter as unknown as AdapterArgs[1],
        mockMcpService as unknown as AdapterArgs[2],
        mockRagService as unknown as AdapterArgs[3],
      );
      await expect(
        adapterWithoutSync.resolveToolPermission(
          'missing-session',
          'missing-call',
          'approve',
        ),
      ).rejects.toBeInstanceOf(
        ToolPermissionResolutionNotAllowedException,
      );
    });
  });
});
