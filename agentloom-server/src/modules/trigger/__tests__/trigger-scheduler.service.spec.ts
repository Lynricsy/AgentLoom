import { Logger } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DRIZZLE } from '../../../database/database.module';
import { TriggerSchedulerService } from '../trigger-scheduler.service';
import { TRIGGER_CRON_JOB, TRIGGER_QUEUE } from '../trigger.constants';

const mocks = vi.hoisted(() => ({
  createMockQueue: () => ({
    upsertJobScheduler: vi.fn(),
    getJobScheduler: vi.fn(),
    removeJobScheduler: vi.fn(),
  }),
  createMockDb: () => ({
    select: vi.fn(),
    update: vi.fn(),
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

function createUpdateWhereResolved(result: unknown) {
  return {
    set: vi.fn().mockReturnValue({
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
    db.update.mockReset();

    const module = await Test.createTestingModule({
      providers: [
        TriggerSchedulerService,
        { provide: getQueueToken(TRIGGER_QUEUE), useValue: queue },
        { provide: DRIZZLE, useValue: db },
      ],
    }).compile();

    service = module.get(TriggerSchedulerService);
  });

  it('应注册 Job Scheduler 并持久化真实下次触发时间', async () => {
    queue.upsertJobScheduler.mockResolvedValue({});
    queue.getJobScheduler.mockResolvedValue({
      key: TRIGGER_ID,
      name: TRIGGER_CRON_JOB,
      pattern: '0 8 * * *',
      tz: 'UTC',
      next: NEXT_FIRE_AT.getTime(),
    });
    db.update.mockReturnValueOnce(createUpdateWhereResolved(undefined));

    const nextFireAt = await service.registerCronJob(cronTrigger);

    expect(nextFireAt).toBeInstanceOf(Date);
    expect(nextFireAt).toEqual(NEXT_FIRE_AT);
    expect(queue.upsertJobScheduler).toHaveBeenCalledWith(
      TRIGGER_ID,
      {
        pattern: '0 8 * * *',
        tz: 'UTC',
      },
      {
        name: TRIGGER_CRON_JOB,
        data: {
          triggerId: TRIGGER_ID,
          tenantId: TENANT_ID,
          workflowId: WORKFLOW_ID,
        },
      },
    );
    expect(queue.getJobScheduler).toHaveBeenCalledWith(TRIGGER_ID);

    const updateValues = db.update.mock.results[0].value.set.mock.calls[0][0];
    expect(updateValues).toEqual({ nextFireAt: NEXT_FIRE_AT });
  });

  it('应按 trigger id 删除 Job Scheduler', async () => {
    queue.removeJobScheduler.mockResolvedValue(true);
    db.update.mockReturnValueOnce(createUpdateWhereResolved(undefined));

    await expect(service.removeCronJob(TRIGGER_ID)).resolves.toBe(true);
    expect(queue.removeJobScheduler).toHaveBeenCalledWith(TRIGGER_ID);

    const updateValues = db.update.mock.results[0].value.set.mock.calls[0][0];
    expect(updateValues).toEqual({ nextFireAt: null });
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
