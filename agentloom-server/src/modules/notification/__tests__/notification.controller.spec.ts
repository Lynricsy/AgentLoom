import 'reflect-metadata';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotificationController } from '../notification.controller';
import { ROLES_KEY } from '../../../common/decorators/roles.decorator';
import { listNotificationsQuerySchema } from '../dto/list-notifications-query.dto';
import { upsertPreferenceSchema } from '../dto/upsert-preference.dto';

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

describe('NotificationController', () => {
  let controller: NotificationController;
  let notificationService: ReturnType<typeof createMockNotificationService>;

  beforeEach(() => {
    vi.clearAllMocks();
    notificationService = createMockNotificationService();
    controller = new NotificationController(notificationService as never);
  });

  it('应返回分页通知列表', async () => {
    const paginated = {
      data: [{ id: 'notification-1' }],
      meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
    };
    notificationService.findAll.mockResolvedValue(paginated);

    await expect(
      controller.findAll('tenant-1', 'user-1', {
        page: 1,
        pageSize: 20,
        isRead: false,
      }),
    ).resolves.toEqual({
      data: [{ id: 'notification-1' }],
      page: 1,
      limit: 20,
      total: 1,
      totalPages: 1,
      meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
    });
    expect(notificationService.findAll).toHaveBeenCalledWith(
      'tenant-1',
      'user-1',
      { page: 1, pageSize: 20, isRead: false },
    );
  });

  it('应返回未读数量', async () => {
    notificationService.getUnreadCount.mockResolvedValue({ count: 3 });

    await expect(
      controller.getUnreadCount('tenant-1', 'user-1'),
    ).resolves.toEqual({
      data: { count: 3 },
    });
  });

  it('应将单条通知标记为已读', async () => {
    notificationService.markAsRead.mockResolvedValue({ id: 'notification-1' });

    await expect(
      controller.markAsRead('notification-1', 'tenant-1', 'user-1'),
    ).resolves.toEqual({ data: { id: 'notification-1' } });
    expect(notificationService.markAsRead).toHaveBeenCalledWith(
      'tenant-1',
      'user-1',
      'notification-1',
    );
  });

  it('应将全部通知标记为已读', async () => {
    notificationService.markAllAsRead.mockResolvedValue({ updatedCount: 4 });

    await expect(
      controller.markAllAsRead('tenant-1', 'user-1'),
    ).resolves.toEqual({
      data: { updatedCount: 4 },
    });
  });

  it('应返回通知偏好', async () => {
    notificationService.getPreferences.mockResolvedValue([{ id: 'pref-1' }]);

    await expect(
      controller.getPreferences('tenant-1', 'user-1'),
    ).resolves.toEqual({
      data: [{ id: 'pref-1' }],
    });
  });

  it('应更新通知偏好', async () => {
    const dto = {
      type: 'execution_failed' as const,
      channel: 'in_app' as const,
      enabled: false,
    };
    notificationService.upsertPreference.mockResolvedValue({
      id: 'pref-1',
      ...dto,
    });

    await expect(
      controller.upsertPreference('tenant-1', 'user-1', dto),
    ).resolves.toEqual({
      data: { id: 'pref-1', ...dto },
    });
  });

  it('应为所有接口声明 Viewer+ 角色访问控制', () => {
    const methodNames = [
      'findAll',
      'getUnreadCount',
      'markAsRead',
      'markAllAsRead',
      'getPreferences',
      'upsertPreference',
    ] as const;

    for (const methodName of methodNames) {
      const descriptor = Object.getOwnPropertyDescriptor(
        NotificationController.prototype,
        methodName,
      );
      expect(descriptor?.value).toBeDefined();

      const roles = Reflect.getMetadata(
        ROLES_KEY,
        descriptor?.value as object,
      ) as string[];
      expect(roles).toEqual([
        'viewer',
        'operator',
        'creator',
        'admin',
        'owner',
      ]);
    }
  });

  it('应正确解析通知列表查询 DTO', () => {
    expect(
      listNotificationsQuerySchema.parse({
        page: '2',
        limit: '10',
        is_read: 'true',
      }),
    ).toEqual({
      page: 2,
      pageSize: 10,
      isRead: true,
    });
  });

  it('应校验通知偏好 DTO', () => {
    expect(
      upsertPreferenceSchema.parse({
        type: 'execution_completed',
        channel: 'in_app',
        enabled: true,
      }),
    ).toEqual({
      type: 'execution_completed',
      channel: 'in_app',
      enabled: true,
    });

    expect(() =>
      upsertPreferenceSchema.parse({
        type: 'invalid',
        channel: 'in_app',
        enabled: true,
      }),
    ).toThrow();

    expect(
      upsertPreferenceSchema.parse({
        type: 'execution_completed',
        channel: 'push',
        enabled: true,
      }),
    ).toEqual({
      type: 'execution_completed',
      channel: 'push',
      enabled: true,
    });
  });
});
