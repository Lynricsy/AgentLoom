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
    const authStorage = { id: 'auth-storage' };
    const modelRegistry = { id: 'model-registry' };
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
      }),
    );
    expect(piAgent.createAgentSession.mock.calls[0]?.[0]).not.toHaveProperty('model');
  });
});
