import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { NotificationService } from '../notification.service';
import {
  NOTIFICATION_QUEUE,
  NOTIFICATION_DISPATCH_JOB,
} from '../notification.constants';
import { DRIZZLE } from '../../../database/database.module';
import { transactionStorage } from '../../../common/interceptors/tenant-transaction.context';

const mocks = vi.hoisted(() => ({
  getTenantDb: vi.fn(),
  createMockQueue: () => ({
    add: vi.fn(),
  }),
  createMockDb: () => ({
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  }),
}));

vi.mock('../../../common/providers/tenant-aware-db.provider', () => ({
  getTenantDb: mocks.getTenantDb,
}));

const TENANT_ID = '019391d4-a000-7000-0000-000000000001';
const USER_ID = '019391d4-b000-7000-0000-000000000002';
const NOTIFICATION_ID = '019391d4-c000-7000-0000-000000000003';
const NOW = new Date('2025-01-01T00:00:00Z');

const mockNotification = {
  id: NOTIFICATION_ID,
  tenantId: TENANT_ID,
  userId: USER_ID,
  type: 'execution_completed' as const,
  title: '执行已完成',
  body: { executionId: 'exec-1' },
  isRead: false,
  createdAt: NOW,
};

function createInsertReturning(result: unknown) {
  return {
    values: vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue(result),
    }),
  };
}

function createSelectWhereResolved(result: unknown) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(result),
    }),
  };
}

function createSelectPaginated(result: unknown) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        orderBy: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            offset: vi.fn().mockResolvedValue(result),
          }),
        }),
      }),
    }),
  };
}

function createSelectOrdered(result: unknown) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        orderBy: vi.fn().mockResolvedValue(result),
      }),
    }),
  };
}

function createUpdateReturning(result: unknown) {
  return {
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue(result),
      }),
    }),
  };
}

