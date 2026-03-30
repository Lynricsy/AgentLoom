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
});
