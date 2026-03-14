import { Logger } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DRIZZLE } from '../../../database/database.module';
import { TriggerSchedulerService } from '../trigger-scheduler.service';
import { TRIGGER_CRON_JOB, TRIGGER_QUEUE } from '../trigger.constants';

const mocks = vi.hoisted(() => ({
  createMockQueue: () => ({
    add: vi.fn(),
    getRepeatableJobs: vi.fn(),
    removeRepeatableByKey: vi.fn(),
  }),
  createMockDb: () => ({
    select: vi.fn(),
  }),
}));

const TENANT_ID = '019391d4-a000-7000-0000-000000000001';
const WORKFLOW_ID = '019391d4-b000-7000-0000-000000000002';
const TRIGGER_ID = '019391d4-c000-7000-0000-000000000003';
const NEXT_FIRE_AT = new Date('2025-01-01T08:00:00.000Z');

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
  createdBy: '019391d4-d000-7000-0000-000000000004',
  createdAt: new Date('2025-01-01T00:00:00.000Z'),
  updatedAt: new Date('2025-01-01T00:00:00.000Z'),
};

function createSelectWhereResolved(result: unknown) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(result),
    }),
  };
}

describe('TriggerSchedulerService', () => {
  let service: TriggerSchedulerService;
  let queue: ReturnType<typeof mocks.createMockQueue>;
  let db: ReturnType<typeof mocks.createMockDb>;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);

    queue = mocks.createMockQueue();
    db = mocks.createMockDb();

    const module = await Test.createTestingModule({
      providers: [
        TriggerSchedulerService,
        { provide: getQueueToken(TRIGGER_QUEUE), useValue: queue },
        { provide: DRIZZLE, useValue: db },
      ],
    }).compile();

    service = module.get(TriggerSchedulerService);
  });

  it('应注册 cron repeatable job', async () => {
    queue.add.mockResolvedValue({});
    queue.getRepeatableJobs.mockResolvedValue([
      {
        key: 'repeat-key',
        name: TRIGGER_CRON_JOB,
        id: TRIGGER_ID,
        endDate: null,
        tz: 'UTC',
        pattern: '0 8 * * *',
        next: NEXT_FIRE_AT.getTime(),
      },
    ]);

    await expect(service.registerCronJob(cronTrigger)).resolves.toEqual(NEXT_FIRE_AT);

    expect(queue.add).toHaveBeenCalledWith(
      TRIGGER_CRON_JOB,
      {
        triggerId: TRIGGER_ID,
        tenantId: TENANT_ID,
        workflowId: WORKFLOW_ID,
      },
      {
        jobId: TRIGGER_ID,
        repeat: {
          pattern: '0 8 * * *',
          tz: 'UTC',
        },
      },
    );
  });

  it('应按 repeatable key 删除 cron job', async () => {
    queue.getRepeatableJobs.mockResolvedValue([
      {
        key: 'repeat-key',
        name: TRIGGER_CRON_JOB,
        id: TRIGGER_ID,
        endDate: null,
        tz: 'UTC',
        pattern: '0 8 * * *',
      },
    ]);
    queue.removeRepeatableByKey.mockResolvedValue(true);

    await expect(service.removeCronJob(TRIGGER_ID)).resolves.toBe(true);
    expect(queue.removeRepeatableByKey).toHaveBeenCalledWith('repeat-key');
  });

  it('应在模块初始化时同步全部启用的 cron 触发器', async () => {
    db.select.mockReturnValue(createSelectWhereResolved([cronTrigger]));
    const registerSpy = vi
      .spyOn(service, 'registerCronJob')
      .mockResolvedValue(NEXT_FIRE_AT);

    await service.syncOnInit();

    expect(registerSpy).toHaveBeenCalledWith(cronTrigger);
  });
});
