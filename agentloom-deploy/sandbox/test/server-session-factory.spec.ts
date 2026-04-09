import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockPtyManager = { id: 'pty-manager' };
const mockPtyRegister = vi.fn();
const mockMcpRegister = vi.fn();

vi.mock('../src/pty-extension.js', () => ({
  createPtyExtension: vi.fn(() => ({
    manager: mockPtyManager,
    register: mockPtyRegister,
  })),
}));

vi.mock('../src/mcp-extension.js', () => ({
  createMcpExtension: vi.fn(() => ({
    register: mockMcpRegister,
  })),
}));

import { createPiSessionFactory } from '../src/server.js';
import { createMcpExtension } from '../src/mcp-extension.js';
import { createPtyExtension } from '../src/pty-extension.js';

describe('createPiSessionFactory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should wire /config-backed settings, models, and system prompt into createAgentSession', async () => {
    const session = {
      prompt: vi.fn(),
      abort: vi.fn(),
      subscribe: vi.fn(),
      dispose: vi.fn(),
    };
    const reload = vi.fn().mockResolvedValue(undefined);
    const settingsManager = { id: 'settings-manager' };
    const authStorage = { id: 'auth-storage', setRuntimeApiKey: vi.fn() };
    const modelRegistry = { id: 'model-registry', registerProvider: vi.fn() };
    const sessionManager = { id: 'session-manager' };

    const piAgent = {
      createAgentSession: vi.fn().mockResolvedValue({ session }),
      DefaultResourceLoader: vi.fn().mockImplementation(() => ({ reload })),
      SessionManager: {
        inMemory: vi.fn().mockReturnValue(sessionManager),
      },
      SettingsManager: {
        inMemory: vi.fn().mockReturnValue(settingsManager),
      },
      AuthStorage: {
        inMemory: vi.fn().mockReturnValue(authStorage),
      },
      ModelRegistry: vi.fn().mockImplementation(() => modelRegistry),
    };

    const setPtyManager = vi.fn();
    const factory = createPiSessionFactory(piAgent, setPtyManager);

    const result = await factory('/workspace/project', {
      settings: {
        defaultProvider: 'anthropic',
        defaultModel: 'claude-opus-4-6',
      },
      systemPrompt: '你是测试沙箱里的 agent。',
      mcpServers: {
        github: {
          transportType: 'sse',
          url: 'https://example.com/sse',
        },
      },
    }, {
      remoteToolExecution: {
        sessionId: 'session-123',
        callbackUrl: 'http://worker-1:3000/api/v1/agent-runtime/sessions/session-123/tool-executions',
        callbackToken: 'token-123',
        tools: [
          {
            name: 'lookup_memory',
            label: 'lookup_memory',
            description: '检索记忆内容',
            promptSnippet: '检索记忆内容',
            parameters: {
              type: 'object',
              properties: {
                query: { type: 'string' },
              },
              required: ['query'],
              additionalProperties: false,
            },
          },
        ],
      },
    });

    expect(result).toBe(session);
    expect(createPtyExtension).toHaveBeenCalledWith({
      onPtyEvent: expect.any(Function),
      workdir: '/workspace/project',
    });
    expect(createMcpExtension).toHaveBeenCalledWith({
      mcpServers: {
        github: {
          transportType: 'sse',
          url: 'https://example.com/sse',
        },
      },
    });
    expect(setPtyManager).toHaveBeenCalledWith(mockPtyManager);
    expect(piAgent.SettingsManager.inMemory).toHaveBeenCalledWith({
      defaultProvider: 'anthropic',
      defaultModel: 'claude-opus-4-6',
    });
    expect(piAgent.AuthStorage.inMemory).toHaveBeenCalledWith();
    expect(piAgent.ModelRegistry).toHaveBeenCalledWith(authStorage, '/config/models.json');
    expect(piAgent.DefaultResourceLoader).toHaveBeenCalledWith(
      expect.objectContaining({
        cwd: '/workspace/project',
        agentDir: '/config',
        settingsManager,
        systemPrompt: '你是测试沙箱里的 agent。',
        extensionFactories: [mockMcpRegister, mockPtyRegister],
      }),
    );
    expect(reload).toHaveBeenCalledOnce();
    expect(piAgent.SessionManager.inMemory).toHaveBeenCalledWith('/workspace/project');
    expect(piAgent.createAgentSession).toHaveBeenCalledWith(
      expect.objectContaining({
        cwd: '/workspace/project',
        agentDir: '/config',
        sessionManager,
        settingsManager,
        authStorage,
        modelRegistry,
        resourceLoader: expect.any(Object),
        customTools: [
          expect.objectContaining({
            name: 'lookup_memory',
            description: '检索记忆内容',
            promptSnippet: '检索记忆内容',
          }),
        ],
      }),
    );
    expect(piAgent.createAgentSession.mock.calls[0]?.[0]).not.toHaveProperty('model');
  });

  it('should apply session-level settings, models, prompt, MCP servers, and runtime API keys', async () => {
    const session = {
      prompt: vi.fn(),
      abort: vi.fn(),
      subscribe: vi.fn(),
      dispose: vi.fn(),
    };
    const reload = vi.fn().mockResolvedValue(undefined);
    const settingsManager = { id: 'settings-manager' };
    const authStorage = {
      id: 'auth-storage',
      setRuntimeApiKey: vi.fn(),
    };
    const modelRegistry = {
      id: 'model-registry',
      registerProvider: vi.fn(),
    };
    const sessionManager = { id: 'session-manager' };

    const piAgent = {
      createAgentSession: vi.fn().mockResolvedValue({ session }),
      DefaultResourceLoader: vi.fn().mockImplementation(() => ({ reload })),
      SessionManager: {
        inMemory: vi.fn().mockReturnValue(sessionManager),
      },
      SettingsManager: {
        inMemory: vi.fn().mockReturnValue(settingsManager),
      },
      AuthStorage: {
        inMemory: vi.fn().mockReturnValue(authStorage),
      },
      ModelRegistry: vi.fn().mockImplementation(() => modelRegistry),
    };

    const factory = createPiSessionFactory(piAgent);

    await factory(
      '/workspace/project',
      {
        settings: {
          compaction: { enabled: true },
          retry: { enabled: true, maxRetries: 3 },
          defaultProvider: 'anthropic',
        },
        systemPrompt: '静态提示词',
        mcpServers: {
          staticServer: {
            transportType: 'sse',
            url: 'https://static.example.com/sse',
          },
        },
      },
      {
        settings: {
          defaultProvider: 'openai',
          defaultModel: 'gpt-4.1',
        },
        systemPrompt: '动态提示词',
        mcpServers: {
          dynamicServer: {
            transportType: 'stdio',
            command: 'npx',
            args: ['-y', 'dynamic-mcp'],
          },
        },
        runtimeApiKeys: {
          openai: 'sk-openai-runtime',
        },
        models: {
          providers: {
            openai: {
              api: 'openai-completions',
              apiKey: 'OPENAI_API_KEY',
              baseUrl: 'https://api.openai.com/v1',
              compat: {
                supportsDeveloperRole: false,
              },
              models: [
                {
                  id: 'gpt-4.1',
                  name: 'GPT-4.1',
                },
              ],
            },
          },
        },
      },
    );

    expect(createMcpExtension).toHaveBeenCalledWith({
      mcpServers: {
        dynamicServer: {
          transportType: 'stdio',
          command: 'npx',
          args: ['-y', 'dynamic-mcp'],
        },
      },
    });
    expect(piAgent.SettingsManager.inMemory).toHaveBeenCalledWith({
      compaction: { enabled: true },
      retry: { enabled: true, maxRetries: 3 },
      defaultProvider: 'openai',
      defaultModel: 'gpt-4.1',
    });
    expect(authStorage.setRuntimeApiKey).toHaveBeenCalledWith(
      'openai',
      'sk-openai-runtime',
    );
    expect(modelRegistry.registerProvider).toHaveBeenCalledWith(
      'openai',
      expect.objectContaining({
        api: 'openai-completions',
        apiKey: 'OPENAI_API_KEY',
        baseUrl: 'https://api.openai.com/v1',
        models: [
          expect.objectContaining({
            id: 'gpt-4.1',
            name: 'GPT-4.1',
            reasoning: false,
            input: ['text'],
            cost: {
              input: 0,
              output: 0,
              cacheRead: 0,
              cacheWrite: 0,
            },
            contextWindow: 128000,
            maxTokens: 16384,
          }),
        ],
      }),
    );
    expect(piAgent.DefaultResourceLoader).toHaveBeenCalledWith(
      expect.objectContaining({
        systemPrompt: '动态提示词',
      }),
    );
  });

  it('同一工厂连续创建多个会话时应保持 session 级配置隔离', async () => {
    const createSessionArgs: Array<Record<string, unknown>> = [];
    const settingsManagers: Array<Record<string, unknown>> = [];
    const authStorages: Array<{
      id: string;
      setRuntimeApiKey: ReturnType<typeof vi.fn>;
    }> = [];
    const modelRegistries: Array<{
      id: string;
      registerProvider: ReturnType<typeof vi.fn>;
    }> = [];
    const resourceLoaders: Array<Record<string, unknown>> = [];

    const piAgent = {
      createAgentSession: vi.fn().mockImplementation(async (args) => {
        createSessionArgs.push(args as Record<string, unknown>);
        return {
          session: {
            prompt: vi.fn(),
            abort: vi.fn(),
            subscribe: vi.fn(),
            dispose: vi.fn(),
          },
        };
      }),
      DefaultResourceLoader: vi.fn().mockImplementation((args) => {
        const resourceLoader = {
          id: `resource-loader-${resourceLoaders.length + 1}`,
          reload: vi.fn().mockResolvedValue(undefined),
        };
        resourceLoaders.push({ ...resourceLoader, args });
        return resourceLoader;
      }),
      SessionManager: {
        inMemory: vi.fn().mockImplementation(() => ({
          id: `session-manager-${createSessionArgs.length + 1}`,
        })),
      },
      SettingsManager: {
        inMemory: vi.fn().mockImplementation((settings) => {
          const manager = {
            id: `settings-manager-${settingsManagers.length + 1}`,
            settings,
          };
          settingsManagers.push(manager);
          return manager;
        }),
      },
      AuthStorage: {
        inMemory: vi.fn().mockImplementation(() => {
          const authStorage = {
            id: `auth-storage-${authStorages.length + 1}`,
            setRuntimeApiKey: vi.fn(),
          };
          authStorages.push(authStorage);
          return authStorage;
        }),
      },
      ModelRegistry: vi.fn().mockImplementation(() => {
        const modelRegistry = {
          id: `model-registry-${modelRegistries.length + 1}`,
          registerProvider: vi.fn(),
        };
        modelRegistries.push(modelRegistry);
        return modelRegistry;
      }),
    };

    const factory = createPiSessionFactory(piAgent);
    const staticConfig = {
      settings: {
        compaction: { enabled: true },
      },
      systemPrompt: '静态提示词',
    };

    await factory('/workspace/project', staticConfig, {
      settings: {
        defaultProvider: 'openai',
        defaultModel: 'gpt-4.1',
      },
      systemPrompt: '会话 A 提示词',
      runtimeApiKeys: {
        openai: 'sk-openai-a',
      },
      models: {
        providers: {
          openai: {
            api: 'openai-completions',
            apiKey: 'OPENAI_API_KEY',
            models: [{ id: 'gpt-4.1', name: 'GPT-4.1' }],
          },
        },
      },
    });

    await factory('/workspace/project', staticConfig, {
      settings: {
        defaultProvider: 'anthropic',
        defaultModel: 'claude-sonnet-4-6',
      },
      systemPrompt: '会话 B 提示词',
      runtimeApiKeys: {
        anthropic: 'ak-anthropic-b',
      },
      models: {
        providers: {
          anthropic: {
            api: 'anthropic',
            apiKey: 'ANTHROPIC_API_KEY',
            models: [
              {
                id: 'claude-sonnet-4-6',
                name: 'Claude Sonnet 4.6',
              },
            ],
          },
        },
      },
    });

    expect(settingsManagers).toHaveLength(2);
    expect(settingsManagers[0]?.settings).toEqual({
      compaction: { enabled: true },
      defaultProvider: 'openai',
      defaultModel: 'gpt-4.1',
    });
    expect(settingsManagers[1]?.settings).toEqual({
      compaction: { enabled: true },
      defaultProvider: 'anthropic',
      defaultModel: 'claude-sonnet-4-6',
    });

    expect(authStorages).toHaveLength(2);
    expect(authStorages[0]?.setRuntimeApiKey).toHaveBeenCalledWith(
      'openai',
      'sk-openai-a',
    );
    expect(authStorages[1]?.setRuntimeApiKey).toHaveBeenCalledWith(
      'anthropic',
      'ak-anthropic-b',
    );

    expect(modelRegistries).toHaveLength(2);
    expect(modelRegistries[0]?.registerProvider).toHaveBeenCalledWith(
      'openai',
      expect.objectContaining({
        api: 'openai-completions',
      }),
    );
    expect(modelRegistries[1]?.registerProvider).toHaveBeenCalledWith(
      'anthropic',
      expect.objectContaining({
        api: 'anthropic',
      }),
    );

    expect(resourceLoaders).toHaveLength(2);
    expect(
      resourceLoaders[0]?.args as { systemPrompt?: string } | undefined,
    ).toMatchObject({
      systemPrompt: '会话 A 提示词',
    });
    expect(
      resourceLoaders[1]?.args as { systemPrompt?: string } | undefined,
    ).toMatchObject({
      systemPrompt: '会话 B 提示词',
    });

    expect(createSessionArgs).toHaveLength(2);
    expect(createSessionArgs[0]?.settingsManager).toBe(settingsManagers[0]);
    expect(createSessionArgs[1]?.settingsManager).toBe(settingsManagers[1]);
    expect(createSessionArgs[0]?.authStorage).toBe(authStorages[0]);
    expect(createSessionArgs[1]?.authStorage).toBe(authStorages[1]);
    expect(createSessionArgs[0]?.modelRegistry).toBe(modelRegistries[0]);
    expect(createSessionArgs[1]?.modelRegistry).toBe(modelRegistries[1]);
    expect(createSessionArgs[0]?.resourceLoader).not.toBe(
      createSessionArgs[1]?.resourceLoader,
    );
  });
});
