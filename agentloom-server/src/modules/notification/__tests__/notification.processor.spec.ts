import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Job } from 'bullmq';
import { NotificationProcessor } from '../notification.processor';
import {
  NOTIFICATION_CHANNEL_PUSH,
  NOTIFICATION_DISPATCH_JOB,
  type NotificationDispatchJobData,
} from '../notification.constants';

const {
  createMockNotificationService,
  createMockNotificationGateway,
  createMockPushNotificationService,
} = vi.hoisted(() => ({
  createMockNotificationService: () => ({
    create: vi.fn(),
    findAll: vi.fn(),
    markAsRead: vi.fn(),
    markAllAsRead: vi.fn(),
    getUnreadCount: vi.fn(),
    getPreferences: vi.fn(),
    getPreferenceForChannel: vi.fn(),
    upsertPreference: vi.fn(),
    getById: vi.fn(),
  }),
  createMockNotificationGateway: () => ({
    sendToUser: vi.fn(),
    sendUnreadCount: vi.fn(),
  }),
  createMockPushNotificationService: () => ({
    sendToUser: vi.fn(),
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
  let pushNotificationService: ReturnType<
    typeof createMockPushNotificationService
  >;

  const notification = {
    id: 'notification-1',
    tenantId: 'tenant-1',
    userId: 'user-1',
    type: 'execution_completed',
    title: '执行已完成',
    body: {
      message: '工作流执行完成',
      executionId: 'exec-1',
      workflowId: 'workflow-1',
      nodeId: 'node-1',
    },
    isRead: false,
    createdAt: new Date('2025-01-01T00:00:00Z'),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    notificationService = createMockNotificationService();
    notificationGateway = createMockNotificationGateway();
    pushNotificationService = createMockPushNotificationService();
    processor = new NotificationProcessor(
      {} as never,
      notificationService as never,
      notificationGateway as never,
      pushNotificationService as never,
    );
  });

  it('非 dispatch job 应直接跳过', async () => {
    await expect(
      processor.process(createJob({ name: 'unknown-job' })),
    ).resolves.toEqual({ pushed: false });
    expect(transactionMocks.runInTenantTransaction).not.toHaveBeenCalled();
  });

  it('通知不存在时应跳过推送', async () => {
    notificationService.getById.mockResolvedValue(null);

    await expect(processor.process(createJob())).resolves.toEqual({
      pushed: false,
    });
    expect(notificationGateway.sendToUser).not.toHaveBeenCalled();
    expect(pushNotificationService.sendToUser).not.toHaveBeenCalled();
  });

  it('push 偏好启用时应发送推送并同步未读数', async () => {
    notificationService.getById.mockResolvedValue(notification);
    notificationService.getPreferenceForChannel
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'pref-push',
        tenantId: 'tenant-1',
        userId: 'user-1',
        type: 'execution_completed',
        channel: NOTIFICATION_CHANNEL_PUSH,
        enabled: true,
      });
    notificationService.getUnreadCount.mockResolvedValue({ count: 7 });

    await expect(processor.process(createJob())).resolves.toEqual({
      pushed: true,
    });

    expect(notificationGateway.sendToUser).toHaveBeenCalledWith(
      'tenant-1',
      'user-1',
      notification,
    );
    expect(pushNotificationService.sendToUser).toHaveBeenCalledWith('user-1', {
      title: '执行已完成',
      body: '工作流执行完成',
      data: {
        type: 'execution_completed',
        notificationId: 'notification-1',
        executionId: 'exec-1',
        workflowId: 'workflow-1',
        nodeId: 'node-1',
      },
    });
    expect(notificationGateway.sendUnreadCount).toHaveBeenCalledWith(
      'tenant-1',
      'user-1',
      7,
    );
  });

  it('push 偏好禁用时不应发送推送', async () => {
    notificationService.getById.mockResolvedValue(notification);
    notificationService.getPreferenceForChannel
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'pref-push-disabled',
        tenantId: 'tenant-1',
        userId: 'user-1',
        type: 'execution_completed',
        channel: NOTIFICATION_CHANNEL_PUSH,
        enabled: false,
      });
    notificationService.getUnreadCount.mockResolvedValue({ count: 3 });

    await expect(processor.process(createJob())).resolves.toEqual({
      pushed: true,
    });

    expect(notificationGateway.sendToUser).toHaveBeenCalledOnce();
    expect(pushNotificationService.sendToUser).not.toHaveBeenCalled();
  });

  it('未配置 push 偏好时应默认启用推送', async () => {
    notificationService.getById.mockResolvedValue(notification);
    notificationService.getPreferenceForChannel
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    notificationService.getUnreadCount.mockResolvedValue({ count: 5 });

    await expect(processor.process(createJob())).resolves.toEqual({
      pushed: true,
    });

    expect(pushNotificationService.sendToUser).toHaveBeenCalledOnce();
  });

  it('in_app 禁用不应影响 push 独立发送', async () => {
    notificationService.getById.mockResolvedValue(notification);
    notificationService.getPreferenceForChannel
      .mockResolvedValueOnce({
        id: 'pref-in-app-disabled',
        tenantId: 'tenant-1',
        userId: 'user-1',
        type: 'execution_completed',
        channel: 'in_app',
        enabled: false,
      })
      .mockResolvedValueOnce(null);
    notificationService.getUnreadCount.mockResolvedValue({ count: 9 });

    await expect(processor.process(createJob())).resolves.toEqual({
      pushed: true,
    });

    expect(notificationGateway.sendToUser).not.toHaveBeenCalled();
    expect(pushNotificationService.sendToUser).toHaveBeenCalledOnce();
    expect(notificationGateway.sendUnreadCount).toHaveBeenCalledWith(
      'tenant-1',
      'user-1',
      9,
    );
  });

  it('notifyChannels 仅允许 in_app 时不应发送 push', async () => {
    notificationService.getById.mockResolvedValue({
      ...notification,
      body: {
        ...notification.body,
        notifyChannels: ['in_app'],
      },
    });
    notificationService.getPreferenceForChannel
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    notificationService.getUnreadCount.mockResolvedValue({ count: 2 });

    await expect(processor.process(createJob())).resolves.toEqual({
      pushed: true,
    });

    expect(notificationGateway.sendToUser).toHaveBeenCalledOnce();
    expect(pushNotificationService.sendToUser).not.toHaveBeenCalled();
  });

  it('notifyChannels 仅允许 push 时不应发送 in_app', async () => {
    notificationService.getById.mockResolvedValue({
      ...notification,
      body: {
        ...notification.body,
        notifyChannels: ['push'],
      },
    });
    notificationService.getPreferenceForChannel
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    notificationService.getUnreadCount.mockResolvedValue({ count: 4 });

    await expect(processor.process(createJob())).resolves.toEqual({
      pushed: true,
    });

    expect(notificationGateway.sendToUser).not.toHaveBeenCalled();
    expect(pushNotificationService.sendToUser).toHaveBeenCalledOnce();
  });

  it('notifyChannels 仅含 email 时不应触发 in_app 或 push 发送', async () => {
    notificationService.getById.mockResolvedValue({
      ...notification,
      body: {
        ...notification.body,
        notifyChannels: ['email'],
      },
    });
    notificationService.getPreferenceForChannel
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    notificationService.getUnreadCount.mockResolvedValue({ count: 6 });

    await expect(processor.process(createJob())).resolves.toEqual({
      pushed: true,
    });

    expect(notificationGateway.sendToUser).not.toHaveBeenCalled();
    expect(pushNotificationService.sendToUser).not.toHaveBeenCalled();
    expect(notificationGateway.sendUnreadCount).toHaveBeenCalledWith(
      'tenant-1',
      'user-1',
      6,
    );
  });
});
