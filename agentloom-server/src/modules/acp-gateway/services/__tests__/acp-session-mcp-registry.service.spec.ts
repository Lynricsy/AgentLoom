import { Test, TestingModule } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const aiMocks = vi.hoisted(() => ({
  jsonSchema: vi.fn().mockImplementation((schema) => schema),
  tool: vi.fn().mockImplementation((definition) => definition),
}));

vi.mock('ai', () => ({
  jsonSchema: aiMocks.jsonSchema,
  tool: aiMocks.tool,
}));

import { ModuleRef } from '@nestjs/core';
import {
  AGENT_RUNTIME,
  type IAgentRuntime,
  type SessionToolProvider,
} from '../../../agent/ports/agent-runtime.port';
import type { ContentBlock } from '../../../agent/types/content-block.types';
import { McpService } from '../../../mcp/mcp.service';
import type { AcpTrackedSession } from '../../acp-types';
import { AcpSessionMcpRegistryService } from '../acp-session-mcp-registry.service';

function createTrackedSession(
  overrides: Partial<AcpTrackedSession> = {},
): AcpTrackedSession {
  return {
    sessionId: 'session-001',
    runtimeSessionId: 'runtime-session-001',
    agentId: 'agent-001',
    tenantId: 'tenant-001',
    ...overrides,
  };
}

function createAsyncEventStream(): AsyncIterable<never> {
  return {
    async *[Symbol.asyncIterator]() {
      yield* [];
    },
  };
}

function getToolDescription(toolDefinition: unknown): string | undefined {
  const description = Reflect.get(toolDefinition as object, 'description');
  return typeof description === 'string' ? description : undefined;
}

function getToolExecute(
  toolDefinition: unknown,
): (input: unknown) => Promise<unknown> {
  const execute = Reflect.get(toolDefinition as object, 'execute');
  expect(typeof execute).toBe('function');

  if (typeof execute !== 'function') {
    expect.unreachable('预期工具定义包含 execute 函数');
  }

  return execute as (input: unknown) => Promise<unknown>;
}

describe('AcpSessionMcpRegistryService', () => {
  let service: AcpSessionMcpRegistryService;
  let moduleRef: { get: ReturnType<typeof vi.fn> };
  let mcpService: {
    discoverRuntimeTools: ReturnType<typeof vi.fn>;
    callRuntimeTool: ReturnType<typeof vi.fn>;
  };
  let sessionProviders: Map<string, SessionToolProvider>;
  let runtime: IAgentRuntime & {
    registerSessionToolProvider: ReturnType<typeof vi.fn>;
    unregisterSessionToolProvider: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    sessionProviders = new Map<string, SessionToolProvider>();

    runtime = {
      createSession: vi.fn(),
      loadSession: vi.fn(),
      prompt: vi
        .fn<
          (sessionId: string, content: ContentBlock[]) => AsyncIterable<never>
        >()
        .mockImplementation(() => createAsyncEventStream()),
      cancel: vi.fn().mockResolvedValue(undefined),
      registerSessionToolProvider: vi
        .fn<(sessionId: string, provider: SessionToolProvider) => void>()
        .mockImplementation((sessionId, provider) => {
          sessionProviders.set(sessionId, provider);
        }),
      unregisterSessionToolProvider: vi
        .fn<(sessionId: string) => void>()
        .mockImplementation((sessionId) => {
          sessionProviders.delete(sessionId);
        }),
    };

    moduleRef = {
      get: vi.fn().mockImplementation((token: unknown) => {
        if (token === AGENT_RUNTIME) {
          return runtime;
        }

        return undefined;
      }),
    };

    mcpService = {
      discoverRuntimeTools: vi.fn(),
      callRuntimeTool: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AcpSessionMcpRegistryService,
        { provide: ModuleRef, useValue: moduleRef },
        { provide: McpService, useValue: mcpService },
      ],
    }).compile();

    service = module.get(AcpSessionMcpRegistryService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('应为 session 注册 namespaced MCP tools 并保持 source mapping', async () => {
    const trackedSession = createTrackedSession();

    mcpService.discoverRuntimeTools.mockResolvedValue([
      {
        name: 'search',
        title: '搜索文档',
        description: '搜索 MCP 文档',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
            },
          },
        },
      },
    ]);
    mcpService.callRuntimeTool.mockResolvedValue({ hits: [] });

    await service.bootstrapSessionTools(trackedSession, {
      docs: {
        transportType: 'stdio',
        command: 'node',
        args: ['docs-mcp.js'],
      },
    });

    expect(mcpService.discoverRuntimeTools).toHaveBeenCalledWith({
      transportType: 'stdio',
      command: 'node',
      args: ['docs-mcp.js'],
    });
    expect(runtime.registerSessionToolProvider).toHaveBeenCalledWith(
      'runtime-session-001',
      expect.any(Function),
    );

    const provider = sessionProviders.get('runtime-session-001');
    expect(provider).toBeDefined();

    const tools = await provider!();
    expect(Object.keys(tools)).toEqual(['docs/search']);

    expect(getToolDescription(tools['docs/search'])).toBe('搜索 MCP 文档');
    await expect(
      getToolExecute(tools['docs/search'])({ query: 'AgentLoom' }),
    ).resolves.toEqual({ hits: [] });
    expect(mcpService.callRuntimeTool).toHaveBeenCalledWith(
      {
        transportType: 'stdio',
        command: 'node',
        args: ['docs-mcp.js'],
      },
      'search',
      {
        query: 'AgentLoom',
      },
    );
  });

  it('应在单次工具调用内最多重试 3 次', async () => {
    const trackedSession = createTrackedSession();

    mcpService.discoverRuntimeTools.mockResolvedValue([
      {
        name: 'search',
        description: '搜索 MCP 文档',
      },
    ]);
    mcpService.callRuntimeTool.mockRejectedValue(
      new Error('connection dropped'),
    );

    await service.bootstrapSessionTools(trackedSession, {
      docs: {
        transportType: 'stdio',
        command: 'node',
      },
    });

    const provider = sessionProviders.get('runtime-session-001');
    const tools = await provider!();

    await expect(
      getToolExecute(tools['docs/search'])({ query: 'AgentLoom' }),
    ).rejects.toThrow('MCP tool docs/search unavailable: connection dropped');
    expect(mcpService.callRuntimeTool).toHaveBeenCalledTimes(3);
  });

  it('cleanupSessionTools 只应清理目标 session 的 provider', async () => {
    mcpService.discoverRuntimeTools.mockResolvedValue([
      {
        name: 'search',
        description: '搜索 MCP 文档',
      },
    ]);

    await service.bootstrapSessionTools(createTrackedSession(), {
      docs: {
        transportType: 'stdio',
        command: 'node',
      },
    });
    await service.bootstrapSessionTools(
      createTrackedSession({
        sessionId: 'session-002',
        runtimeSessionId: 'runtime-session-002',
      }),
      {
        docs: {
          transportType: 'stdio',
          command: 'node',
        },
      },
    );

    runtime.unregisterSessionToolProvider.mockClear();

    await service.cleanupSessionTools(createTrackedSession());

    expect(runtime.unregisterSessionToolProvider).toHaveBeenCalledTimes(1);
    expect(runtime.unregisterSessionToolProvider).toHaveBeenCalledWith(
      'runtime-session-001',
    );
    expect(sessionProviders.has('runtime-session-001')).toBe(false);
    expect(sessionProviders.has('runtime-session-002')).toBe(true);
  });
});
