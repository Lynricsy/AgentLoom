import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockedFunction,
} from 'vitest';
import { jsonSchema, tool } from 'ai';

import { SandboxAgentAdapter } from '../sandbox-agent.adapter';
import { CodeExecutionService } from '../code-execution.service';
import type { CreateSessionParams } from '../types/agent-session.types';
import type { AgentEvent } from '../types/agent-event.types';
import { RagService } from '../../knowledge/services/rag.service';
import { PiConfigGeneratorService } from '../../sandbox/pi-config-generator.service';
import type { SandboxRuntimeDriver } from '../../sandbox/sandbox-runtime-driver.port';
import type { RequestInit as UndiciRequestInit } from 'undici';
import { ToolPermissionResolutionNotAllowedException } from '../../../common/exceptions/tool-call.exceptions';

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
  let mockDb: {
    transaction: ReturnType<typeof vi.fn>;
    select: ReturnType<typeof vi.fn>;
  };
  let mockSandboxService: {
    getSandboxSession: ReturnType<typeof vi.fn>;
    findByConversationId: ReturnType<typeof vi.fn>;
    findLatestByExecutionId: ReturnType<typeof vi.fn>;
    findLatestByConversationId: ReturnType<typeof vi.fn>;
    getSandboxLogs: ReturnType<typeof vi.fn>;
  };
  let mockRuntimeDriver: {
    getPromptUrl: ReturnType<typeof vi.fn>;
    healthCheck: ReturnType<typeof vi.fn>;
    getSessionUrl: ReturnType<typeof vi.fn>;
    requestGuest: MockedFunction<SandboxRuntimeDriver['requestGuest']>;
  };
  let mockMcpService: {
    resolveRuntimeConnection: ReturnType<typeof vi.fn>;
    callRuntimeTool: ReturnType<typeof vi.fn>;
  };
  let mockRagService: {
    search: ReturnType<typeof vi.fn>;
  };
  let mockCodeExecutionService: {
    execute: ReturnType<typeof vi.fn>;
  };
  let mockDecryptionBoundaryService: {
    decryptApiKey: ReturnType<typeof vi.fn>;
    decryptConfiguredApiKey: ReturnType<typeof vi.fn>;
  };
  let mockSelfEvolutionService: {
    supportsTool: ReturnType<typeof vi.fn>;
    handleSessionToolPreflight: ReturnType<typeof vi.fn>;
    handleSessionToolExecute: ReturnType<typeof vi.fn>;
  };
  let piConfigGenerator: PiConfigGeneratorService;

  const storedModelConfig = {
    id: 'model-config-001',
    orgId: 'org-001',
    tenantId: 'tenant-001',
    providerId: 'provider-001',
    name: 'Claude Opus 4.6',
    modelId: 'claude-opus-4-6',
    modelType: 'chat',
    isEnabled: true,
    isDefault: true,
    capabilities: {},
    contextWindow: 200_000,
    maxOutputTokens: 8_192,
    pricing: null,
    parameters: {},
    metadataSource: 'manual',
    timeoutMs: 30_000,
    embeddingDimensions: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const storedProvider = {
    id: 'provider-001',
    orgId: 'org-001',
    tenantId: 'tenant-001',
    slug: 'anthropic',
    name: 'Anthropic',
    iconUrl: null,
    baseUrl: 'https://api.anthropic.com',
    defaultBaseUrl: 'https://api.anthropic.com',
    isBuiltin: true,
    isEnabled: true,
    apiProtocol: 'anthropic',
    apiKeyId: 'api-key-001',
    sortOrder: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
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
    mockDb = {
      transaction: vi.fn(async (operation) =>
        operation({
          execute: vi.fn(),
          select: mockDb.select,
        }),
      ),
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          innerJoin: vi.fn(() => ({
            where: vi.fn().mockResolvedValue([
              {
                config: storedModelConfig,
                provider: storedProvider,
              },
            ]),
          })),
        })),
      })),
    };
    mockSandboxService = {
      getSandboxSession: vi.fn().mockResolvedValue({
        id: 'sandbox-001',
        status: 'ready',
        runtimeHandle: 'abc123def456',
      }),
      findByConversationId: vi.fn().mockResolvedValue({
        id: 'sandbox-001',
        status: 'ready',
        runtimeHandle: 'abc123def456',
      }),
      findLatestByExecutionId: vi.fn().mockResolvedValue(null),
      findLatestByConversationId: vi.fn().mockResolvedValue(null),
      getSandboxLogs: vi.fn().mockResolvedValue([]),
    };
    mockRuntimeDriver = {
      getPromptUrl: vi.fn(),
      healthCheck: vi.fn().mockResolvedValue(true),
      getSessionUrl: vi
        .fn()
        .mockResolvedValue('http://127.0.0.1:49123/v1/session'),
      requestGuest: vi.fn(
        async (
          _runtimeHandle: string,
          path: string,
          init?: UndiciRequestInit,
        ) =>
          globalThis.fetch(
            `http://127.0.0.1:49123${path}`,
            init as globalThis.RequestInit,
          ),
      ),
    };
    mockMcpService = {
      resolveRuntimeConnection: vi.fn(),
      callRuntimeTool: vi.fn(),
    };
    mockRagService = {
      search: vi.fn().mockResolvedValue([]),
    };
    mockCodeExecutionService = {
      execute: vi.fn(),
    };
    mockDecryptionBoundaryService = {
      decryptApiKey: vi.fn().mockResolvedValue('sk-ant-test'),
      decryptConfiguredApiKey: vi.fn(),
    };
    mockSelfEvolutionService = {
      supportsTool: vi.fn().mockReturnValue(false),
      handleSessionToolPreflight: vi.fn(),
      handleSessionToolExecute: vi.fn(),
    };
    piConfigGenerator = new PiConfigGeneratorService();
    // createSession 的容器初始化 POST 默认返回成功
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ success: true }),
    } as unknown as Response);
    adapter = new SandboxAgentAdapter(
      mockDb as never,
      mockSandboxService as never,
      mockRuntimeDriver as never,
      mockMcpService as never,
      mockRagService as never,
      mockCodeExecutionService as never,
      mockDecryptionBoundaryService as never,
      piConfigGenerator,
      mockSelfEvolutionService as never,
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

  function createHangingSseResponse(chunks: string[]): {
    response: Response;
    read: ReturnType<typeof vi.fn>;
    cancel: ReturnType<typeof vi.fn>;
  } {
    const encoder = new TextEncoder();
    const read = vi.fn(async () => {
      if (chunks.length > 0) {
        return {
          done: false,
          value: encoder.encode(chunks.shift()!),
        };
      }

      return new Promise<ReadableStreamReadResult<Uint8Array>>(() => {
        // 模拟容器端已经发出 done，但底层连接迟迟不主动关闭。
      });
    });
    const cancel = vi.fn().mockResolvedValue(undefined);

    return {
      response: {
        ok: true,
        status: 200,
        body: {
          getReader: () => ({
            read,
            cancel,
          }),
        },
      } as unknown as Response,
      read,
      cancel,
    };
  }

  it('应保留 RagService 与 CodeExecutionService 的 Nest 注入元数据', () => {
    const paramTypes = Reflect.getMetadata(
      'design:paramtypes',
      SandboxAgentAdapter,
    ) as unknown[];

    expect(paramTypes[4]).toBe(RagService);
    expect(paramTypes[5]).toBe(CodeExecutionService);
  });

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

    it('应保留 runtimeConfig 供 remote tool 回调使用', async () => {
      const runtimeConfig = {
        selfEvolutionPolicy: {
          enabled: true,
          resourceManagement: true,
          externalEditing: true,
          sandboxManagement: true,
        },
      };

      const session = await adapter.createSession({
        ...defaultParams,
        runtimeConfig,
      });

      expect(session.runtimeConfig).toEqual(runtimeConfig);
    });

    it('有 executionId 和 tenantId 时应调用容器 session 初始化', async () => {
      const session = await adapter.createSession(defaultParams);

      expect(mockSandboxService.getSandboxSession).toHaveBeenCalledWith(
        'exec-001',
        'tenant-001',
        undefined,
      );
      expect(mockRuntimeDriver.healthCheck).toHaveBeenCalledWith(
        'abc123def456',
      );
      expect(mockRuntimeDriver.requestGuest).toHaveBeenCalledWith(
        'abc123def456',
        '/v1/session',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: expect.stringContaining('"createCodingTools":true'),
        }),
      );
      expect(session.status).toBe('active');
    });

    it('共享 sandbox 会话初始化时应下发 session 级模型配置，并强制 provider 走 runtime API key', async () => {
      await adapter.createSession(defaultParams);

      const fetchCall = vi.mocked(globalThis.fetch).mock.calls[0];
      const payload = JSON.parse(String(fetchCall?.[1]?.body)) as Record<
        string,
        unknown
      >;

      expect(payload).toMatchObject({
        systemPrompt: 'You are a sandbox agent.',
        settings: {
          defaultProvider: 'anthropic',
          defaultModel: 'claude-opus-4-6',
        },
        runtimeApiKeys: {
          anthropic: 'sk-ant-test',
        },
      });
      expect(payload).toHaveProperty('models.providers.anthropic');
      expect(payload).toHaveProperty(
        'models.providers.anthropic.models.0.id',
        'claude-opus-4-6',
      );
      expect(payload).toHaveProperty(
        'models.providers.anthropic.apiKey',
        '__runtime__',
      );
      expect(mockDecryptionBoundaryService.decryptApiKey).toHaveBeenCalledWith(
        'api-key-001',
        'tenant-001',
        'SandboxAgentAdapter',
      );
    });

    it('openai_responses 协议应在容器 session 初始化时下发 openai-responses api', async () => {
      const openAiModelConfig = {
        ...storedModelConfig,
        name: 'GPT-5.4',
        modelId: 'gpt-5.4',
      };
      const openAiProvider = {
        ...storedProvider,
        slug: 'openai',
        name: 'OpenAI',
        baseUrl: 'https://models.example.test',
        defaultBaseUrl: null,
        apiProtocol: 'openai_responses' as const,
        apiKeyId: 'api-key-openai',
      };

      mockDb.select.mockReturnValueOnce({
        from: vi.fn(() => ({
          innerJoin: vi.fn(() => ({
            where: vi.fn().mockResolvedValue([
              {
                config: openAiModelConfig,
                provider: openAiProvider,
              },
            ]),
          })),
        })),
      });
      mockDecryptionBoundaryService.decryptApiKey.mockResolvedValueOnce(
        'sk-openai-test',
      );

      await adapter.createSession(defaultParams);

      const fetchCall = vi.mocked(globalThis.fetch).mock.calls[0];
      const payload = JSON.parse(String(fetchCall?.[1]?.body)) as Record<
        string,
        unknown
      >;

      expect(payload).toMatchObject({
        settings: {
          defaultProvider: 'openai',
          defaultModel: 'gpt-5.4',
        },
        runtimeApiKeys: {
          openai: 'sk-openai-test',
        },
      });
      expect(payload).toHaveProperty(
        'models.providers.openai.api',
        'openai-responses',
      );
      expect(payload).toHaveProperty(
        'models.providers.openai.baseUrl',
        'https://models.example.test/v1',
      );
      expect(payload).toHaveProperty(
        'models.providers.openai.apiKey',
        '__runtime__',
      );
    });

    it('没有 runtime API key 时应保留 provider 的 env 占位值', async () => {
      const adapterWithoutDecrypt = new SandboxAgentAdapter(
        mockDb as never,
        mockSandboxService as never,
        mockRuntimeDriver as never,
        mockMcpService as never,
        mockRagService as never,
        mockCodeExecutionService as never,
        undefined,
        piConfigGenerator,
        mockSelfEvolutionService as never,
      );

      await adapterWithoutDecrypt.createSession(defaultParams);

      const fetchCall = vi.mocked(globalThis.fetch).mock.calls[0];
      const payload = JSON.parse(String(fetchCall?.[1]?.body)) as Record<
        string,
        unknown
      >;

      expect(payload).not.toHaveProperty('runtimeApiKeys');
      expect(payload).toHaveProperty(
        'models.providers.anthropic.apiKey',
        'ANTHROPIC_API_KEY',
      );
    });

    it('有 MCP servers 时应使用更长的容器 session 初始化超时', async () => {
      const timeoutSpy = vi.spyOn(AbortSignal, 'timeout');

      await adapter.createSession({
        ...defaultParams,
        mcpServers: {
          WebSearch: {
            transportType: 'stdio',
            command: 'npx',
            args: ['-y', 'grok-search@latest'],
          } as never,
        },
      });

      expect(timeoutSpy).toHaveBeenCalledWith(90_000);
      timeoutSpy.mockRestore();
    });

    it('预注册 session tool provider 时应把 remoteToolExecution 一并下发到容器', async () => {
      const execute = vi.fn().mockResolvedValue('记忆检索完成');
      adapter.registerSessionToolProvider('session-preallocated', () => ({
        lookup_memory: tool({
          description: '检索记忆内容',
          inputSchema: jsonSchema({
            type: 'object',
            properties: {
              query: { type: 'string' },
            },
            required: ['query'],
            additionalProperties: false,
          }),
          execute,
        }),
      }));

      await adapter.createSession({
        ...defaultParams,
        sessionId: 'session-preallocated',
      });

      const fetchCall = vi.mocked(globalThis.fetch).mock.calls[0];
      const payload = JSON.parse(String(fetchCall?.[1]?.body)) as Record<
        string,
        unknown
      >;

      expect(payload.sessionId).toBe('session-preallocated');
      expect(payload).toHaveProperty('remoteToolExecution');
      expect(payload.remoteToolExecution).toMatchObject({
        sessionId: 'session-preallocated',
        callbackUrl: expect.stringContaining(
          '/api/v1/agent-runtime/sessions/session-preallocated/tool-executions',
        ),
        tools: [
          expect.objectContaining({
            name: 'lookup_memory',
            description: '检索记忆内容',
            promptSnippet: '检索记忆内容',
          }),
        ],
      });
      expect(execute).not.toHaveBeenCalled();
    });

    it('runtimeConfig 的 knowledgeBindings 应在 session 初始化时下发为 remote tool', async () => {
      await adapter.createSession({
        ...defaultParams,
        runtimeConfig: {
          knowledgeBindings: [
            {
              knowledgeBaseId: 'kb-qa-1',
              topK: 3,
              similarityThreshold: 0.42,
              enabled: true,
            },
          ],
        },
      });

      const fetchCall = vi.mocked(globalThis.fetch).mock.calls[0];
      const payload = JSON.parse(String(fetchCall?.[1]?.body)) as Record<
        string,
        unknown
      >;

      expect(payload).toHaveProperty('remoteToolExecution');
      expect(payload.remoteToolExecution).toMatchObject({
        tools: [
          expect.objectContaining({
            name: 'search_knowledge',
            description: expect.stringContaining('knowledgeBaseIds'),
            promptSnippet: expect.stringContaining('knowledgeBaseIds'),
          }),
        ],
      });
      expect(mockRagService.search).not.toHaveBeenCalled();
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
      expect(mockRuntimeDriver.healthCheck).toHaveBeenCalledWith(
        'abc123def456',
      );
      expect(mockRuntimeDriver.requestGuest).toHaveBeenCalledWith(
        'abc123def456',
        '/v1/session',
        expect.any(Object),
      );
      expect(session.status).toBe('active');
    });

    it('conversation sandbox 创建失败后应优先抛出最近失败日志', async () => {
      mockSandboxService.findByConversationId.mockResolvedValueOnce(null);
      mockSandboxService.findLatestByConversationId.mockResolvedValueOnce({
        id: 'sandbox-failed',
        status: 'failed',
        runtimeHandle: null,
      });
      mockSandboxService.getSandboxLogs.mockResolvedValueOnce([
        {
          id: 'log-1',
          sessionId: 'sandbox-failed',
          level: 'system',
          message: 'Sandbox creation failed: image not found',
          createdAt: new Date('2026-04-07T10:00:00Z'),
        },
      ]);

      await expect(
        adapter.createSession({
          ...defaultParams,
          context: { agentConversationId: 'conv-001' },
        }),
      ).rejects.toThrow('Sandbox creation failed: image not found');

      expect(
        mockSandboxService.findLatestByConversationId,
      ).toHaveBeenCalledWith('conv-001', 'tenant-001');
      expect(mockSandboxService.getSandboxLogs).toHaveBeenCalledWith(
        'sandbox-failed',
      );
      expect(mockRuntimeDriver.getSessionUrl).not.toHaveBeenCalled();
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
      expect(mockRuntimeDriver.getSessionUrl).not.toHaveBeenCalled();
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
        runtimeHandle: 'abc123def456',
      });
      mockRuntimeDriver.healthCheck.mockResolvedValue(true);
      mockRuntimeDriver.getPromptUrl.mockResolvedValue(
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
        undefined,
      );
      expect(mockRuntimeDriver.healthCheck).toHaveBeenCalledWith(
        'abc123def456',
      );
      expect(mockRuntimeDriver.requestGuest).toHaveBeenCalledWith(
        'abc123def456',
        '/v1/prompt',
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

    it('prompt 请求应使用 1 小时默认超时，避免长响应被短时硬截断', async () => {
      const session = await adapter.createSession(defaultParams);
      mockSandboxService.getSandboxSession.mockResolvedValue({
        id: 'sandbox-001',
        status: 'ready',
        runtimeHandle: 'abc123def456',
      });
      mockRuntimeDriver.healthCheck.mockResolvedValue(true);
      mockRuntimeDriver.getPromptUrl.mockResolvedValue(
        'http://127.0.0.1:49123/v1/prompt',
      );

      const timeoutSpy = vi.spyOn(AbortSignal, 'timeout');
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi
        .fn()
        .mockResolvedValue(
          createSseResponse([
            'data: {"type":"done","stopReason":"end_turn"}\n\n',
          ]),
        );

      await collectEvents(
        adapter.prompt(session.id, [{ type: 'text', text: 'hello' }]),
      );

      expect(timeoutSpy).toHaveBeenCalledWith(3_600_000);

      timeoutSpy.mockRestore();
      globalThis.fetch = originalFetch;
    });

    it('应把容器 JSON-RPC SSE 事件翻译为规范 AgentEvent', async () => {
      const session = await adapter.createSession(defaultParams);
      mockRuntimeDriver.getPromptUrl.mockResolvedValue(
        'http://127.0.0.1:49123/v1/prompt',
      );

      globalThis.fetch = vi
        .fn()
        .mockResolvedValue(
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

    it('收到 done 事件后应立即结束，不等待 SSE 连接自己关闭', async () => {
      const session = await adapter.createSession(defaultParams);
      mockRuntimeDriver.getPromptUrl.mockResolvedValue(
        'http://127.0.0.1:49123/v1/prompt',
      );

      const { response, read, cancel } = createHangingSseResponse([
        'data: {"jsonrpc":"2.0","method":"event","params":{"type":"text_delta","data":{"delta":"hello"}}}\n\n' +
          'data: {"jsonrpc":"2.0","method":"event","params":{"type":"done","data":{"stopReason":"end_turn"}}}\n\n',
      ]);

      globalThis.fetch = vi.fn().mockResolvedValue(response);

      const eventsPromise = collectEvents(
        adapter.prompt(session.id, [{ type: 'text', text: 'hello' }]),
      );
      const timed = Promise.race([
        eventsPromise,
        new Promise<AgentEvent[]>((_, reject) => {
          setTimeout(() => reject(new Error('prompt did not finish')), 50);
        }),
      ]);

      await expect(timed).resolves.toEqual([
        { type: 'message_chunk', content: 'hello' },
        { type: 'done', stopReason: 'end_turn' },
      ]);
      expect(read).toHaveBeenCalledTimes(1);
      expect(cancel).toHaveBeenCalledTimes(1);
    });

    it('普通 tool_call_update 在缺少审批语义时应保持 in_progress', async () => {
      const session = await adapter.createSession(defaultParams);
      mockRuntimeDriver.getPromptUrl.mockResolvedValue(
        'http://127.0.0.1:49123/v1/prompt',
      );

      globalThis.fetch = vi
        .fn()
        .mockResolvedValue(
          createSseResponse([
            'data: {"jsonrpc":"2.0","method":"event","params":{"type":"tool_call_update","data":{"toolCallId":"tool-2","toolName":"bash","input":{"command":"pwd"},"content":"running..."}}}\n\n',
            'data: {"jsonrpc":"2.0","method":"event","params":{"type":"done","data":{"stopReason":"end_turn"}}}\n\n',
          ]),
        );

      const events = await collectEvents(
        adapter.prompt(session.id, [{ type: 'text', text: 'hello' }]),
      );

      expect(events).toEqual([
        {
          type: 'tool_call',
          call: {
            id: 'tool-2',
            tool: 'bash',
            args: { command: 'pwd' },
            status: 'in_progress',
          },
        },
        { type: 'done', stopReason: 'end_turn' },
      ]);
    });

    it('容器 error 事件应抛给上层', async () => {
      const session = await adapter.createSession(defaultParams);
      mockRuntimeDriver.getPromptUrl.mockResolvedValue(
        'http://127.0.0.1:49123/v1/prompt',
      );

      globalThis.fetch = vi
        .fn()
        .mockResolvedValue(
          createSseResponse([
            'data: {"jsonrpc":"2.0","method":"event","params":{"type":"error","data":{"message":"sandbox exploded"}}}\n\n',
          ]),
        );

      await expect(
        collectEvents(
          adapter.prompt(session.id, [{ type: 'text', text: 'hello' }]),
        ),
      ).rejects.toThrow('sandbox exploded');
    });

    it('应读取容器顶层 error.message，避免退化成泛化错误', async () => {
      const session = await adapter.createSession(defaultParams);
      mockRuntimeDriver.getPromptUrl.mockResolvedValue(
        'http://127.0.0.1:49123/v1/prompt',
      );

      globalThis.fetch = vi
        .fn()
        .mockResolvedValue(
          createSseResponse([
            `data: {"jsonrpc":"2.0","method":"event","params":{"type":"error","message":"Tool 'bash' permission denied","code":"PERMISSION_DENIED"}}\n\n`,
          ]),
        );

      await expect(
        collectEvents(
          adapter.prompt(session.id, [{ type: 'text', text: 'hello' }]),
        ),
      ).rejects.toThrow("Tool 'bash' permission denied");
    });

    it('模型提供方错误应保留 code 与 rawMessage', async () => {
      const session = await adapter.createSession(defaultParams);
      mockRuntimeDriver.getPromptUrl.mockResolvedValue(
        'http://127.0.0.1:49123/v1/prompt',
      );

      globalThis.fetch = vi
        .fn()
        .mockResolvedValue(
          createSseResponse([
            'data: {"jsonrpc":"2.0","method":"event","params":{"type":"error","message":"terminated","code":"MODEL_PROVIDER_ERROR"}}\n\n',
          ]),
        );

      const error = await collectEvents(
        adapter.prompt(session.id, [{ type: 'text', text: 'hello' }]),
      ).catch((value: Error & { code?: string; rawMessage?: string }) => value);

      expect(error).toBeInstanceOf(Error);
      expect(error).toMatchObject({
        message: 'terminated',
        code: 'MODEL_PROVIDER_ERROR',
        rawMessage: 'terminated',
      });
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
        runtimeHandle: 'abc123def456',
      });
      mockRuntimeDriver.healthCheck.mockResolvedValue(true);
      mockRuntimeDriver.getPromptUrl.mockResolvedValue(
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
        runtimeHandle: 'abc123def456',
      });
      mockRuntimeDriver.healthCheck.mockResolvedValue(true);
      mockRuntimeDriver.getPromptUrl.mockResolvedValue(
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
        runtimeHandle: 'abc123def456',
      });
      mockRuntimeDriver.healthCheck.mockResolvedValue(true);
      mockRuntimeDriver.getPromptUrl.mockResolvedValue(
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
        runtimeHandle: 'abc123def456',
      });
      mockRuntimeDriver.healthCheck.mockResolvedValue(true);
      mockRuntimeDriver.getPromptUrl.mockResolvedValue(
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
      mockRuntimeDriver.getPromptUrl.mockResolvedValue(
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
      mockRuntimeDriver.getPromptUrl.mockResolvedValue(
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
      ).rejects.toBeInstanceOf(ToolPermissionResolutionNotAllowedException);
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
      await adapter.resolveConversationToolPermission(
        'conv-001',
        'tool-2',
        'deny',
      );

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

      await adapter.resolveConversationToolPermission(
        'conv-001',
        'tool-dup',
        'deny',
      );
      await expect(first).resolves.toEqual({ allowed: false });
    });
  });

  describe('session tool callback bridge', () => {
    it('应在事务外执行 session-local tool 并返回结果', async () => {
      const execute = vi.fn().mockResolvedValue({
        items: ['memory-a'],
      });
      adapter.registerSessionToolProvider('session-tools-1', () => ({
        lookup_memory: tool({
          description: '检索记忆内容',
          inputSchema: jsonSchema({
            type: 'object',
            properties: {
              query: { type: 'string' },
            },
            required: ['query'],
            additionalProperties: false,
          }),
          execute,
        }),
      }));

      await adapter.createSession({
        ...defaultParams,
        sessionId: 'session-tools-1',
      });

      const initPayload = JSON.parse(
        String(vi.mocked(globalThis.fetch).mock.calls[0]?.[1]?.body),
      ) as {
        remoteToolExecution?: {
          callbackToken?: string;
        };
      };
      const callbackToken =
        initPayload.remoteToolExecution?.callbackToken ?? '';
      const transactionCallCountBeforeCallback =
        mockDb.transaction.mock.calls.length;

      await expect(
        adapter.executeSessionToolCallback(
          'session-tools-1',
          {
            sessionId: 'session-tools-1',
            toolCallId: 'tool-call-1',
            toolName: 'lookup_memory',
            input: { query: 'redis' },
          },
          callbackToken,
        ),
      ).resolves.toEqual({
        result: {
          items: ['memory-a'],
        },
      });

      expect(mockDb.transaction.mock.calls.length).toBe(
        transactionCallCountBeforeCallback,
      );
      expect(execute).toHaveBeenCalledWith(
        { query: 'redis' },
        expect.objectContaining({
          toolCallId: 'tool-call-1',
          messages: [],
        }),
      );
    });

    it('应将 self-evolution 工具的 preflight callback 分流到 SelfEvolutionService', async () => {
      mockSelfEvolutionService.supportsTool.mockReturnValue(true);
      mockSelfEvolutionService.handleSessionToolPreflight.mockResolvedValue({
        outcome: 'awaiting_permission',
        permissionRequest: {
          description: '主人授权后，Agent 将修改自身编排',
        },
      });
      adapter.registerSessionToolProvider('session-self-1', () => ({
        apply_change: tool({
          inputSchema: jsonSchema({ type: 'object' }),
          execute: vi.fn(),
        }),
      }));
      await adapter.createSession({
        ...defaultParams,
        sessionId: 'session-self-1',
        mode: 'conversation',
      });
      const initPayload = JSON.parse(
        String(vi.mocked(globalThis.fetch).mock.calls.at(-1)?.[1]?.body),
      ) as { remoteToolExecution: { callbackToken: string } };

      const result = await adapter.executeSessionToolCallback(
        'session-self-1',
        {
          sessionId: 'session-self-1',
          toolCallId: 'tool-call-self-1',
          toolName: 'apply_change',
          input: { proposal: { summary: '修改自身编排' } },
          phase: 'preflight',
        },
        initPayload.remoteToolExecution.callbackToken,
      );

      expect(
        mockSelfEvolutionService.handleSessionToolPreflight,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'session-self-1',
        }),
        'apply_change',
        'tool-call-self-1',
        { proposal: { summary: '修改自身编排' } },
      );
      expect(result).toEqual({
        outcome: 'awaiting_permission',
        permissionRequest: {
          description: '主人授权后，Agent 将修改自身编排',
        },
      });
    });

    it('应将 self-evolution 工具的 execute callback 分流到 SelfEvolutionService', async () => {
      mockSelfEvolutionService.supportsTool.mockReturnValue(true);
      mockSelfEvolutionService.handleSessionToolExecute.mockResolvedValue({
        result: {
          success: true,
          data: {
            applied: true,
          },
        },
      });
      adapter.registerSessionToolProvider('session-self-2', () => ({
        apply_change: tool({
          inputSchema: jsonSchema({ type: 'object' }),
          execute: vi.fn(),
        }),
      }));
      await adapter.createSession({
        ...defaultParams,
        sessionId: 'session-self-2',
        mode: 'conversation',
      });
      const initPayload = JSON.parse(
        String(vi.mocked(globalThis.fetch).mock.calls.at(-1)?.[1]?.body),
      ) as { remoteToolExecution: { callbackToken: string } };

      const result = await adapter.executeSessionToolCallback(
        'session-self-2',
        {
          sessionId: 'session-self-2',
          toolCallId: 'tool-call-self-2',
          toolName: 'apply_change',
          input: { proposal: { summary: '修改自身编排' } },
          phase: 'execute',
        },
        initPayload.remoteToolExecution.callbackToken,
      );

      expect(
        mockSelfEvolutionService.handleSessionToolExecute,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'session-self-2',
        }),
        'apply_change',
        'tool-call-self-2',
        { proposal: { summary: '修改自身编排' } },
      );
      expect(result).toEqual({
        result: {
          success: true,
          data: {
            applied: true,
          },
        },
      });
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
        runtimeHandle: 'abc123def456',
      });
      mockRuntimeDriver.healthCheck.mockResolvedValue(true);
      mockRuntimeDriver.getPromptUrl.mockResolvedValue(
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

      expect(events[0]).toEqual({
        type: 'message_chunk',
        content: 'via-content',
      });
    });

    it('text_delta with raw string data', async () => {
      const events = await createSessionAndPromptSse([
        'data: {"jsonrpc":"2.0","method":"event","params":{"type":"text_delta","data":"raw-string"}}\n\n',
        'data: {"jsonrpc":"2.0","method":"event","params":{"type":"done","data":{"stopReason":"end_turn"}}}\n\n',
      ]);

      expect(events[0]).toEqual({
        type: 'message_chunk',
        content: 'raw-string',
      });
    });

    it('text_delta with top-level params text field', async () => {
      const events = await createSessionAndPromptSse([
        'data: {"jsonrpc":"2.0","method":"event","params":{"type":"text_delta","text":"top-level-text"}}\n\n',
        'data: {"jsonrpc":"2.0","method":"event","params":{"type":"done","stopReason":"end_turn"}}\n\n',
      ]);

      expect(events).toEqual([
        {
          type: 'message_chunk',
          content: 'top-level-text',
        },
        {
          type: 'done',
          stopReason: 'end_turn',
        },
      ]);
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

    it('tool_call_start with top-level params preserves toolName and input', async () => {
      const events = await createSessionAndPromptSse([
        'data: {"jsonrpc":"2.0","method":"event","params":{"type":"tool_call_start","toolCallId":"t1-top","toolName":"mcp__WebSearch__search","input":{"query":"AgentLoom"}}}\n\n',
        'data: {"jsonrpc":"2.0","method":"event","params":{"type":"done","stopReason":"tool_use"}}\n\n',
      ]);

      expect(events).toEqual([
        {
          type: 'tool_call',
          call: expect.objectContaining({
            id: 't1-top',
            tool: 'mcp__WebSearch__search',
            args: { query: 'AgentLoom' },
            status: 'in_progress',
          }),
        },
        {
          type: 'done',
          stopReason: 'tool_use',
        },
      ]);
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

      expect(
        (
          events[0] as unknown as {
            type: 'tool_call';
            call: { args: Record<string, unknown> };
          }
        ).call.args,
      ).toEqual({ cmd: 'ls' });
    });

    it('normalizeToolArgs reads arguments field', async () => {
      const events = await createSessionAndPromptSse([
        'data: {"jsonrpc":"2.0","method":"event","params":{"type":"tool_call_start","data":{"toolCallId":"t7","toolName":"run","arguments":{"cmd":"ls"}}}}\n\n',
        'data: {"jsonrpc":"2.0","method":"event","params":{"type":"done","data":{"stopReason":"end_turn"}}}\n\n',
      ]);

      expect(
        (
          events[0] as unknown as {
            type: 'tool_call';
            call: { args: Record<string, unknown> };
          }
        ).call.args,
      ).toEqual({ cmd: 'ls' });
    });

    it('normalizeToolArgs returns {} when no candidates match', async () => {
      const events = await createSessionAndPromptSse([
        'data: {"jsonrpc":"2.0","method":"event","params":{"type":"tool_call_start","data":{"toolCallId":"t8","toolName":"run"}}}\n\n',
        'data: {"jsonrpc":"2.0","method":"event","params":{"type":"done","data":{"stopReason":"end_turn"}}}\n\n',
      ]);

      expect(
        (
          events[0] as unknown as {
            type: 'tool_call';
            call: { args: Record<string, unknown> };
          }
        ).call.args,
      ).toEqual({});
    });

    it('normalizeTransitions with valid entries', async () => {
      const transitions = [
        {
          from: 'pending',
          to: 'in_progress',
          timestamp: '2025-01-01T00:00:00Z',
          source: 'worker',
        },
        { to: 'completed', source: 'runtime' },
      ];
      const events = await createSessionAndPromptSse([
        `data: {"jsonrpc":"2.0","method":"event","params":{"type":"tool_call_end","data":{"toolCallId":"t9","toolName":"run","status":"completed","transitions":${JSON.stringify(transitions)}}}}\n\n`,
        'data: {"jsonrpc":"2.0","method":"event","params":{"type":"done","data":{"stopReason":"end_turn"}}}\n\n',
      ]);

      const call = (
        events[0] as unknown as {
          type: 'tool_call';
          call: Record<string, unknown>;
        }
      ).call;
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

      const call = (
        events[0] as unknown as {
          type: 'tool_call';
          call: Record<string, unknown>;
        }
      ).call;
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

      const call = (
        events[0] as unknown as {
          type: 'tool_call';
          call: Record<string, unknown>;
        }
      ).call;
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

      const call = (
        events[0] as unknown as {
          type: 'tool_call';
          call: Record<string, unknown>;
        }
      ).call;
      const perm = call.permissionRequest as Record<string, unknown>;
      expect(perm.description).toContain('myTool');
      expect(perm.resourcePaths).toEqual(['/a']);
    });

    it('buildToolCallEvent falls back to data.tool when toolName missing', async () => {
      const events = await createSessionAndPromptSse([
        'data: {"jsonrpc":"2.0","method":"event","params":{"type":"tool_call_start","data":{"toolCallId":"t13","tool":"alt_tool"}}}\n\n',
        'data: {"jsonrpc":"2.0","method":"event","params":{"type":"done","data":{"stopReason":"end_turn"}}}\n\n',
      ]);

      expect(
        (events[0] as unknown as { type: 'tool_call'; call: { tool: string } })
          .call.tool,
      ).toBe('alt_tool');
    });

    it('buildToolCallEvent falls back to data.id when toolCallId missing', async () => {
      const events = await createSessionAndPromptSse([
        'data: {"jsonrpc":"2.0","method":"event","params":{"type":"tool_call_start","data":{"id":"alt-id","toolName":"run"}}}\n\n',
        'data: {"jsonrpc":"2.0","method":"event","params":{"type":"done","data":{"stopReason":"end_turn"}}}\n\n',
      ]);

      expect(
        (events[0] as unknown as { type: 'tool_call'; call: { id: string } })
          .call.id,
      ).toBe('alt-id');
    });

    it('readToolCallStatus infers awaiting_permission when permissionRequest present', async () => {
      const events = await createSessionAndPromptSse([
        'data: {"jsonrpc":"2.0","method":"event","params":{"type":"tool_call_start","data":{"toolCallId":"t14","toolName":"fs/write","permissionRequest":{"description":"允许"}}}}\n\n',
        'data: {"jsonrpc":"2.0","method":"event","params":{"type":"done","data":{"stopReason":"end_turn"}}}\n\n',
      ]);

      expect(
        (
          events[0] as unknown as {
            type: 'tool_call';
            call: { status: string };
          }
        ).call.status,
      ).toBe('awaiting_permission');
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
        runtimeHandle: 'abc123def456',
      });
      mockRuntimeDriver.healthCheck.mockResolvedValue(true);
      mockRuntimeDriver.getPromptUrl.mockResolvedValue(
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
        undefined,
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
        undefined,
      );
    });
  });

  describe('prompt response edge cases', () => {
    it('prompt with response.ok=false throws error', async () => {
      const session = await adapter.createSession(defaultParams);
      mockSandboxService.getSandboxSession.mockResolvedValue({
        id: 'sandbox-001',
        status: 'ready',
        runtimeHandle: 'abc123def456',
      });
      mockRuntimeDriver.healthCheck.mockResolvedValue(true);
      mockRuntimeDriver.getPromptUrl.mockResolvedValue(
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
        runtimeHandle: 'abc123def456',
      });
      mockRuntimeDriver.healthCheck.mockResolvedValue(true);
      mockRuntimeDriver.getPromptUrl.mockResolvedValue(
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
        runtimeHandle: 'abc123def456',
      });
      mockRuntimeDriver.healthCheck.mockResolvedValue(true);
      mockRuntimeDriver.getPromptUrl.mockResolvedValue(
        'http://127.0.0.1:49123/v1/prompt',
      );

      globalThis.fetch = vi
        .fn()
        .mockRejectedValue(new Error('abort network failed'));

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
      await adapter.resolveConversationToolPermission(
        'conv-scan',
        'tool-scan',
        'approve',
      );

      await expect(pending).resolves.toEqual({ allowed: true });
    });
  });
  describe('补充 lifecycle 与 runtime 边界契约', () => {
    it('显式 sessionId 与可选会话字段应原样保留，且无 tenant 时不初始化容器', async () => {
      const session = await adapter.createSession({
        ...defaultParams,
        sessionId: 'session-explicit',
        tenantId: undefined,
        autonomyMode: 'full',
        systemPrompt: undefined,
      });

      expect(session).toMatchObject({
        id: 'session-explicit',
        autonomyMode: 'full',
        tenantId: undefined,
        systemPrompt: undefined,
        status: 'active',
      });
      expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    it.each(['failed', 'stopped'] as const)(
      'sandbox 已处于 %s 时 createSession 应失败并留下 error 状态',
      async (status) => {
        mockSandboxService.getSandboxSession.mockResolvedValueOnce({
          id: `sandbox-${status}`,
          status,
          runtimeHandle: null,
        });

        await expect(
          adapter.createSession({
            ...defaultParams,
            sessionId: `session-${status}`,
          }),
        ).rejects.toThrow(`is ${status}`);

        await expect(adapter.loadSession(`session-${status}`)).resolves.toEqual(
          expect.objectContaining({ status: 'error' }),
        );
      },
    );

    it('最近 sandbox 为 stopped 时应暴露带 binding 的不可用错误', async () => {
      mockSandboxService.getSandboxSession.mockResolvedValueOnce(null);
      mockSandboxService.findLatestByExecutionId.mockResolvedValueOnce({
        id: 'sandbox-stopped-latest',
        status: 'stopped',
      });

      await expect(
        adapter.createSession({
          ...defaultParams,
          context: {
            executionId: 'exec-both',
            agentConversationId: 'conv-both',
            sandboxNodeId: 'node-a',
          },
        }),
      ).rejects.toThrow(
        'Sandbox session sandbox-stopped-latest is stopped for execution exec-both / sandbox node-a / conversation conv-both',
      );
    });

    it('读取失败日志本身失败时应回退为结构化 sandbox 状态错误', async () => {
      mockSandboxService.findByConversationId.mockResolvedValueOnce(null);
      mockSandboxService.findLatestByConversationId.mockResolvedValueOnce({
        id: 'sandbox-failed-no-logs',
        status: 'failed',
      });
      mockSandboxService.getSandboxLogs.mockRejectedValueOnce(
        'log backend down',
      );

      await expect(
        adapter.createSession({
          ...defaultParams,
          context: { agentConversationId: 'conv-no-logs' },
        }),
      ).rejects.toThrow(
        'Sandbox session sandbox-failed-no-logs is failed for conversation conv-no-logs',
      );
    });

    it('prompt 应把图片、音频与资源附件原样传给容器并写入 history', async () => {
      const session = await adapter.createSession(defaultParams);
      const content = [
        { type: 'image', data: 'base64-image', mimeType: 'image/png' },
        { type: 'audio', data: 'base64-audio', mimeType: 'audio/wav' },
        {
          type: 'resource',
          uri: 'file:///workspace/report.txt',
          text: 'report',
          mimeType: 'text/plain',
        },
        {
          type: 'resource_link',
          uri: 'https://example.test/source',
          title: 'source',
        },
      ] as const;
      globalThis.fetch = vi
        .fn()
        .mockResolvedValue(
          createSseResponse([
            'data: {"type":"done","stopReason":"end_turn"}\n\n',
          ]),
        );

      await collectEvents(adapter.prompt(session.id, [...content]));

      const promptCall = vi.mocked(globalThis.fetch).mock.calls[0];
      expect(JSON.parse(String(promptCall?.[1]?.body))).toEqual({
        sessionId: session.id,
        content,
        cwd: '/workspace/',
      });
      expect(session.context.history).toEqual(content);
    });

    it('workflowState tenantId 应优先于 session tenantId 请求 sandbox', async () => {
      const session = await adapter.createSession({
        ...defaultParams,
        tenantId: undefined,
        context: { executionId: 'exec-runtime', tenantId: 'tenant-runtime' },
      });
      globalThis.fetch = vi
        .fn()
        .mockResolvedValue(
          createSseResponse([
            'data: {"type":"done","stopReason":"end_turn"}\n\n',
          ]),
        );

      await collectEvents(
        adapter.prompt(session.id, [{ type: 'text', text: 'run' }]),
      );

      expect(mockSandboxService.getSandboxSession).toHaveBeenLastCalledWith(
        'exec-runtime',
        'tenant-runtime',
        undefined,
      );
    });

    it('done 位于无分隔符的最终 buffer 时仍应产出 terminal event', async () => {
      const session = await adapter.createSession(defaultParams);
      globalThis.fetch = vi
        .fn()
        .mockResolvedValue(
          createSseResponse([
            'data: {"jsonrpc":"2.0","method":"event","params":{"type":"text_delta","data":{"delta":"tail"}}}\n\n',
            'data: {"type":"done","stopReason":"max_tokens"}',
          ]),
        );

      await expect(
        collectEvents(
          adapter.prompt(session.id, [{ type: 'text', text: 'final buffer' }]),
        ),
      ).resolves.toEqual([
        { type: 'message_chunk', content: 'tail' },
        { type: 'done', stopReason: 'max_tokens' },
      ]);
    });

    it('terminal event 后 reader.cancel 失败不应覆盖已完成结果', async () => {
      const encoder = new TextEncoder();
      const cancel = vi.fn().mockRejectedValue(new Error('transport closed'));
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        body: {
          getReader: () => ({
            read: vi.fn().mockResolvedValueOnce({
              done: false,
              value: encoder.encode(
                'data: {"type":"done","stopReason":"end_turn"}\n\n',
              ),
            }),
            cancel,
          }),
        },
      } as unknown as Response);
      const session = await adapter.createSession(defaultParams);

      await expect(
        collectEvents(
          adapter.prompt(session.id, [{ type: 'text', text: 'finish' }]),
        ),
      ).resolves.toEqual([{ type: 'done', stopReason: 'end_turn' }]);
      expect(cancel).toHaveBeenCalledOnce();
    });
  });

  describe('补充 permission 与 callback 错误契约', () => {
    it('callback 显式 sessionId 应允许无 conversation 映射的权限流程', async () => {
      const session = await adapter.createSession(defaultParams);
      const pending = adapter.awaitToolPermission('unknown-conversation', {
        sessionId: session.id,
        toolCallId: 'tool-explicit-session',
        toolName: 'write',
      });
      await Promise.resolve();

      await adapter.resolveToolPermission(
        session.id,
        'tool-explicit-session',
        'approve',
      );
      await expect(pending).resolves.toEqual({ allowed: true });
    });

    it('cancel 应中止并清理所有挂起权限', async () => {
      const session = await adapter.createSession({
        ...defaultParams,
        mode: 'conversation',
        context: { agentConversationId: 'conv-cancel-permission' },
      });
      const first = adapter.awaitToolPermission('conv-cancel-permission', {
        toolCallId: 'permission-a',
        toolName: 'write',
      });
      const second = adapter.awaitToolPermission('conv-cancel-permission', {
        toolCallId: 'permission-b',
        toolName: 'delete',
      });
      await Promise.resolve();

      await adapter.cancel(session.id);

      await expect(first).resolves.toEqual({ allowed: false });
      await expect(second).resolves.toEqual({ allowed: false });
      await expect(
        adapter.resolveConversationToolPermission(
          'conv-cancel-permission',
          'permission-a',
          'approve',
        ),
      ).rejects.toBeInstanceOf(ToolPermissionResolutionNotAllowedException);
    });

    it('已完成 session 上等待权限应立即拒绝', async () => {
      const session = await adapter.createSession(defaultParams);
      session.status = 'completed';

      await expect(
        adapter.awaitToolPermission('unused', {
          sessionId: session.id,
          toolCallId: 'after-complete',
          toolName: 'write',
        }),
      ).resolves.toEqual({ allowed: false });
    });

    it('remote callback 应拒绝 sessionId 不匹配、缺失 token 与错误 token', async () => {
      adapter.registerSessionToolProvider('session-secure', () => ({
        secure_tool: tool({
          inputSchema: jsonSchema({ type: 'object' }),
          execute: vi.fn(),
        }),
      }));
      await adapter.createSession({
        ...defaultParams,
        sessionId: 'session-secure',
      });

      await expect(
        adapter.executeSessionToolCallback('session-secure', {
          sessionId: 'another-session',
          toolCallId: 'call-mismatch',
          toolName: 'secure_tool',
          input: {},
        }),
      ).rejects.toThrow('sessionId mismatch');
      await expect(
        adapter.executeSessionToolCallback('session-secure', {
          sessionId: 'session-secure',
          toolCallId: 'call-missing-token',
          toolName: 'secure_tool',
          input: {},
        }),
      ).rejects.toThrow('callback token is required');
      await expect(
        adapter.executeSessionToolCallback(
          'session-secure',
          {
            sessionId: 'session-secure',
            toolCallId: 'call-invalid-token',
            toolName: 'secure_tool',
            input: {},
          },
          'invalid-token',
        ),
      ).rejects.toThrow('callback token is invalid');
    });

    it('合法 callback 应区分未知工具与不可执行工具', async () => {
      adapter.registerSessionToolProvider('session-nonexec', () => ({
        metadata_only: tool({
          description: '仅描述工具',
          inputSchema: jsonSchema({ type: 'object' }),
        }),
      }));
      mockSandboxService.getSandboxSession.mockResolvedValue({
        id: 'sandbox-session-nonexec',
        status: 'ready',
        runtimeHandle: 'runtime-session-nonexec',
      });
      mockRuntimeDriver.healthCheck.mockResolvedValue(true);
      await adapter.createSession({
        ...defaultParams,
        sessionId: 'session-nonexec',
      });
      const initPayload = JSON.parse(
        String(vi.mocked(globalThis.fetch).mock.calls[0]?.[1]?.body),
      ) as { remoteToolExecution: { callbackToken: string } };
      const callbackToken = initPayload.remoteToolExecution.callbackToken;

      await expect(
        adapter.executeSessionToolCallback(
          'session-nonexec',
          {
            sessionId: 'session-nonexec',
            toolCallId: 'call-unknown',
            toolName: 'unknown_tool',
            input: null,
          },
          callbackToken,
        ),
      ).rejects.toThrow('沙箱会话未找到');
      await expect(
        adapter.executeSessionToolCallback(
          'session-nonexec',
          {
            sessionId: 'session-nonexec',
            toolCallId: 'call-nonexec',
            toolName: 'metadata_only',
            input: null,
          },
          callbackToken,
        ),
      ).rejects.toThrow('is not executable');
    });

    it('缺少 tenantId 的 session tool callback 应在执行前拒绝', async () => {
      adapter.registerSessionToolProvider('session-no-tenant', () => ({
        local_tool: tool({
          inputSchema: jsonSchema({ type: 'object' }),
          execute: vi.fn(),
        }),
      }));
      const session = await adapter.createSession({
        ...defaultParams,
        sessionId: 'session-no-tenant',
      });
      const initPayload = JSON.parse(
        String(vi.mocked(globalThis.fetch).mock.calls.at(-1)?.[1]?.body),
      ) as { remoteToolExecution: { callbackToken: string } };
      Reflect.set(session, 'tenantId', undefined);

      await expect(
        adapter.executeSessionToolCallback(
          session.id,
          {
            sessionId: session.id,
            toolCallId: 'call-no-tenant',
            toolName: 'local_tool',
            input: 'not-an-object',
          },
          initPayload.remoteToolExecution.callbackToken,
        ),
      ).rejects.toThrow('is missing tenantId');
    });

    it('no_sandbox 应拒绝 stdio MCP，而 sandbox runtime 应允许并返回工具结果', async () => {
      const createMcpSession = async (
        sessionId: string,
        runtimeMode: 'no_sandbox' | 'sandbox',
      ) => {
        await adapter.createSession({
          ...defaultParams,
          sessionId,
          runtimeConfig: {
            runtimeMode,
            tools: [
              {
                toolId: 'mcp-search',
                toolType: 'mcp',
                name: 'search_docs',
                description: '搜索文档',
                enabled: true,
                mcpServerConfigId: 'mcp-config-1',
                toolName: 'search',
                inputSchema: {
                  type: 'object',
                  properties: { query: { type: 'string' } },
                },
              },
            ],
          },
        });
        const initCall = vi.mocked(globalThis.fetch).mock.calls.at(-1);
        const initPayload = JSON.parse(String(initCall?.[1]?.body)) as {
          remoteToolExecution: { callbackToken: string };
        };
        return initPayload.remoteToolExecution.callbackToken;
      };
      mockMcpService.resolveRuntimeConnection.mockResolvedValue({
        transportType: 'stdio',
      });
      mockMcpService.callRuntimeTool.mockResolvedValue({
        content: [{ type: 'text', text: 'found' }],
      });

      const noSandboxToken = await createMcpSession(
        'session-no-sandbox-mcp',
        'no_sandbox',
      );
      await expect(
        adapter.executeSessionToolCallback(
          'session-no-sandbox-mcp',
          {
            sessionId: 'session-no-sandbox-mcp',
            toolCallId: 'call-no-sandbox',
            toolName: 'search_docs',
            input: { query: 'policy' },
          },
          noSandboxToken,
        ),
      ).rejects.toThrow('无 sandbox Agent 只能使用 HTTP MCP');
      expect(mockMcpService.callRuntimeTool).not.toHaveBeenCalled();

      const sandboxToken = await createMcpSession(
        'session-sandbox-mcp',
        'sandbox',
      );
      await expect(
        adapter.executeSessionToolCallback(
          'session-sandbox-mcp',
          {
            sessionId: 'session-sandbox-mcp',
            toolCallId: 'call-sandbox',
            toolName: 'search_docs',
            input: { query: 'policy' },
          },
          sandboxToken,
        ),
      ).resolves.toEqual({
        result: { content: [{ type: 'text', text: 'found' }] },
      });
      expect(mockMcpService.callRuntimeTool).toHaveBeenCalledWith(
        expect.objectContaining({ transportType: 'stdio' }),
        'search',
        { query: 'policy' },
      );
    });

    it('code remote tool 应合并参数覆盖并转发 timeout，缺少执行服务时返回可观察失败', async () => {
      mockCodeExecutionService.execute.mockResolvedValue({
        success: true,
        output: 'ok',
      });
      await adapter.createSession({
        ...defaultParams,
        sessionId: 'session-code-tool',
        runtimeConfig: {
          tools: [
            {
              toolId: 'code-1',
              toolType: 'code',
              name: '1 invalid code name',
              description: '执行脚本',
              enabled: true,
              language: 'python',
              code: 'print(input)',
              timeout: 12,
              parameterOverrides: { fixed: true },
            },
          ],
        },
      });
      const initPayload = JSON.parse(
        String(vi.mocked(globalThis.fetch).mock.calls.at(-1)?.[1]?.body),
      ) as {
        remoteToolExecution: {
          callbackToken: string;
          tools: Array<{ name: string }>;
        };
      };
      expect(initPayload.remoteToolExecution.tools[0]?.name).toBe(
        'tool_1_invalid_code_name',
      );

      await expect(
        adapter.executeSessionToolCallback(
          'session-code-tool',
          {
            sessionId: 'session-code-tool',
            toolCallId: 'call-code',
            toolName: 'tool_1_invalid_code_name',
            input: { supplied: 'value', fixed: false },
          },
          initPayload.remoteToolExecution.callbackToken,
        ),
      ).resolves.toEqual({ result: { success: true, output: 'ok' } });
      expect(mockCodeExecutionService.execute).toHaveBeenCalledWith({
        language: 'python',
        code: 'print(input)',
        input: { supplied: 'value', fixed: true },
        timeout: 12,
      });

      const adapterWithoutCode = new SandboxAgentAdapter(
        mockDb as never,
        mockSandboxService as never,
        mockRuntimeDriver as never,
        mockMcpService as never,
        mockRagService as never,
        undefined,
        mockDecryptionBoundaryService as never,
        piConfigGenerator,
        mockSelfEvolutionService as never,
      );
      await adapterWithoutCode.createSession({
        ...defaultParams,
        sessionId: 'session-code-missing-service',
        runtimeConfig: {
          tools: [
            {
              toolId: 'code-2',
              toolType: 'code',
              name: '',
              enabled: true,
              language: 'bash',
            },
          ],
        },
      });
      const missingServicePayload = JSON.parse(
        String(vi.mocked(globalThis.fetch).mock.calls.at(-1)?.[1]?.body),
      ) as {
        remoteToolExecution: {
          callbackToken: string;
          tools: Array<{ name: string }>;
        };
      };
      const fallbackName =
        missingServicePayload.remoteToolExecution.tools[0]?.name ?? '';
      await expect(
        adapterWithoutCode.executeSessionToolCallback(
          'session-code-missing-service',
          {
            sessionId: 'session-code-missing-service',
            toolCallId: 'call-code-missing',
            toolName: fallbackName,
            input: null,
          },
          missingServicePayload.remoteToolExecution.callbackToken,
        ),
      ).resolves.toEqual({
        result: expect.objectContaining({
          success: false,
          toolId: 'code-2',
          language: 'bash',
          code: '',
          input: {},
        }),
      });
    });
  });

  describe('补充 stream 可选字段映射', () => {
    async function promptEvents(frames: string[]): Promise<AgentEvent[]> {
      const session = await adapter.createSession(defaultParams);
      globalThis.fetch = vi.fn().mockResolvedValue(createSseResponse(frames));
      return collectEvents(
        adapter.prompt(session.id, [{ type: 'text', text: 'map events' }]),
      );
    }

    it('permissionRequest 应保留全部受支持元数据并过滤无效资源路径', async () => {
      const events = await promptEvents([
        `data: ${JSON.stringify({
          jsonrpc: '2.0',
          method: 'event',
          params: {
            type: 'tool_call_update',
            data: {
              toolCallId: 'call-permission-full',
              toolName: 'fs/write',
              permissionRequest: {
                description: '覆盖配置文件',
                resourcePaths: ['/workspace/a.json', '', 42],
                domain: 'filesystem',
                category: 'write',
                riskLevel: 'high',
                sourceLabel: '配置生成器',
                targetType: 'file',
                targetLabel: 'a.json',
                approveEffect: '写入文件',
                denyEffect: '保持原文件',
                diffPreview: { before: '{}', after: '{"ok":true}' },
                rememberable: false,
              },
            },
          },
        })}\n\n`,
        'data: {"type":"done","stopReason":"end_turn"}\n\n',
      ]);

      expect(events[0]).toEqual({
        type: 'tool_call',
        call: expect.objectContaining({
          status: 'awaiting_permission',
          permissionRequest: {
            description: '覆盖配置文件',
            resourcePaths: ['/workspace/a.json'],
            domain: 'filesystem',
            category: 'write',
            riskLevel: 'high',
            sourceLabel: '配置生成器',
            targetType: 'file',
            targetLabel: 'a.json',
            approveEffect: '写入文件',
            denyEffect: '保持原文件',
            diffPreview: { before: '{}', after: '{"ok":true}' },
            rememberable: false,
          },
        }),
      });
    });

    it('data 顶层权限元数据应映射，非法 riskLevel 与 diffPreview 应省略', async () => {
      const events = await promptEvents([
        `data: ${JSON.stringify({
          type: 'tool_call_update',
          toolCallId: 'call-permission-flat',
          toolName: 'net/fetch',
          resourcePaths: ['/api'],
          domain: 'network',
          category: 'read',
          riskLevel: 'critical',
          sourceLabel: 'HTTP tool',
          targetType: 'endpoint',
          targetLabel: '/api',
          approveEffect: '发起请求',
          denyEffect: '取消请求',
          diffPreview: 'not-a-record',
          rememberable: true,
        })}\n\n`,
        'data: {"type":"done","stopReason":"end_turn"}\n\n',
      ]);
      const permissionRequest = (
        events[0] as Extract<AgentEvent, { type: 'tool_call' }>
      ).call.permissionRequest;

      expect(permissionRequest).toEqual({
        description: '允许工具 net/fetch 执行',
        resourcePaths: ['/api'],
        domain: 'network',
        category: 'read',
        sourceLabel: 'HTTP tool',
        targetType: 'endpoint',
        targetLabel: '/api',
        approveEffect: '发起请求',
        denyEffect: '取消请求',
        rememberable: true,
      });
    });

    it('tool result 的 falsy 值、未知 tool/id fallback 与空 transitions 应保持契约', async () => {
      const events = await promptEvents([
        'data: {"type":"tool_call_end","data":{"result":false,"transitions":[]}}\n\n',
        'data: {"type":"done","stopReason":"end_turn"}\n\n',
      ]);
      const call = (events[0] as Extract<AgentEvent, { type: 'tool_call' }>)
        .call;

      expect(call.tool).toBe('unknown_tool');
      expect(call.id).toEqual(expect.any(String));
      expect(call.result).toBe(false);
      expect(call.status).toBe('completed');
      expect(call).not.toHaveProperty('transitions');
      expect(call).not.toHaveProperty('error');
      expect(call).not.toHaveProperty('permissionRequest');
    });

    it('直接 AgentEvent 的 message、tool 与 PTY 变体应原样透传', async () => {
      const directEvents = [
        { type: 'message_chunk', content: 'direct' },
        {
          type: 'tool_call',
          call: {
            id: 'direct-tool',
            tool: 'read',
            args: {},
            status: 'completed',
          },
        },
        { type: 'pty.spawned', sessionId: 'pty-direct', info: {} },
        { type: 'pty.output', sessionId: 'pty-direct', data: '' },
        { type: 'pty.exit', sessionId: 'pty-direct' },
        { type: 'pty.killed', sessionId: 'pty-direct' },
      ];
      const events = await promptEvents([
        ...directEvents.map((event) => `data: ${JSON.stringify(event)}\n\n`),
        'data: {"type":"done","stopReason":"end_turn"}\n\n',
      ]);

      expect(events).toEqual([
        ...directEvents,
        { type: 'done', stopReason: 'end_turn' },
      ]);
    });
  });
});
