import 'reflect-metadata';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ROLES_KEY } from '../../../common/decorators/roles.decorator';
import { TriggerNotFoundException } from '../trigger.exceptions';
import { TriggerController } from '../trigger.controller';

const TENANT_ID = '019391d4-a000-7000-0000-000000000001';
const USER_ID = '019391d4-b000-7000-0000-000000000002';
const WORKFLOW_ID = '019391d4-c000-7000-0000-000000000003';
const OTHER_WORKFLOW_ID = '019391d4-d000-7000-0000-000000000004';
const TRIGGER_ID = '019391d4-e000-7000-0000-000000000005';
const NEXT_FIRE_AT = new Date('2025-01-02T08:00:00.000Z');

const cronTrigger = {
  id: TRIGGER_ID,
  workflowDefinitionId: WORKFLOW_ID,
  tenantId: TENANT_ID,
  name: '每日执行',
  description: null,
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
  createdAt: new Date('2025-01-01T00:00:00.000Z'),
  updatedAt: new Date('2025-01-01T00:00:00.000Z'),
};

const webhookTrigger = {
  ...cronTrigger,
  type: 'webhook' as const,
  name: 'Webhook Trigger',
  config: {
    token: 'webhook-token',
    secret: 'webhook-secret',
    ipWhitelist: [],
  },
};

