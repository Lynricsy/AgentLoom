import { Inject, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';

import { runInTenantTransaction } from '../../common/interceptors/tenant-transaction.context';
import { DRIZZLE, type DrizzleDB } from '../../database/database.module';
import { ExecutionService } from '../execution/execution.service';
import { TriggerHistoryService } from './trigger-history.service';
import { TriggerSchedulerService, type TriggerCronJobData } from './trigger-scheduler.service';
import { TriggerService } from './trigger.service';
import {
  SYSTEM_TRIGGER_USER_ID,
  TRIGGER_CRON_JOB,
  TRIGGER_QUEUE,
} from './trigger.constants';
import { TriggerNotFoundException } from './trigger.exceptions';

@Processor(TRIGGER_QUEUE)
export class TriggerSchedulerProcessor extends WorkerHost {
  private readonly logger = new Logger(TriggerSchedulerProcessor.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly executionService: ExecutionService,
    private readonly triggerService: TriggerService,
    private readonly triggerHistoryService: TriggerHistoryService,
    private readonly triggerSchedulerService: TriggerSchedulerService,
  ) {
    super();
  }

  async process(
    job: Job<TriggerCronJobData>,
  ): Promise<{ processed: boolean; executionId?: string }> {
    if (job.name !== TRIGGER_CRON_JOB) {
      return { processed: false };
    }

    const { triggerId, tenantId, workflowId } = job.data;

    return runInTenantTransaction(this.db, tenantId, async () => {
      const trigger = await this.findTriggerSafely(tenantId, triggerId);

      if (
        !trigger ||
        trigger.type !== 'cron' ||
        trigger.workflowDefinitionId !== workflowId
      ) {
        this.logger.warn(
          JSON.stringify({
            action: 'trigger_cron_job_skipped_missing_trigger',
            triggerId,
            tenantId,
            workflowId,
          }),
        );

        return { processed: false };
      }

      if (!trigger.isEnabled) {
        await this.triggerHistoryService.record(tenantId, {
          triggerId,
          status: 'skipped',
          payload: this.buildPayload(job, { reason: 'trigger_disabled' }),
        });

        return { processed: false };
      }

      try {
        const execution = await this.executionService.runWorkflow(
          workflowId,
          undefined,
          tenantId,
          SYSTEM_TRIGGER_USER_ID,
        );

        await this.triggerHistoryService.record(tenantId, {
          triggerId,
          status: 'success',
          executionId: execution.id,
          payload: this.buildPayload(job),
        });

        await this.triggerService.markTriggered(tenantId, triggerId, {
          nextFireAt: await this.triggerSchedulerService.getNextFireAt(triggerId),
        });

        this.logger.log(
          JSON.stringify({
            action: 'trigger_cron_job_processed',
            triggerId,
            tenantId,
            workflowId,
            executionId: execution.id,
          }),
        );

        return {
          processed: true,
          executionId: execution.id,
        };
      } catch (error) {
        await this.triggerHistoryService.record(tenantId, {
          triggerId,
          status: 'failed',
          errorMessage: this.getErrorMessage(error),
          payload: this.buildPayload(job),
        });

        await this.triggerService.markTriggered(tenantId, triggerId, {
          nextFireAt: await this.triggerSchedulerService.getNextFireAt(triggerId),
        });

        this.logger.error(
          JSON.stringify({
            action: 'trigger_cron_job_failed',
            triggerId,
            tenantId,
            workflowId,
            error: this.getErrorMessage(error),
          }),
        );

        throw error;
      }
    });
  }

  private async findTriggerSafely(tenantId: string, triggerId: string) {
    try {
      return await this.triggerService.findById(tenantId, triggerId);
    } catch (error) {
      if (error instanceof TriggerNotFoundException) {
        return null;
      }

      throw error;
    }
  }

  private getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }

    return '未知错误';
  }

  private buildPayload(
    job: Job<TriggerCronJobData>,
    extra: Record<string, unknown> = {},
  ): Record<string, unknown> {
    return {
      source: 'cron',
      jobId: job.id ?? null,
      attemptsMade: job.attemptsMade,
      ...extra,
    };
  }
}
