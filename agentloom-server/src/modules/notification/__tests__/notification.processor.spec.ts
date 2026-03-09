import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Job } from 'bullmq';
import { NotificationProcessor } from '../notification.processor';
import {
  NOTIFICATION_DISPATCH_JOB,
  type NotificationDispatchJobData,
} from '../notification.constants';

const { createMockNotificationService, createMockNotificationGateway } =
  vi.hoisted(() => ({
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
    createMockNotificationGateway: () => ({
      sendToUser: vi.fn(),
      sendUnreadCount: vi.fn(),
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

function createJob(
  overrides: Partial<Job<NotificationDispatchJobData>> = {},
): Job<NotificationDispatchJobData> {
  return {
    id: 'job-1',
    name: NOTIFICATION_DISPATCH_JOB,
    data: {
      tenantId: 'tenant-1',
      userId: 'user-1',
      notificationId: 'notification-1',
      type: 'execution_completed',
    },
    ...overrides,
  } as Job<NotificationDispatchJobData>;
}

describe('NotificationProcessor', () => {
  let processor: NotificationProcessor;
  let notificationService: ReturnType<typeof createMockNotificationService>;
  let notificationGateway: ReturnType<typeof createMockNotificationGateway>;

  beforeEach(() => {
    vi.clearAllMocks();
    notificationService = createMockNotificationService();
    notificationGateway = createMockNotificationGateway();
    processor = new NotificationProcessor(
      {} as never,
      notificationService as never,
      notificationGateway as never,
    );
  });

  it('非 dispatch job 应直接跳过', async () => {
    await expect(
      processor.process(createJob({ name: 'unknown-job' })),
    ).resolves.toEqual({ pushed: false });
    expect(transactionMocks.runInTenantTransaction).not.toHaveBeenCalled();
  });

  it('push 渠道被禁用时应跳过推送', async () => {
    notificationService.getPreferences.mockResolvedValue([
      {
        id: 'pref-1',
        tenantId: 'tenant-1',
        userId: 'user-1',
        type: 'execution_completed',
        channel: 'push',
        enabled: false,
      },
    ]);

    await expect(processor.process(createJob())).resolves.toEqual({ pushed: false });
    expect(notificationService.getById).not.toHaveBeenCalled();
    expect(notificationGateway.sendToUser).not.toHaveBeenCalled();
  });

  it('通知不存在时应跳过推送', async () => {
    notificationService.getPreferences.mockResolvedValue([]);
    notificationService.getById.mockResolvedValue(null);

    await expect(processor.process(createJob())).resolves.toEqual({ pushed: false });
    expect(notificationGateway.sendToUser).not.toHaveBeenCalled();
  });

  it('应向用户推送通知并同步未读数', async () => {
    const notification = {
      id: 'notification-1',
      tenantId: 'tenant-1',
      userId: 'user-1',
      type: 'execution_completed',
      title: '执行已完成',
      body: { executionId: 'exec-1' },
      isRead: false,
      createdAt: new Date('2025-01-01T00:00:00Z'),
    };
    notificationService.getPreferences.mockResolvedValue([]);
    notificationService.getById.mockResolvedValue(notification);
    notificationService.getUnreadCount.mockResolvedValue({ count: 7 });

    await expect(processor.process(createJob())).resolves.toEqual({ pushed: true });
    expect(notificationGateway.sendToUser).toHaveBeenCalledWith(
      'tenant-1',
      'user-1',
      notification,
    );
    expect(notificationGateway.sendUnreadCount).toHaveBeenCalledWith(
      'tenant-1',
      'user-1',
      7,
    );
  });
});
