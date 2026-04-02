import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SelfEvolutionPermissionService } from './self-evolution-permission.service';

const {
  mockTenantDb,
  mockRedisCacheService,
  redisStore,
  selectResults,
  updateSetCalls,
  selectChain,
  updateChain,
} = vi.hoisted(() => {
  const selectResults: unknown[][] = [];
  const updateSetCalls: Array<Record<string, unknown>> = [];
  const redisStore = new Map<string, string>();

  const selectChain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockImplementation(async () => selectResults.shift() ?? []),
  };

  const updateChain = {
    set: vi.fn().mockImplementation((value: Record<string, unknown>) => {
      updateSetCalls.push(value);
      return updateChain;
    }),
    where: vi.fn().mockResolvedValue(undefined),
  };

  const mockTenantDb = {
    select: vi.fn().mockReturnValue(selectChain),
    update: vi.fn().mockReturnValue(updateChain),
  };

  const mockRedisCacheService = {
    get: vi.fn(async (key: string) => redisStore.get(key) ?? null),
    set: vi.fn(async (key: string, value: string) => {
      redisStore.set(key, value);
    }),
    del: vi.fn(async (key: string) => {
      redisStore.delete(key);
    }),
  };

  return {
    mockTenantDb,
    mockRedisCacheService,
    redisStore,
    selectResults,
    updateSetCalls,
    selectChain,
    updateChain,
  };
});

vi.mock('../../common/providers/tenant-aware-db.provider', () => ({
  getTenantDb: vi.fn(() => mockTenantDb),
}));

function enqueueSelectResult(result: unknown[]) {
  selectResults.push(result);
}

function makePermissionRequest() {
  return {
    description: '主人授权后，Agent 将修改自身编排',
    domain: 'self_evolution',
    category: 'agent_self_canvas_edit',
    riskLevel: 'low',
    sourceLabel: '当前 Agent',
    targetType: 'agent',
    targetLabel: '当前 Agent',
    approveEffect: '应用到当前草稿',
    denyEffect: '不做任何修改',
    diffPreview: { summary: '新增一个 skill 节点' },
    rememberable: true,
    resourcePaths: ['agent:agent-1'],
  } as const;
}

describe('SelfEvolutionPermissionService', () => {
  let service: SelfEvolutionPermissionService;

  beforeEach(() => {
    vi.clearAllMocks();
    selectResults.length = 0;
    updateSetCalls.length = 0;
    redisStore.clear();
    mockTenantDb.select.mockReturnValue(selectChain);
    mockTenantDb.update.mockReturnValue(updateChain);
    service = new SelfEvolutionPermissionService(
      mockTenantDb as never,
      mockRedisCacheService as never,
    );
  });

  it('应返回对话中已记住的同类授权决策', async () => {
    enqueueSelectResult([
      {
        metadata: {
          selfEvolution: {
            rememberedPolicies: {
              sandbox_spec_adjustment: 'approve',
            },
          },
        },
      },
    ]);

    const result = await service.getRememberedDecision(
      'conversation-1',
      'sandbox_spec_adjustment',
    );

    expect(result).toBe('approve');
  });

  it('没有 pending 请求时 resolveConversationRequest 应返回 false', async () => {
    const result = await service.resolveConversationRequest({
      conversationId: 'conversation-1',
      toolCallId: 'tool-call-1',
      action: 'approve',
    });

    expect(result).toBe(false);
    expect(mockTenantDb.update).not.toHaveBeenCalled();
  });

  it('应在批准后解析 pending 请求，并可按类别记住决策', async () => {
    await service.registerPendingRequest({
      sessionId: 'session-1',
      conversationId: 'conversation-1',
      toolCallId: 'tool-call-1',
      toolName: 'apply_change',
      permissionRequest: makePermissionRequest(),
    });

    enqueueSelectResult([
      {
        id: 'conversation-1',
        metadata: {},
      },
    ]);

    const resolutionPromise = service.waitForResolution(
      'session-1',
      'tool-call-1',
    );

    await expect(
      service.resolveConversationRequest({
        conversationId: 'conversation-1',
        toolCallId: 'tool-call-1',
        action: 'approve',
        rememberScope: 'conversation_category',
      }),
    ).resolves.toBe(true);

    await expect(resolutionPromise).resolves.toBe('approve');
    expect(mockTenantDb.update).toHaveBeenCalledTimes(1);
    expect(updateSetCalls[0]).toMatchObject({
      metadata: {
        selfEvolution: {
          rememberedPolicies: {
            agent_self_canvas_edit: 'approve',
          },
        },
      },
    });
  });

  it('应支持跨实例 resolve 会话中的 pending 请求', async () => {
    vi.useFakeTimers();

    try {
      const workerService = new SelfEvolutionPermissionService(
        mockTenantDb as never,
        mockRedisCacheService as never,
      );
      const apiService = new SelfEvolutionPermissionService(
        mockTenantDb as never,
        mockRedisCacheService as never,
      );

      await workerService.registerPendingRequest({
        sessionId: 'session-worker-1',
        conversationId: 'conversation-worker-1',
        toolCallId: 'tool-call-worker-1',
        toolName: 'create_resource',
        permissionRequest: makePermissionRequest(),
      });

      enqueueSelectResult([
        {
          id: 'conversation-worker-1',
          metadata: {},
        },
      ]);

      const resolutionPromise = workerService.waitForResolution(
        'session-worker-1',
        'tool-call-worker-1',
      );

      await expect(
        apiService.resolveConversationRequest({
          conversationId: 'conversation-worker-1',
          toolCallId: 'tool-call-worker-1',
          action: 'approve',
          rememberScope: 'conversation_category',
        }),
      ).resolves.toBe(true);

      await vi.advanceTimersByTimeAsync(500);

      await expect(resolutionPromise).resolves.toBe('approve');
      expect(mockTenantDb.update).toHaveBeenCalledTimes(1);
      expect(mockRedisCacheService.set).toHaveBeenCalledWith(
        'self_evolution:decision:session:session-worker-1:tool-call-worker-1',
        'approve',
        expect.any(Number),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('应复制 rememberedPolicies 到新会话 metadata', async () => {
    enqueueSelectResult([
      {
        metadata: {
          selfEvolution: {
            rememberedPolicies: {
              workflow_edit: 'deny',
            },
          },
        },
      },
    ]);
    enqueueSelectResult([
      {
        metadata: {
          selfEvolution: {
            rememberedPolicies: {
              agent_external_edit: 'approve',
            },
          },
        },
      },
    ]);

    await service.cloneRememberedPolicies('conversation-source', 'conversation-target');

    expect(mockTenantDb.update).toHaveBeenCalledTimes(1);
    expect(updateSetCalls[0]).toMatchObject({
      metadata: {
        selfEvolution: {
          rememberedPolicies: {
            agent_external_edit: 'approve',
            workflow_edit: 'deny',
          },
        },
      },
    });
  });
});
