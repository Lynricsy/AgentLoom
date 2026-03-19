import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotificationListener } from '../notification.listener';

const { createMockNotificationService } = vi.hoisted(() => ({
  createMockNotificationService: () => ({
    create: vi.fn(),
    findAll: vi.fn(),
    markAsRead: vi.fn(),
    markAllAsRead: vi.fn(),
    getUnreadCount: vi.fn(),
    getPreferences: vi.fn(),
    upsertPreference: vi.fn(),
    getById: vi.fn(),
  }),
}));

const transactionMocks = vi.hoisted(() => ({
  runInTenantTransaction: vi.fn(
    async (
      db: unknown,
      _tenantId: string,
      operation: (dbClient: unknown) => Promise<unknown>,
    ) => operation(db),
  ),
}));

vi.mock('../../../common/interceptors/tenant-transaction.context', () => ({
  runInTenantTransaction: transactionMocks.runInTenantTransaction,
}));

function createMockDb() {
  return {
    select: vi.fn(),
  };
}

function createJoinWhereResolved(result: unknown) {
  return {
    from: vi.fn().mockReturnValue({
      innerJoin: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(result),
      }),
    }),
  };
}

function createJoinWhereLimited(result: unknown) {
  return {
    from: vi.fn().mockReturnValue({
      innerJoin: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue(result),
        }),
      }),
    }),
  };
}

function createWhereLimited(result: unknown) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue(result),
      }),
    }),
  };
}