describe('TriggerController', () => {
  const triggerService = {
    create: vi.fn(),
    findAll: vi.fn(),
    findById: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    toggle: vi.fn(),
  };
  const triggerHistoryService = {
    findByTrigger: vi.fn(),
  };
  const triggerSchedulerService = {
    registerCronJob: vi.fn(),
    removeCronJob: vi.fn(),
  };

  let controller: TriggerController;

  beforeEach(() => {
    vi.clearAllMocks();
    controller = new TriggerController(
      triggerService as never,
      triggerHistoryService as never,
      triggerSchedulerService as never,
    );
  });

  it('应创建 cron ���发器并注册调度任务', async () => {
    triggerService.create.mockResolvedValue(cronTrigger);
    triggerSchedulerService.registerCronJob.mockResolvedValue(NEXT_FIRE_AT);

    await expect(
      controller.create(
        WORKFLOW_ID,
        {
          name: '每日执行',
          isEnabled: true,
          type: 'cron',
          config: { expression: '0 8 * * *', timezone: 'UTC' },
        },
        TENANT_ID,
        USER_ID,
      ),
    ).resolves.toEqual({
      data: {
        ...cronTrigger,
        nextFireAt: NEXT_FIRE_AT,
      },
    });

    expect(triggerService.create).toHaveBeenCalledWith(
      TENANT_ID,
      USER_ID,
      WORKFLOW_ID,
      expect.any(Object),
    );
    expect(triggerSchedulerService.registerCronJob).toHaveBeenCalledWith(
      cronTrigger,
    );
  });

  it('应返回触发器列表', async () => {
    triggerService.findAll.mockResolvedValue([webhookTrigger]);

    await expect(
      controller.findAll(WORKFLOW_ID, { type: 'webhook' }, TENANT_ID),
    ).resolves.toEqual({
      data: [
        {
          ...webhookTrigger,
          config: {
            token: 'webhook-token',
            ipWhitelist: [],
          },
        },
      ],
    });
  });

  it('应在查询 webhook 详情时隐藏 secret', async () => {
    triggerService.findById.mockResolvedValue(webhookTrigger);

    await expect(
      controller.findById(WORKFLOW_ID, TRIGGER_ID, TENANT_ID),
    ).resolves.toEqual({
      data: {
        ...webhookTrigger,
        config: {
          token: 'webhook-token',
          ipWhitelist: [],
        },
      },
    });
  });

  it('应在更新 cron 触发器后重建调度任务', async () => {
    triggerService.findById.mockResolvedValue(cronTrigger);
    triggerService.update.mockResolvedValue({
      ...cronTrigger,
      config: { expression: '0 9 * * *', timezone: 'UTC' },
    });
    triggerSchedulerService.registerCronJob.mockResolvedValue(NEXT_FIRE_AT);

    await expect(
      controller.update(
        WORKFLOW_ID,
        TRIGGER_ID,
        { config: { expression: '0 9 * * *', timezone: 'UTC' } },
        TENANT_ID,
      ),
    ).resolves.toEqual({
      data: {
        ...cronTrigger,
        config: { expression: '0 9 * * *', timezone: 'UTC' },
        nextFireAt: NEXT_FIRE_AT,
      },
    });

    expect(triggerSchedulerService.removeCronJob).toHaveBeenCalledWith(
      TRIGGER_ID,
    );
    expect(triggerSchedulerService.registerCronJob).toHaveBeenCalledWith({
      ...cronTrigger,
      config: { expression: '0 9 * * *', timezone: 'UTC' },
    });
  });

  it('应删除 cron 触发器并移除调度任务', async () => {
    triggerService.findById.mockResolvedValue(cronTrigger);
    triggerService.remove.mockResolvedValue(undefined);
    triggerSchedulerService.removeCronJob.mockResolvedValue(true);

    await expect(
      controller.remove(WORKFLOW_ID, TRIGGER_ID, TENANT_ID),
    ).resolves.toBeUndefined();

    expect(triggerSchedulerService.removeCronJob).toHaveBeenCalledWith(
      TRIGGER_ID,
    );
  });

  it('应切换 cron 触发器状态并在禁用时移除任务', async () => {
    triggerService.findById.mockResolvedValue(cronTrigger);
    triggerService.toggle.mockResolvedValue({
      ...cronTrigger,
      isEnabled: false,
      nextFireAt: NEXT_FIRE_AT,
    });

    await expect(
      controller.toggle(WORKFLOW_ID, TRIGGER_ID, TENANT_ID),
    ).resolves.toEqual({
      data: {
        ...cronTrigger,
        isEnabled: false,
        nextFireAt: null,
      },
    });

    expect(triggerSchedulerService.removeCronJob).toHaveBeenCalledWith(
      TRIGGER_ID,
    );
    expect(triggerSchedulerService.registerCronJob).not.toHaveBeenCalled();
  });

  it('应返回触发器历史', async () => {
    triggerService.findById.mockResolvedValue(cronTrigger);
    triggerHistoryService.findByTrigger.mockResolvedValue({
      data: [{ id: 'history-1' }],
      meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
    });

    await expect(
      controller.findHistory(
        WORKFLOW_ID,
        TRIGGER_ID,
        { page: 1, pageSize: 20 },
        TENANT_ID,
      ),
    ).resolves.toEqual({
      data: [{ id: 'history-1' }],
      meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
    });
  });

  it('应在触发器不属于当前工作流时抛出不存在异常', async () => {
    triggerService.findById.mockResolvedValue({
      ...cronTrigger,
      workflowDefinitionId: OTHER_WORKFLOW_ID,
    });

    await expect(
      controller.findById(WORKFLOW_ID, TRIGGER_ID, TENANT_ID),
    ).rejects.toThrow(TriggerNotFoundException);
  });

  it('应为读接口声明 Viewer+ 角色，为写接口声明 Creator+ 角色', () => {
    const readMethods = ['findAll', 'findById', 'findHistory'] as const;
    const writeMethods = ['create', 'update', 'remove', 'toggle'] as const;

    for (const methodName of readMethods) {
      const descriptor = Object.getOwnPropertyDescriptor(
        TriggerController.prototype,
        methodName,
      );
      expect(
        Reflect.getMetadata(ROLES_KEY, descriptor?.value as object),
      ).toEqual(['owner', 'admin', 'creator', 'operator', 'viewer']);
    }

    for (const methodName of writeMethods) {
      const descriptor = Object.getOwnPropertyDescriptor(
        TriggerController.prototype,
        methodName,
      );
      expect(
        Reflect.getMetadata(ROLES_KEY, descriptor?.value as object),
      ).toEqual(['owner', 'admin', 'creator']);
    }
  });
});