describe('NotificationService', () => {
  let service: NotificationService;
  let db: ReturnType<typeof mocks.createMockDb>;
  let notificationQueue: ReturnType<typeof mocks.createMockQueue>;

  beforeEach(async () => {
    vi.clearAllMocks();

    db = mocks.createMockDb();
    notificationQueue = mocks.createMockQueue();
    mocks.getTenantDb.mockReturnValue(db);

    const module = await Test.createTestingModule({
      providers: [
        NotificationService,
        { provide: DRIZZLE, useValue: db },
        {
          provide: getQueueToken(NOTIFICATION_QUEUE),
          useValue: notificationQueue,
        },
      ],
    }).compile();

    service = module.get(NotificationService);
  });

  describe('create', () => {
    it('应插入通知并派发 BullMQ job', async () => {
      db.insert.mockReturnValue(createInsertReturning([mockNotification]));
      notificationQueue.add.mockResolvedValue(undefined);

      const result = await service.create(TENANT_ID, {
        userId: USER_ID,
        type: 'execution_completed',
        title: '执行已完成',
        body: { executionId: 'exec-1' },
      });

      expect(result).toEqual(mockNotification);
      expect(notificationQueue.add).toHaveBeenCalledWith(
        NOTIFICATION_DISPATCH_JOB,
        {
          tenantId: TENANT_ID,
          userId: USER_ID,
          notificationId: NOTIFICATION_ID,
          type: 'execution_completed',
        },
        { jobId: NOTIFICATION_ID },
      );
    });

    it('在租户事务内应延迟到提交后才入队', async () => {
      db.insert.mockReturnValue(createInsertReturning([mockNotification]));
      notificationQueue.add.mockResolvedValue(undefined);

      const afterCommitHooks: Array<() => Promise<void>> = [];
      await transactionStorage.run(
        { db: db as never, afterCommitHooks },
        async () => {
          await service.create(TENANT_ID, {
            userId: USER_ID,
            type: 'execution_completed',
            title: '执行已完成',
          });
        },
      );

      // processor 在独立事务里按 notificationId 读行，提交前入队必然读不到。
      expect(notificationQueue.add).not.toHaveBeenCalled();
      expect(afterCommitHooks).toHaveLength(1);

      await afterCommitHooks[0]();

      expect(notificationQueue.add).toHaveBeenCalledWith(
        NOTIFICATION_DISPATCH_JOB,
        expect.objectContaining({ notificationId: NOTIFICATION_ID }),
        { jobId: NOTIFICATION_ID },
      );
    });
  });

  describe('findAll', () => {
    it('应返回分页通知列表与 meta', async () => {
      db.select
        .mockReturnValueOnce(createSelectPaginated([mockNotification]))
        .mockReturnValueOnce(createSelectWhereResolved([{ total: 3 }]));

      const result = await service.findAll(TENANT_ID, USER_ID, {
        page: 2,
        pageSize: 2,
        isRead: false,
      });

      expect(result).toEqual({
        data: [mockNotification],
        meta: {
          page: 2,
          pageSize: 2,
          total: 3,
          totalPages: 2,
        },
      });
    });
  });

  describe('markAsRead', () => {
    it('应将单条通知标记为已读', async () => {
      db.update.mockReturnValue(
        createUpdateReturning([{ ...mockNotification, isRead: true }]),
      );

      const result = await service.markAsRead(
        TENANT_ID,
        USER_ID,
        NOTIFICATION_ID,
      );

      expect(result).toEqual({ ...mockNotification, isRead: true });
    });

    it('通知不存在时返回 null', async () => {
      db.update.mockReturnValue(createUpdateReturning([]));

      await expect(
        service.markAsRead(TENANT_ID, USER_ID, NOTIFICATION_ID),
      ).resolves.toBeNull();
    });
  });

  describe('markAllAsRead', () => {
    it('应返回更新数量', async () => {
      db.update.mockReturnValue(
        createUpdateReturning([{ id: 'n1' }, { id: 'n2' }]),
      );

      await expect(service.markAllAsRead(TENANT_ID, USER_ID)).resolves.toEqual({
        updatedCount: 2,
      });
    });
  });

  describe('getUnreadCount', () => {
    it('应返回未读通知数量', async () => {
      db.select.mockReturnValue(createSelectWhereResolved([{ count: 5 }]));

      await expect(service.getUnreadCount(TENANT_ID, USER_ID)).resolves.toEqual(
        {
          count: 5,
        },
      );
    });
  });

  describe('getPreferences', () => {
    it('应返回用户通知偏好', async () => {
      const preferences = [
        {
          id: 'pref-1',
          tenantId: TENANT_ID,
          userId: USER_ID,
          type: 'execution_completed' as const,
          channel: 'in_app',
          enabled: true,
        },
      ];
      db.select.mockReturnValue(createSelectOrdered(preferences));

      await expect(service.getPreferences(TENANT_ID, USER_ID)).resolves.toEqual(
        preferences,
      );
    });
  });

  describe('getPreferenceForChannel', () => {
    it('应返回指定渠道的通知偏好', async () => {
      const preference = {
        id: 'pref-push-1',
        tenantId: TENANT_ID,
        userId: USER_ID,
        type: 'execution_completed' as const,
        channel: 'push',
        enabled: true,
      };
      db.select.mockReturnValue(createSelectWhereResolved([preference]));

      await expect(
        service.getPreferenceForChannel(
          TENANT_ID,
          USER_ID,
          'execution_completed',
          'push',
        ),
      ).resolves.toEqual(preference);
    });

    it('渠道偏好不存在时应返回 null', async () => {
      db.select.mockReturnValue(createSelectWhereResolved([]));

      await expect(
        service.getPreferenceForChannel(
          TENANT_ID,
          USER_ID,
          'execution_completed',
          'push',
        ),
      ).resolves.toBeNull();
    });
  });

  describe('upsertPreference', () => {
    it('应插入或更新通知偏好', async () => {
      const preference = {
        id: 'pref-1',
        tenantId: TENANT_ID,
        userId: USER_ID,
        type: 'execution_failed' as const,
        channel: 'in_app',
        enabled: false,
      };
      db.insert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          onConflictDoUpdate: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([preference]),
          }),
        }),
      });

      await expect(
        service.upsertPreference(TENANT_ID, USER_ID, {
          type: 'execution_failed',
          channel: 'in_app',
          enabled: false,
        }),
      ).resolves.toEqual(preference);
    });
  });

  describe('getById', () => {
    it('应按租户与用户读取通知', async () => {
      db.select.mockReturnValue(createSelectWhereResolved([mockNotification]));

      await expect(
        service.getById(TENANT_ID, USER_ID, NOTIFICATION_ID),
      ).resolves.toEqual(mockNotification);
    });
  });
});
