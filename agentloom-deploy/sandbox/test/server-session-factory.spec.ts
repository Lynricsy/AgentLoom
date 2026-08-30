import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';

const mockPtyManager = { id: 'pty-manager' };
const mockPtyRegister = vi.fn();
const mockMcpRegister = vi.fn();

let sessionRoot: string;

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
    sessionRoot = mkdtempSync(join(tmpdir(), 'agentloom-factory-test-'));
    process.env['SANDBOX_SESSION_ROOT'] = sessionRoot;
  });

  afterEach(() => {
    delete process.env['SANDBOX_SESSION_ROOT'];
    rmSync(sessionRoot, { recursive: true, force: true });
  });

  it('should wire session-scoped settings, models, and system prompt into createAgentSession', async () => {
    const session = {
      prompt: vi.fn(),
      abort: vi.fn(),
      subscribe: vi.fn(),
      dispose: vi.fn(),
    };
    const reload = vi.fn().mockResolvedValue(undefined);
    const settingsManager = { id: 'settings-manager' };
    const modelRuntime = {
      id: 'model-runtime',
      setRuntimeApiKey: vi.fn().mockResolvedValue(undefined),
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
      ModelRuntime: {
        create: vi.fn().mockResolvedValue(modelRuntime),
      },
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
      sessionId: 'session-123',
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
    expect(piAgent.ModelRuntime.create).toHaveBeenCalledWith({
      authPath: expect.stringMatching(/session-123\/auth\.json$/),
      modelsPath: expect.stringMatching(/session-123\/models\.json$/),
    });
    expect(piAgent.DefaultResourceLoader).toHaveBeenCalledWith(
      expect.objectContaining({
        cwd: '/workspace/project',
        agentDir: expect.stringMatching(/session-123$/),
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
        agentDir: expect.stringMatching(/session-123$/),
        sessionManager,
        settingsManager,
        modelRuntime,
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
    const createSessionOptions = piAgent.createAgentSession.mock.calls[0]?.[0];
    expect(createSessionOptions).not.toHaveProperty('model');
    // 0.84 移除了这三个入参；残留任何一个都说明装配没迁移干净。
    expect(createSessionOptions).not.toHaveProperty('authStorage');
    expect(createSessionOptions).not.toHaveProperty('modelRegistry');
    expect(createSessionOptions).not.toHaveProperty('tools');
    // 默认策略全启用 → 不下发拒绝清单，交回 pi 的内置默认工具集。
    expect(createSessionOptions).not.toHaveProperty('excludeTools');
  });

  it('nativeToolPolicy 关闭的内置工具应转成 excludeTools 拒绝清单', async () => {
    const session = {
      prompt: vi.fn(),
      abort: vi.fn(),
      subscribe: vi.fn(),
      dispose: vi.fn(),
    };
    const piAgent = {
      createAgentSession: vi.fn().mockResolvedValue({ session }),
      DefaultResourceLoader: vi.fn().mockImplementation(() => ({
        reload: vi.fn().mockResolvedValue(undefined),
      })),
      SessionManager: { inMemory: vi.fn().mockReturnValue({}) },
      SettingsManager: { inMemory: vi.fn().mockReturnValue({}) },
      ModelRuntime: {
        create: vi.fn().mockResolvedValue({
          setRuntimeApiKey: vi.fn().mockResolvedValue(undefined),
          registerProvider: vi.fn(),
        }),
      },
    };

    const factory = createPiSessionFactory(piAgent);

    // 这是 workflow agent 与执行 worker 实际下发的只读策略。
    await factory(
      '/workspace/project',
      {},
      {
        sessionId: 'session-readonly',
        nativeToolPolicy: {
          readEnabled: true,
          writeEnabled: false,
          editEnabled: false,
          terminalEnabled: false,
        },
      },
    );

    const options = piAgent.createAgentSession.mock.calls[0]?.[0] as {
      excludeTools?: string[];
    };
    // 终端要连 powershell 一起禁，否则 Windows guest 上禁 bash 等于没禁。
    expect(options.excludeTools).toEqual([
      'bash',
      'powershell',
      'edit',
      'write',
    ]);
    // 允许清单会连 customTools/远程工具一起过滤，因此绝不能下发 tools。
    expect(options).not.toHaveProperty('tools');
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
    const modelRuntime = {
      id: 'model-runtime',
      setRuntimeApiKey: vi.fn().mockResolvedValue(undefined),
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
      ModelRuntime: {
        create: vi.fn().mockResolvedValue(modelRuntime),
      },
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
        sessionId: 'session-dynamic',
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
    expect(modelRuntime.setRuntimeApiKey).toHaveBeenCalledWith(
      'openai',
      'sk-openai-runtime',
    );
    expect(modelRuntime.registerProvider).toHaveBeenCalledWith(
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
    const modelRuntimes: Array<{
      id: string;
      setRuntimeApiKey: Mock;
      registerProvider: Mock;
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
      ModelRuntime: {
        create: vi.fn().mockImplementation(async () => {
          const modelRuntime = {
            id: `model-runtime-${modelRuntimes.length + 1}`,
            setRuntimeApiKey: vi.fn().mockResolvedValue(undefined),
            registerProvider: vi.fn(),
          };
          modelRuntimes.push(modelRuntime);
          return modelRuntime;
        }),
      },
    };

    const factory = createPiSessionFactory(piAgent);
    const staticConfig = {
      settings: {
        compaction: { enabled: true },
      },
      systemPrompt: '静态提示词',
    };

    await factory('/workspace/project', staticConfig, {
      sessionId: 'session-a',
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
      sessionId: 'session-b',
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

    // 每个会话必须拿到独立的 ModelRuntime，否则 runtime key 会跨会话泄漏。
    expect(modelRuntimes).toHaveLength(2);
    expect(modelRuntimes[0]?.setRuntimeApiKey).toHaveBeenCalledWith(
      'openai',
      'sk-openai-a',
    );
    expect(modelRuntimes[1]?.setRuntimeApiKey).toHaveBeenCalledWith(
      'anthropic',
      'ak-anthropic-b',
    );
    expect(modelRuntimes[0]?.setRuntimeApiKey).not.toHaveBeenCalledWith(
      'anthropic',
      'ak-anthropic-b',
    );

    expect(modelRuntimes[0]?.registerProvider).toHaveBeenCalledWith(
      'openai',
      expect.objectContaining({
        api: 'openai-completions',
      }),
    );
    expect(modelRuntimes[1]?.registerProvider).toHaveBeenCalledWith(
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
    expect(createSessionArgs[0]?.modelRuntime).toBe(modelRuntimes[0]);
    expect(createSessionArgs[1]?.modelRuntime).toBe(modelRuntimes[1]);
    expect(createSessionArgs[0]?.resourceLoader).not.toBe(
      createSessionArgs[1]?.resourceLoader,
    );
  });
});
