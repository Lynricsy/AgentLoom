import { ModuleRef } from '@nestjs/core';
import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { SessionNewHandler } from '../handlers/session-new.handler';
import type { AcpConnectionState } from '../acp-types';

const AGENT_ID = '01a15400-65d7-7252-86ee-3b411e23ebc2';
const VERSION_ID = '01a15400-65d7-7252-86ee-3b411e23ebc3';
const EXECUTION_ID = '019391d4-e000-7000-0000-000000000005';
const CONVERSATION_ID = '019391d4-f000-7000-0000-000000000006';
const RUNTIME_CONFIG = {
  runtimeMode: 'no_sandbox',
  modelConfig: { modelId: 'model-config-1' },
};

type AgentRow = {
  status: 'draft' | 'published' | 'archived';
  runtimeMode: 'sandbox' | 'no_sandbox';
  publishedVersionId: string | null;
};

const PUBLISHED_AGENT: AgentRow = {
  status: 'published',
  runtimeMode: 'no_sandbox',
  publishedVersionId: VERSION_ID,
};

const PUBLISHED_VERSION = {
  snapshot: {
    nodes: [{ id: 'main' }],
    edges: [],
    systemPrompt: 'snapshot prompt',
  },
};

describe('SessionNewHandler', () => {
  /** 事务内依次返回 agent 行、已发布版本行，以及 serverSandbox 绑定校验各次查询的行 */
  function createMockDb(
    agentRows: AgentRow[] = [PUBLISHED_AGENT],
    versionRows: unknown[] = [PUBLISHED_VERSION],
    bindingRows: unknown[][] = [],
  ) {
    const queue = [agentRows, versionRows, ...bindingRows];
    const select = vi.fn(() => ({
      from: () => ({
        where: () => ({
          limit: vi.fn().mockResolvedValue(queue.shift() ?? []),
        }),
      }),
    }));
    return {
      select,
      transaction: vi.fn(async (callback: (tx: unknown) => unknown) =>
        callback({
          execute: vi.fn().mockResolvedValue(undefined),
          select,
        }),
      ),
    };
  }

  function createMcpSessionService() {
    return {
      bootstrapSessionTools: vi.fn().mockResolvedValue(undefined),
      cleanupSessionTools: vi.fn().mockResolvedValue(undefined),
    };
  }

  function createAgentDefinitionService() {
    return {
      buildRuntimeConfigFromNodes: vi.fn().mockReturnValue(RUNTIME_CONFIG),
      resolveSystemPromptFromNodes: vi.fn().mockReturnValue('canvas prompt'),
    };
  }

  function createState(): AcpConnectionState {
    return {
      initialized: true,
      authContext: {
        userId: 'user-1',
        email: 'user@example.com',
        tenantId: 'tenant-1',
        tenantRole: 'owner',
        orgId: 'org-1',
        authMethod: 'jwt',
      },
    };
  }

  function createAccessService() {
    return { assertPermission: vi.fn().mockResolvedValue(undefined) };
  }

  /** 依赖均以 `as never` 注入，测试只需提供要断言的 mock */
  function createHandler(options: {
    db?: unknown;
    runtime?: unknown;
    mcpSessionService?: unknown;
    agentDefinitionService?: unknown;
    accessService?: unknown;
  }) {
    return new SessionNewHandler(
      (options.db ?? createMockDb()) as never,
      { get: vi.fn().mockReturnValue(options.runtime) } as unknown as ModuleRef,
      (options.mcpSessionService ?? createMcpSessionService()) as never,
      (options.agentDefinitionService ??
        createAgentDefinitionService()) as never,
      (options.accessService ?? createAccessService()) as never,
    );
  }

  function createRuntime(sessionId: string = randomUUID()) {
    return {
      createSession: vi.fn().mockResolvedValue({
        id: sessionId,
        agentId: AGENT_ID,
      }),
      cancel: vi.fn().mockResolvedValue(undefined),
    };
  }

  it('应按已发布版本编译运行配置创建 conversation session 并写入连接级 registry', async () => {
    const runtime = createRuntime();
    const mcpSessionService = createMcpSessionService();
    const agentDefinitionService = createAgentDefinitionService();
    const accessService = createAccessService();
    const handler = createHandler({
      db: createMockDb(undefined, undefined, [[{ id: EXECUTION_ID }]]),
      runtime,
      mcpSessionService,
      agentDefinitionService,
      accessService,
    });
    const state = createState();

    const result = await handler.handle(
      {
        agentId: AGENT_ID,
        cwd: '/workspace/demo',
        serverSandbox: {
          executionId: '019391d4-e000-7000-0000-000000000005',
        },
        mcpServers: {
          docs: {
            command: 'node',
            args: ['mcp-server.js'],
          },
        },
      } as never,
      state,
    );

    expect(
      agentDefinitionService.buildRuntimeConfigFromNodes,
    ).toHaveBeenCalledWith(
      PUBLISHED_VERSION.snapshot.nodes,
      PUBLISHED_VERSION.snapshot.edges,
      AGENT_ID,
      'no_sandbox',
    );
    expect(runtime.createSession).toHaveBeenCalledWith({
      agentId: AGENT_ID,
      mode: 'conversation',
      tenantId: 'tenant-1',
      runtimeConfig: RUNTIME_CONFIG,
      llmModelConfigId: 'model-config-1',
      systemPrompt: 'canvas prompt',
      cwd: '/workspace/demo',
      mcpServers: {
        docs: {
          command: 'node',
          args: ['mcp-server.js'],
        },
      },
      serverSandbox: {
        executionId: '019391d4-e000-7000-0000-000000000005',
      },
    });
    expect(mcpSessionService.bootstrapSessionTools).toHaveBeenCalledWith(
      {
        sessionId: result.sessionId,
        runtimeSessionId: result.sessionId,
        agentId: AGENT_ID,
        tenantId: 'tenant-1',
        cwd: '/workspace/demo',
        serverSandbox: {
          executionId: '019391d4-e000-7000-0000-000000000005',
        },
      },
      {
        docs: {
          command: 'node',
          args: ['mcp-server.js'],
        },
      },
    );
    expect(state.sessions?.get(result.sessionId)).toEqual({
      sessionId: result.sessionId,
      runtimeSessionId: result.sessionId,
      agentId: AGENT_ID,
      tenantId: 'tenant-1',
      cwd: '/workspace/demo',
      serverSandbox: {
        executionId: '019391d4-e000-7000-0000-000000000005',
      },
    });
    // 绑定执行沙箱等同 HTTP 的执行控制
    expect(accessService.assertPermission).toHaveBeenCalledWith(
      state,
      'execution:control',
    );
  });

  it('画布未声明系统提示词时回退到快照 systemPrompt', async () => {
    const runtime = createRuntime('session-001');
    const agentDefinitionService = createAgentDefinitionService();
    agentDefinitionService.resolveSystemPromptFromNodes.mockReturnValue(
      undefined,
    );
    const mcpSessionService = createMcpSessionService();
    const handler = createHandler({
      runtime,
      mcpSessionService,
      agentDefinitionService,
    });

    await expect(
      handler.handle({ agentId: AGENT_ID } as never, createState()),
    ).resolves.toEqual({ sessionId: 'session-001' });

    expect(runtime.createSession).toHaveBeenCalledWith(
      expect.objectContaining({ systemPrompt: 'snapshot prompt' }),
    );
    expect(mcpSessionService.bootstrapSessionTools).not.toHaveBeenCalled();
  });

  it.each([
    ['非 UUID', 'not-a-uuid', [], 'agent-not-found'],
    ['不存在或属于其他租户', AGENT_ID, [], 'agent-not-found'],
    [
      '已归档',
      AGENT_ID,
      [{ ...PUBLISHED_AGENT, status: 'archived' }],
      'agent-archived',
    ],
    [
      '未发布',
      AGENT_ID,
      [{ ...PUBLISHED_AGENT, status: 'draft', publishedVersionId: null }],
      'agent-not-published',
    ],
  ] as const)(
    'Agent %s 时拒绝创建会话（D-019）',
    async (_label, agentId, agentRows, type) => {
      const runtime = createRuntime();
      const handler = createHandler({
        db: createMockDb([...agentRows]),
        runtime,
      });

      await expect(
        handler.handle({ agentId } as never, createState()),
      ).rejects.toMatchObject({
        type: `https://agentloom.dev/errors/${type}`,
      });
      expect(runtime.createSession).not.toHaveBeenCalled();
    },
  );

  it('sandbox 运行态的 Agent 不能经 ACP 进程内运行', async () => {
    const runtime = createRuntime();
    const handler = createHandler({
      db: createMockDb([{ ...PUBLISHED_AGENT, runtimeMode: 'sandbox' }]),
      runtime,
    });

    await expect(
      handler.handle({ agentId: AGENT_ID } as never, createState()),
    ).rejects.toMatchObject({
      code: -32602,
      data: { reason: 'Only no_sandbox agents can run over ACP' },
    });
    expect(runtime.createSession).not.toHaveBeenCalled();
  });

  it('应接受属于同一 Agent 的 agentConversationId 绑定', async () => {
    const runtime = createRuntime('session-conv');
    const accessService = createAccessService();
    const handler = createHandler({
      db: createMockDb(undefined, undefined, [[{ agentId: AGENT_ID }]]),
      runtime,
      accessService,
    });

    await expect(
      handler.handle(
        {
          agentId: AGENT_ID,
          serverSandbox: { agentConversationId: CONVERSATION_ID },
        } as never,
        createState(),
      ),
    ).resolves.toEqual({
      sessionId: 'session-conv',
    });

    expect(runtime.createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        serverSandbox: { agentConversationId: CONVERSATION_ID },
      }),
    );
    expect(accessService.assertPermission).not.toHaveBeenCalled();
  });

  it.each([
    [
      '对话属于另一个 Agent',
      { agentConversationId: CONVERSATION_ID },
      [[{ agentId: '01a15400-65d7-7252-86ee-3b411e23ffff' }]],
      'server_sandbox_binding_agent_mismatch',
    ],
    [
      '对话不存在（或属于其他租户，RLS 下同样查不到）',
      { agentConversationId: CONVERSATION_ID },
      [[]],
      'server_sandbox_binding_not_found',
    ],
    [
      '对话 id 不是 UUID',
      { agentConversationId: 'not-a-uuid' },
      [],
      'server_sandbox_binding_not_found',
    ],
    [
      '执行不存在',
      { executionId: EXECUTION_ID },
      [[]],
      'server_sandbox_binding_not_found',
    ],
  ])(
    'serverSandbox 绑定校验失败（%s）时返回 -32602 且不创建会话（D-199）',
    async (_label, serverSandbox, bindingRows, reason) => {
      const runtime = createRuntime();
      const handler = createHandler({
        db: createMockDb(undefined, undefined, bindingRows),
        runtime,
      });

      await expect(
        handler.handle(
          { agentId: AGENT_ID, serverSandbox } as never,
          createState(),
        ),
      ).rejects.toMatchObject({
        code: -32602,
        message: 'Invalid params',
        data: { reason },
      });
      expect(runtime.createSession).not.toHaveBeenCalled();
    },
  );

  it('ACP MCP bootstrap 失败时应回滚 runtime session 并且不注册连接级 session', async () => {
    const runtime = createRuntime('session-001');
    const mcpSessionService = {
      bootstrapSessionTools: vi
        .fn()
        .mockRejectedValue(new Error('bootstrap failed')),
      cleanupSessionTools: vi.fn().mockResolvedValue(undefined),
    };
    const handler = createHandler({ runtime, mcpSessionService });
    const state: AcpConnectionState = { ...createState(), sessions: new Map() };

    await expect(
      handler.handle(
        {
          agentId: AGENT_ID,
          mcpServers: {
            docs: {
              command: 'node',
              args: ['mcp-server.js'],
            },
          },
        } as never,
        state,
      ),
    ).rejects.toMatchObject({
      code: -32603,
      message: 'Failed to initialize ACP MCP forwarding',
      data: {
        sessionId: 'session-001',
        reason: 'bootstrap failed',
      },
    });
    expect(mcpSessionService.cleanupSessionTools).toHaveBeenCalledWith({
      sessionId: 'session-001',
      runtimeSessionId: 'session-001',
      agentId: AGENT_ID,
      tenantId: 'tenant-1',
    });
    expect(runtime.cancel).toHaveBeenCalledWith('session-001');
    expect(state.sessions?.size).toBe(0);
  });

  it('应拒绝同时缺少 executionId 与 agentConversationId 的 serverSandbox 绑定', async () => {
    const handler = createHandler({});

    await expect(
      handler.handle(
        {
          agentId: AGENT_ID,
          cwd: '/workspace/demo',
          serverSandbox: {},
        } as never,
        createState(),
      ),
    ).rejects.toMatchObject({
      code: -32602,
      message: 'Invalid params',
    });
  });

  it('应拒绝非绝对路径 cwd', async () => {
    const handler = createHandler({});

    await expect(
      handler.handle(
        {
          agentId: AGENT_ID,
          cwd: './relative',
        },
        createState(),
      ),
    ).rejects.toMatchObject({
      code: -32602,
      message: 'Invalid params',
    });
  });
});
