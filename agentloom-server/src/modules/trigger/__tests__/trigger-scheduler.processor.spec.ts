import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { Job } from 'bullmq';

import { runInTenantTransaction } from '../../../common/interceptors/tenant-transaction.context';
import { DRIZZLE } from '../../../database/database.module';
import { ExecutionService } from '../../execution/execution.service';
import { TriggerHistoryService } from '../trigger-history.service';
import { TriggerSchedulerProcessor } from '../trigger-scheduler.processor';
import { TriggerSchedulerService, type TriggerCronJobData } from '../trigger-scheduler.service';
import { TriggerService } from '../trigger.service';
import {
  SYSTEM_TRIGGER_USER_ID,
  TRIGGER_CRON_JOB,
} from '../trigger.constants';

vi.mock('../../../common/interceptors/tenant-transaction.context', () => ({
  runInTenantTransaction: vi.fn(
    async (
      db: unknown,
      _tenantId: string,
      operation: (tenantDb: unknown) => Promise<unknown>,
    ) => operation(db),
  ),
}));

const TENANT_ID = '019391d4-a000-7000-0000-000000000001';
const WORKFLOW_ID = '019391d4-b000-7000-0000-000000000002';
const TRIGGER_ID = '019391d4-c000-7000-0000-000000000003';
const EXECUTION_ID = '019391d4-d000-7000-0000-000000000004';
const NEXT_FIRE_AT = new Date('2025-01-02T00:00:00.000Z');

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
  createdBy: '019391d4-e000-7000-0000-000000000005',
  createdAt: new Date('2025-01-01T00:00:00.000Z'),
  updatedAt: new Date('2025-01-01T00:00:00.000Z'),
};

const mockExecutionService: Record<string, Mock> = {
  runWorkflow: vi.fn(),
};

const mockTriggerService: Record<string, Mock> = {
  findById: vi.fn(),
  markTriggered: vi.fn(),
};

const mockTriggerHistoryService: Record<string, Mock> = {
  record: vi.fn(),
};

const mockTriggerSchedulerService: Record<string, Mock> = {
  getNextFireAt: vi.fn(),
};

const mockDb = {};

function createMockJob(
  overrides: Partial<Job<TriggerCronJobData>> = {},
): Job<TriggerCronJobData> {
  return {
    name: TRIGGER_CRON_JOB,
    data: {
      triggerId: TRIGGER_ID,
      tenantId: TENANT_ID,
      workflowId: WORKFLOW_ID,
    },
    id: 'job-1',
    attemptsMade: 0,
    opts: {},
    ...overrides,
  } as Job<TriggerCronJobData>;
}

describe('TriggerSchedulerProcessor', () => {
  let processor: TriggerSchedulerProcessor;

  beforeEach(async () => {
    vi.clearAllMocks();

    const module = await Test.createTestingModule({
      providers: [
        TriggerSchedulerProcessor,
        { provide: DRIZZLE, useValue: mockDb },
        { provide: ExecutionService, useValue: mockExecutionService },
        { provide: TriggerService, useValue: mockTriggerService },
        { provide: TriggerHistoryService, useValue: mockTriggerHistoryService },
        {
          provide: TriggerSchedulerService,
          useValue: mockTriggerSchedulerService,
        },
      ],
    }).compile();

    processor = module.get(TriggerSchedulerProcessor);
  });

  it('应在 cron job 到达时触发工作流执行', async () => {
    mockTriggerService.findById.mockResolvedValue(cronTrigger);
    mockExecutionService.runWorkflow.mockResolvedValue({ id: EXECUTION_ID });
    mockTriggerSchedulerService.getNextFireAt.mockResolvedValue(NEXT_FIRE_AT);
    mockTriggerHistoryService.record.mockResolvedValue(undefined);
    mockTriggerService.markTriggered.mockResolvedValue(undefined);

    await expect(processor.process(createMockJob())).resolves.toEqual({
      processed: true,
      executionId: EXECUTION_ID,
    });

    expect(runInTenantTransaction).toHaveBeenCalledWith(
      mockDb,
      TENANT_ID,
      expect.any(Function),
    );
    expect(mockExecutionService.runWorkflow).toHaveBeenCalledWith(
      WORKFLOW_ID,
      {
        launchSource: 'cron-trigger',
        triggerType: 'system',
      },
      TENANT_ID,
      SYSTEM_TRIGGER_USER_ID,
    );
    expect(mockTriggerHistoryService.record).toHaveBeenCalledWith(
      TENANT_ID,
      expect.objectContaining({
        triggerId: TRIGGER_ID,
        status: 'success',
        executionId: EXECUTION_ID,
      }),
    );
    expect(mockTriggerService.markTriggered).toHaveBeenCalledWith(
      TENANT_ID,
      TRIGGER_ID,
      { nextFireAt: NEXT_FIRE_AT },
    );
  });

  it('入队成功后即使 bookkeeping 失败也应返回 processed=true 且不抛错', async () => {
    mockTriggerService.findById.mockResolvedValue(cronTrigger);
    mockExecutionService.runWorkflow.mockResolvedValue({ id: EXECUTION_ID });
    mockTriggerHistoryService.record.mockRejectedValue(new Error('history failed'));

    await expect(processor.process(createMockJob())).resolves.toEqual({
      processed: true,
      executionId: EXECUTION_ID,
    });

    expect(mockTriggerHistoryService.record).toHaveBeenCalledWith(
      TENANT_ID,
      expect.objectContaining({
        triggerId: TRIGGER_ID,
        status: 'success',
        executionId: EXECUTION_ID,
      }),
    );
    expect(mockTriggerService.markTriggered).not.toHaveBeenCalled();
  });

  it('应在触发器禁用时记录 skipped 历史', async () => {
    mockTriggerService.findById.mockResolvedValue({
      ...cronTrigger,
      isEnabled: false,
    });
    mockTriggerHistoryService.record.mockResolvedValue(undefined);

    await expect(processor.process(createMockJob())).resolves.toEqual({
      processed: false,
    });

    expect(mockTriggerHistoryService.record).toHaveBeenCalledWith(
      TENANT_ID,
      expect.objectContaining({
        triggerId: TRIGGER_ID,
        status: 'skipped',
      }),
    );
    expect(mockExecutionService.runWorkflow).not.toHaveBeenCalled();
    expect(mockTriggerService.markTriggered).not.toHaveBeenCalled();
  });

  it('应忽略非 cron 任务名', async () => {
    await expect(
      processor.process(createMockJob({ name: 'other-job' })),
    ).resolves.toEqual({ processed: false });

    expect(runInTenantTransaction).not.toHaveBeenCalled();
  });
});
