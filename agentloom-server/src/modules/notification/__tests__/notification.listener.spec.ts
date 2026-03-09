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

function createSelectChain(result: unknown) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(result),
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
    listener = new NotificationListener(db as never, notificationService as never);
  });

  it('执行完成时应创建完成通知', async () => {
    db.select.mockReturnValue(createSelectChain([{ createdBy: 'user-1' }]));
    notificationService.create.mockResolvedValue(undefined);

    await listener.handleExecutionStatusChanged({
      tenantId: 'tenant-1',
      executionId: 'exec-1',
      status: 'completed',
      completedSteps: 3,
      totalSteps: 3,
    });

    expect(notificationService.create).toHaveBeenCalledWith('tenant-1', {
      userId: 'user-1',
      type: 'execution_completed',
      title: '执行已完成',
      body: {
        executionId: 'exec-1',
        status: 'completed',
        completedSteps: 3,
        totalSteps: 3,
      },
    });
  });

  it('执行失败时应创建失败通知', async () => {
    db.select.mockReturnValue(createSelectChain([{ createdBy: 'user-1' }]));
    notificationService.create.mockResolvedValue(undefined);

    await listener.handleExecutionStatusChanged({
      tenantId: 'tenant-1',
      executionId: 'exec-2',
      status: 'failed',
      errorMessage: 'boom',
    });

    expect(notificationService.create).toHaveBeenCalledWith('tenant-1', {
      userId: 'user-1',
      type: 'execution_failed',
      title: '执行失败',
      body: {
        executionId: 'exec-2',
        status: 'failed',
        errorMessage: 'boom',
      },
    });
  });

  it('需要人工介入时应创建介入通知', async () => {
    db.select.mockReturnValue(createSelectChain([{ createdBy: 'user-1' }]));
    notificationService.create.mockResolvedValue(undefined);

    await listener.handleExecutionStatusChanged({
      tenantId: 'tenant-1',
      executionId: 'exec-3',
      status: 'paused',
    });

    expect(notificationService.create).toHaveBeenCalledWith('tenant-1', {
      userId: 'user-1',
      type: 'intervention_required',
      title: '执行需要人工介入',
      body: {
        executionId: 'exec-3',
        status: 'paused',
      },
    });
  });

  it('非目标状态或执行不存在时不应创建通知', async () => {
    await listener.handleExecutionStatusChanged({
      tenantId: 'tenant-1',
      executionId: 'exec-4',
      status: 'running',
    });
    expect(notificationService.create).not.toHaveBeenCalled();

    db.select.mockReturnValue(createSelectChain([]));

    await listener.handleExecutionStatusChanged({
      tenantId: 'tenant-1',
      executionId: 'exec-5',
      status: 'completed',
    });

    expect(notificationService.create).not.toHaveBeenCalled();
  });
});
