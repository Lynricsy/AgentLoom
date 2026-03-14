import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DRIZZLE } from '../../../database/database.module';
import {
  TriggerLimitExceededException,
  TriggerNotFoundException,
  TriggerTypePreviewOnlyException,
  WorkflowNotPublishedException,
} from '../trigger.exceptions';
import { TriggerService } from '../trigger.service';

const mocks = vi.hoisted(() => ({
  getTenantDb: vi.fn(),
  randomBytes: vi.fn(),
  createMockDb: () => ({
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  }),
}));

vi.mock('../../../common/providers/tenant-aware-db.provider', () => ({
  getTenantDb: mocks.getTenantDb,
}));

vi.mock('node:crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:crypto')>();
  return {
    ...actual,
    randomBytes: mocks.randomBytes,
  };
});

const TENANT_ID = '019391d4-a000-7000-0000-000000000001';
const USER_ID = '019391d4-b000-7000-0000-000000000002';
const WORKFLOW_ID = '019391d4-c000-7000-0000-000000000003';
const TRIGGER_ID = '019391d4-d000-7000-0000-000000000004';
const NOW = new Date('2025-01-01T00:00:00.000Z');

const baseTrigger = {
  id: TRIGGER_ID,
  workflowDefinitionId: WORKFLOW_ID,
  tenantId: TENANT_ID,
  name: '每日执行',
  description: '定时触发',
  type: 'cron' as const,
  config: {
    expression: '0 8 * * *',
    timezone: 'UTC',
  },
  isEnabled: true,
  lastTriggeredAt: null,
  nextFireAt: null,
  triggerCount: 0,
  createdBy: USER_ID,
  createdAt: NOW,
  updatedAt: NOW,
};

const publishedWorkflow = {
  id: WORKFLOW_ID,
  tenantId: TENANT_ID,
  status: 'published' as const,
};

const apiEventTrigger = {
  ...baseTrigger,
  type: 'api_event' as const,
  config: {
    eventSource: 'github',
    eventType: 'pull_request',
    filterExpression: 'payload.action == "opened"',
  },
};

function createSelectWhereResolved(result: unknown) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(result),
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

function createInsertReturning(result: unknown) {
  const returning = vi.fn().mockResolvedValue(result);
  const values = vi.fn().mockReturnValue({ returning });

  return {
    chain: { values },
    values,
    returning,
  };
}

function createUpdateReturning(result: unknown) {
  const returning = vi.fn().mockResolvedValue(result);
  const where = vi.fn().mockReturnValue({ returning });
  const set = vi.fn().mockReturnValue({ where });

  return {
    chain: { set },
    set,
    where,
    returning,
  };
}

function createDeleteReturning(result: unknown) {
  const returning = vi.fn().mockResolvedValue(result);
  const where = vi.fn().mockReturnValue({ returning });

  return {
    chain: { where },
    where,
    returning,
  };
}