describe('NotificationListener', () => {
  let listener: NotificationListener;
  let db: ReturnType<typeof createMockDb>;
  let notificationService: ReturnType<typeof createMockNotificationService>;

  beforeEach(() => {
    vi.clearAllMocks();
    db = createMockDb();
    notificationService = createMockNotificationService();
    listener = new NotificationListener(
      db as never,
      notificationService as never,
    );
  });

  it('执行完成时应为租户内 Editor+ 用户创建完成通知', async () => {
    db.select
      .mockReturnValueOnce(
        createJoinWhereLimited([
          {
            workflowId: 'workflow-1',
            workflowName: '示例工作流',
            executionId: 'exec-1',
            errorMessage: null,
          },
        ]),
      )
      .mockReturnValueOnce(
        createJoinWhereResolved([
          { userId: 'owner-1' },
          { userId: 'creator-1' },
        ]),
      );
    notificationService.create.mockResolvedValue(undefined);

    await listener.handleExecutionStatusChanged({
      tenantId: 'tenant-1',
      executionId: 'exec-1',
      status: 'completed',
      completedSteps: 3,
      totalSteps: 3,
    });

    expect(notificationService.create).toHaveBeenCalledTimes(2);
    expect(notificationService.create).toHaveBeenNthCalledWith(1, 'tenant-1', {
      userId: 'owner-1',
      type: 'execution_completed',
      title: '执行已完成',
      body: {
        workflowId: 'workflow-1',
        workflowName: '示例工作流',
        executionId: 'exec-1',
        timelineUrl: '/executions/exec-1',
        completedSteps: 3,
        totalSteps: 3,
      },
    });
    expect(notificationService.create).toHaveBeenNthCalledWith(2, 'tenant-1', {
      userId: 'creator-1',
      type: 'execution_completed',
      title: '执行已完成',
      body: {
        workflowId: 'workflow-1',
        workflowName: '示例工作流',
        executionId: 'exec-1',
        timelineUrl: '/executions/exec-1',
        completedSteps: 3,
        totalSteps: 3,
      },
    });
  });

  it('执行失败时应附带错误原因与建议', async () => {
    db.select
      .mockReturnValueOnce(
        createJoinWhereLimited([
          {
            workflowId: 'workflow-2',
            workflowName: '失败工作流',
            executionId: 'exec-2',
            errorMessage: { message: '数据库连接失败' },
          },
        ]),
      )
      .mockReturnValueOnce(createJoinWhereResolved([{ userId: 'admin-1' }]));
    notificationService.create.mockResolvedValue(undefined);

    await listener.handleExecutionStatusChanged({
      tenantId: 'tenant-1',
      executionId: 'exec-2',
      status: 'failed',
      errorMessage: 'boom',
    });

    expect(notificationService.create).toHaveBeenCalledWith('tenant-1', {
      userId: 'admin-1',
      type: 'execution_failed',
      title: '执行失败',
      body: {
        workflowId: 'workflow-2',
        workflowName: '失败工作流',
        executionId: 'exec-2',
        timelineUrl: '/executions/exec-2',
        errorReason: 'boom',
        suggestion:
          '请打开执行详情查看失败节点与时间线，并在修复后重新运行工作流。',
      },
    });
  });

  it('人工介入事件应为租户内 Editor+ 用户创建介入通知', async () => {
    db.select
      .mockReturnValueOnce(
        createJoinWhereLimited([
          {
            workflowId: 'workflow-3',
            workflowName: '人工审核工作流',
            executionId: 'exec-3',
            errorMessage: null,
          },
        ]),
      )
      .mockReturnValueOnce(createJoinWhereResolved([{ userId: 'owner-1' }]));
    notificationService.create.mockResolvedValue(undefined);

    await listener.handleInterventionRequired({
      tenantId: 'tenant-1',
      executionId: 'exec-3',
      stepId: 'step-1',
      nodeId: 'node-1',
      nodeName: '审批节点',
      requestedAt: '2026-03-10T10:00:00.000Z',
      decision: {
        suggestedContent: '请确认预算是否通过',
        rationale: '预算金额超出阈值，需要人工确认。',
      },
    });

    expect(notificationService.create).toHaveBeenCalledWith('tenant-1', {
      userId: 'owner-1',
      type: 'intervention_required',
      title: '执行需要人工介入',
      body: {
        workflowId: 'workflow-3',
        workflowName: '人工审核工作流',
        executionId: 'exec-3',
        timelineUrl: '/executions/exec-3',
        nodeId: 'node-1',
        nodeName: '审批节点',
        interventionReason: '预算金额超出阈值，需要人工确认。',
        requestedAt: '2026-03-10T10:00:00.000Z',
      },
    });
  });

  it('资源配额更新事件应通知租户内 Editor+ 用户', async () => {
    db.select.mockReturnValueOnce(
      createJoinWhereResolved([{ userId: 'owner-1' }, { userId: 'admin-1' }]),
    );
    notificationService.create.mockResolvedValue(undefined);

    await listener.handleQuotaUpdated({
      tenantId: 'tenant-1',
      organizationId: 'org-1',
      previousQuota: {
        organizationId: 'org-1',
        tenantId: 'tenant-1',
        apiRateLimitPerMinute: 100,
        maxConcurrentExecutions: null,
        dailyExecutionLimit: null,
        dailyApiCallLimit: null,
        storageQuotaMb: null,
        maxSandboxCpuPercent: null,
        maxSandboxMemoryMb: null,
        version: 0,
      },
      quota: {
        organizationId: 'org-1',
        tenantId: 'tenant-1',
        apiRateLimitPerMinute: 180,
        maxConcurrentExecutions: 8,
        dailyExecutionLimit: 1200,
        dailyApiCallLimit: null,
        storageQuotaMb: null,
        maxSandboxCpuPercent: null,
        maxSandboxMemoryMb: null,
        version: 1,
      },
      requestedAt: '2026-03-18T00:00:00.000Z',
      effectedAt: '2026-03-18T00:00:01.000Z',
      actor: {
        actorId: 'user-1',
        actorType: 'user',
      },
    });

    expect(notificationService.create).toHaveBeenNthCalledWith(1, 'tenant-1', {
      userId: 'owner-1',
      type: 'resource_governance_quota_updated',
      title: '资源配额已更新',
      body: {
        organizationId: 'org-1',
        requestedAt: '2026-03-18T00:00:00.000Z',
        effectedAt: '2026-03-18T00:00:01.000Z',
        updatedBy: 'user-1',
        quota: expect.objectContaining({
          apiRateLimitPerMinute: 180,
        }),
        previousQuota: expect.objectContaining({
          apiRateLimitPerMinute: 100,
        }),
      },
    });
    expect(notificationService.create).toHaveBeenNthCalledWith(2, 'tenant-1', {
      userId: 'admin-1',
      type: 'resource_governance_quota_updated',
      title: '资源配额已更新',
      body: expect.objectContaining({
        organizationId: 'org-1',
      }),
    });
  });

  it('执行治理控制更新事件应通知租户内 Editor+ 用户', async () => {
    db.select.mockReturnValueOnce(
      createJoinWhereResolved([{ userId: 'creator-1' }]),
    );
    notificationService.create.mockResolvedValue(undefined);

    await listener.handleControlsUpdated({
      tenantId: 'tenant-1',
      organizationId: 'org-1',
      previousGovernance: {
        organizationId: 'org-1',
        tenantId: 'tenant-1',
        tenantControl: {
          scope: 'tenant',
          targetId: 'tenant-1',
          status: 'active',
          reason: null,
          updatedAt: null,
          updatedBy: null,
        },
        workflowControls: [],
        version: 0,
      },
      governance: {
        organizationId: 'org-1',
        tenantId: 'tenant-1',
        tenantControl: {
          scope: 'tenant',
          targetId: 'tenant-1',
          status: 'paused',
          reason: 'incident response',
          updatedAt: '2026-03-18T00:00:01.000Z',
          updatedBy: 'user-1',
        },
        workflowControls: [],
        version: 1,
      },
      requestedAt: '2026-03-18T00:00:00.000Z',
      effectedAt: '2026-03-18T00:00:01.000Z',
      actor: {
        actorId: 'user-1',
        actorType: 'user',
      },
    });

    expect(notificationService.create).toHaveBeenCalledWith('tenant-1', {
      userId: 'creator-1',
      type: 'resource_governance_controls_updated',
      title: '执行治理策略已更新',
      body: {
        organizationId: 'org-1',
        requestedAt: '2026-03-18T00:00:00.000Z',
        effectedAt: '2026-03-18T00:00:01.000Z',
        updatedBy: 'user-1',
        tenantControl: {
          scope: 'tenant',
          targetId: 'tenant-1',
          status: 'paused',
          reason: 'incident response',
          updatedAt: '2026-03-18T00:00:01.000Z',
          updatedBy: 'user-1',
        },
        workflowControls: [],
        previousGovernance: expect.objectContaining({
          version: 0,
        }),
      },
    });
  });

  it('新执行被资源治理阻止事件应通知租户内 Editor+ 用户', async () => {
    db.select
      .mockReturnValueOnce(
        createWhereLimited([
          {
            workflowId: 'workflow-7',
            workflowName: '受治理限制工作流',
          },
        ]),
      )
      .mockReturnValueOnce(createJoinWhereResolved([{ userId: 'owner-1' }]));
    notificationService.create.mockResolvedValue(undefined);

    await listener.handleExecutionStartBlocked({
      tenantId: 'tenant-1',
      organizationId: 'org-1',
      workflowId: 'workflow-7',
      category: 'workflow_pause',
      scope: 'workflow',
      reason: 'workflow governance pause is preventing new workflow executions',
      blockedAt: '2026-03-18T00:00:02.000Z',
      actor: {
        actorId: 'admin-1',
        actorType: 'user',
      },
      effectiveState: {
        organizationId: 'org-1',
        tenantControl: {
          scope: 'tenant',
          targetId: 'tenant-1',
          status: 'active',
          reason: null,
          updatedAt: null,
          updatedBy: null,
        },
        workflowControl: {
          scope: 'workflow',
          targetId: 'workflow-7',
          status: 'paused',
          reason: 'incident response',
          updatedAt: '2026-03-18T00:00:01.000Z',
          updatedBy: 'admin-1',
        },
      },
    });

    expect(notificationService.create).toHaveBeenCalledWith('tenant-1', {
      userId: 'owner-1',
      type: 'resource_governance_execution_blocked',
      title: '新执行已被资源治理阻止',
      body: {
        organizationId: 'org-1',
        workflowId: 'workflow-7',
        workflowName: '受治理限制工作流',
        reason: 'workflow governance pause is preventing new workflow executions',
        category: 'workflow_pause',
        scope: 'workflow',
        requestedAt: '2026-03-18T00:00:02.000Z',
        resourceGovernanceUrl: '/settings/resource-quotas',
      },
    });
  });

  it('异常执行终止事件应携带结构化执行上下文通知 Editor+ 用户', async () => {
    db.select
      .mockReturnValueOnce(
        createJoinWhereLimited([
          {
            workflowId: 'workflow-9',
            workflowName: '治理终止工作流',
            executionId: 'exec-9',
            errorMessage: null,
          },
        ]),
      )
      .mockReturnValueOnce(createJoinWhereResolved([{ userId: 'owner-1' }]));
    notificationService.create.mockResolvedValue(undefined);

    await listener.handleExecutionTerminated({
      tenantId: 'tenant-1',
      organizationId: 'org-1',
      executionId: 'exec-9',
      workflowId: 'workflow-9',
      reason: 'detected anomalous execution pattern',
      requestedAt: '2026-03-18T00:00:00.000Z',
      effectedAt: '2026-03-18T00:00:03.000Z',
      actor: {
        actorId: 'admin-1',
        actorType: 'user',
      },
    });

    expect(notificationService.create).toHaveBeenCalledWith('tenant-1', {
      userId: 'owner-1',
      type: 'resource_governance_execution_terminated',
      title: '异常执行已终止',
      body: {
        workflowId: 'workflow-9',
        workflowName: '治理终止工作流',
        executionId: 'exec-9',
        timelineUrl: '/executions/exec-9',
        organizationId: 'org-1',
        reason: 'detected anomalous execution pattern',
        requestedAt: '2026-03-18T00:00:00.000Z',
        effectedAt: '2026-03-18T00:00:03.000Z',
      },
    });
  });

  it('非目标状态、执行不存在或无 Editor+ 收件人时不应创建通知', async () => {
    await listener.handleExecutionStatusChanged({
      tenantId: 'tenant-1',
      executionId: 'exec-4',
      status: 'running',
    });
    expect(notificationService.create).not.toHaveBeenCalled();

    db.select
      .mockReturnValueOnce(createJoinWhereLimited([]))
      .mockReturnValueOnce(createJoinWhereResolved([{ userId: 'owner-1' }]));

    await listener.handleExecutionStatusChanged({
      tenantId: 'tenant-1',
      executionId: 'exec-5',
      status: 'completed',
    });

    db.select
      .mockReturnValueOnce(
        createJoinWhereLimited([
          {
            workflowId: 'workflow-6',
            workflowName: '无收件人工作流',
            executionId: 'exec-6',
            errorMessage: null,
          },
        ]),
      )
      .mockReturnValueOnce(createJoinWhereResolved([]));

    await listener.handleExecutionStatusChanged({
      tenantId: 'tenant-1',
      executionId: 'exec-6',
      status: 'completed',
    });

    expect(notificationService.create).not.toHaveBeenCalled();
  });
});
