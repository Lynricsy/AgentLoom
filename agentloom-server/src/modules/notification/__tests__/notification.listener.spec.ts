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