describe('TriggerService', () => {
  let service: TriggerService;
  let db: ReturnType<typeof mocks.createMockDb>;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);

    db = mocks.createMockDb();
    mocks.getTenantDb.mockReturnValue(db);

    const module = await Test.createTestingModule({
      providers: [
        TriggerService,
        { provide: DRIZZLE, useValue: db },
      ],
    }).compile();

    service = module.get(TriggerService);
  });

  describe('findAll', () => {
    it('应按工作流查询并按创建时间倒序返回', async () => {
      db.select.mockReturnValue(createSelectOrdered([baseTrigger]));

      await expect(
        service.findAll(TENANT_ID, WORKFLOW_ID, { type: 'cron' }),
      ).resolves.toEqual([baseTrigger]);
    });
  });

  describe('findById', () => {
    it('应返回指定触发器', async () => {
      db.select.mockReturnValue(createSelectWhereResolved([baseTrigger]));

      await expect(service.findById(TENANT_ID, TRIGGER_ID)).resolves.toEqual(
        baseTrigger,
      );
    });

    it('触发器不存在时应抛出异常', async () => {
      db.select.mockReturnValue(createSelectWhereResolved([]));

      await expect(service.findById(TENANT_ID, TRIGGER_ID)).rejects.toThrow(
        TriggerNotFoundException,
      );
    });
  });

  describe('create', () => {
    it('应创建 webhook 触发器并生成 token 与 secret', async () => {
      db.select
        .mockReturnValueOnce(createSelectWhereResolved([publishedWorkflow]))
        .mockReturnValueOnce(createSelectWhereResolved([{ count: 0 }]));

      const insertChain = createInsertReturning([
        {
          ...baseTrigger,
          type: 'webhook' as const,
          config: {
            token: 'generated-token',
            secret: 'generated-secret',
            ipWhitelist: ['127.0.0.1'],
          },
        },
      ]);
      db.insert.mockReturnValue(insertChain.chain);

      mocks.randomBytes
        .mockReturnValueOnce(Buffer.alloc(32, 1))
        .mockReturnValueOnce(Buffer.alloc(48, 2));

      const result = await service.create(TENANT_ID, USER_ID, WORKFLOW_ID, {
        name: 'Webhook 触发器',
        description: '接收回调',
        isEnabled: true,
        type: 'webhook',
        config: { ipWhitelist: ['127.0.0.1'] },
      });

      expect(result.type).toBe('webhook');
      expect(insertChain.values).toHaveBeenCalledWith(
        expect.objectContaining({
          workflowDefinitionId: WORKFLOW_ID,
          tenantId: TENANT_ID,
          createdBy: USER_ID,
          config: {
            token: Buffer.alloc(32, 1).toString('hex'),
            secret: Buffer.alloc(48, 2).toString('hex'),
            ipWhitelist: ['127.0.0.1'],
          },
        }),
      );
    });

    it('工作流未发布时应抛出异常', async () => {
      db.select.mockReturnValue(createSelectWhereResolved([]));

      await expect(
        service.create(TENANT_ID, USER_ID, WORKFLOW_ID, {
          name: 'Webhook 触发器',
          isEnabled: true,
          type: 'webhook',
          config: { ipWhitelist: [] },
        }),
      ).rejects.toThrow(WorkflowNotPublishedException);
    });

    it('触发器数量超限时应抛出异常', async () => {
      db.select
        .mockReturnValueOnce(createSelectWhereResolved([publishedWorkflow]))
        .mockReturnValueOnce(createSelectWhereResolved([{ count: 10 }]));

      await expect(
        service.create(TENANT_ID, USER_ID, WORKFLOW_ID, {
          name: '超限触发器',
          isEnabled: true,
          type: 'cron',
          config: { expression: '0 8 * * *', timezone: 'UTC' },
        }),
      ).rejects.toThrow(TriggerLimitExceededException);
    });

    it('api_event 仅预览时应拒绝创建', async () => {
      await expect(
        service.create(TENANT_ID, USER_ID, WORKFLOW_ID, {
          name: 'API Event 预览',
          isEnabled: true,
          type: 'api_event',
          config: {
            eventSource: 'github',
            eventType: 'pull_request',
          },
        }),
      ).rejects.toThrow(TriggerTypePreviewOnlyException);

      expect(db.select).not.toHaveBeenCalled();
      expect(db.insert).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('更新 webhook 配置时应保留已有 token 与 secret', async () => {
      const webhookTrigger = {
        ...baseTrigger,
        type: 'webhook' as const,
        config: {
          token: 'persisted-token',
          secret: 'persisted-secret',
          ipWhitelist: ['10.0.0.1'],
        },
      };

      db.select.mockReturnValue(createSelectWhereResolved([webhookTrigger]));
      const updateChain = createUpdateReturning([
        {
          ...webhookTrigger,
          config: {
            token: 'persisted-token',
            secret: 'persisted-secret',
            ipWhitelist: ['10.0.0.2'],
          },
        },
      ]);
      db.update.mockReturnValue(updateChain.chain);

      const result = await service.update(TENANT_ID, TRIGGER_ID, {
        config: { ipWhitelist: ['10.0.0.2'] },
      });

      expect(result.config).toEqual({
        token: 'persisted-token',
        secret: 'persisted-secret',
        ipWhitelist: ['10.0.0.2'],
      });
      expect(updateChain.set).toHaveBeenCalledWith(
        expect.objectContaining({
          config: {
            token: 'persisted-token',
            secret: 'persisted-secret',
            ipWhitelist: ['10.0.0.2'],
          },
        }),
      );
    });

    it('api_event 仅预览时应拒绝更新', async () => {
      db.select.mockReturnValue(createSelectWhereResolved([apiEventTrigger]));

      await expect(
        service.update(TENANT_ID, TRIGGER_ID, {
          name: 'Updated preview name',
        }),
      ).rejects.toThrow(TriggerTypePreviewOnlyException);

      expect(db.update).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('应删除触发器', async () => {
      db.delete.mockReturnValue(createDeleteReturning([{ id: TRIGGER_ID }]).chain);

      await expect(service.remove(TENANT_ID, TRIGGER_ID)).resolves.toBeUndefined();
    });

    it('删除不存在的触发器时应抛出异常', async () => {
      db.delete.mockReturnValue(createDeleteReturning([]).chain);

      await expect(service.remove(TENANT_ID, TRIGGER_ID)).rejects.toThrow(
        TriggerNotFoundException,
      );
    });
  });

  describe('toggle', () => {
    it('应切换启用状态', async () => {
      db.select.mockReturnValue(createSelectWhereResolved([baseTrigger]));
      db.update.mockReturnValue(
        createUpdateReturning([{ ...baseTrigger, isEnabled: false }]).chain,
      );

      await expect(service.toggle(TENANT_ID, TRIGGER_ID)).resolves.toEqual({
        ...baseTrigger,
        isEnabled: false,
      });
    });

    it('api_event 仅预览时应拒绝切换启用状态', async () => {
      db.select.mockReturnValue(createSelectWhereResolved([apiEventTrigger]));

      await expect(service.toggle(TENANT_ID, TRIGGER_ID)).rejects.toThrow(
        TriggerTypePreviewOnlyException,
      );

      expect(db.update).not.toHaveBeenCalled();
    });
  });

  describe('markTriggered', () => {
    it('应更新最近触发时间与次数', async () => {
      const nextFireAt = new Date('2025-01-02T00:00:00.000Z');
      const updateChain = createUpdateReturning([
        {
          ...baseTrigger,
          lastTriggeredAt: NOW,
          nextFireAt,
          triggerCount: 1,
        },
      ]);
      db.update.mockReturnValue(updateChain.chain);

      await expect(
        service.markTriggered(TENANT_ID, TRIGGER_ID, { nextFireAt }),
      ).resolves.toEqual({
        ...baseTrigger,
        lastTriggeredAt: NOW,
        nextFireAt,
        triggerCount: 1,
      });

      expect(updateChain.set).toHaveBeenCalledWith(
        expect.objectContaining({
          lastTriggeredAt: NOW,
          nextFireAt,
        }),
      );
    });
  });
});
