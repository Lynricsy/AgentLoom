import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { and, eq } from 'drizzle-orm';

import { getTenantDb } from '../../common/providers/tenant-aware-db.provider';
import { DRIZZLE, type DrizzleDB } from '../../database/database.module';
import * as schema from '../../database/schema';
import type { WorkflowTrigger } from '../../database/schema/workflow-triggers.schema';
import { CronConfigSchema } from './trigger-dto.compat';
import { TRIGGER_CRON_JOB, TRIGGER_QUEUE } from './trigger.constants';

export type TriggerCronJobData = {
  triggerId: string;
  tenantId: string;
  workflowId: string;
};

@Injectable()
export class TriggerSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(TriggerSchedulerService.name);

  private get tenantDb(): DrizzleDB {
    return getTenantDb(this.db);
  }

  constructor(
    @InjectQueue(TRIGGER_QUEUE)
    private readonly queue: Queue<TriggerCronJobData>,
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.syncOnInit();
  }

  async registerCronJob(trigger: WorkflowTrigger): Promise<Date | null> {
    if (trigger.type !== 'cron') {
      return null;
    }

    const config = CronConfigSchema.parse(trigger.config);

    await this.queue.upsertJobScheduler(
      trigger.id,
      {
        pattern: config.expression,
        tz: config.timezone,
      },
      {
        name: TRIGGER_CRON_JOB,
        data: {
          triggerId: trigger.id,
          tenantId: trigger.tenantId,
          workflowId: trigger.workflowDefinitionId,
        },
      },
    );

    const nextFireAt = await this.getNextFireAt(trigger.id);

    await this.persistNextFireAt(trigger.id, nextFireAt);

    this.logger.log(
      JSON.stringify({
        action: 'trigger_cron_job_registered',
        triggerId: trigger.id,
        tenantId: trigger.tenantId,
        workflowId: trigger.workflowDefinitionId,
        nextFireAt: nextFireAt?.toISOString() ?? null,
      }),
    );

    return nextFireAt;
  }

  async removeCronJob(triggerId: string): Promise<boolean> {
    // Scheduler ID 是稳定主键，因此无需再依赖 BullMQ 可能缺失的 repeatable job id。
    const removed = await this.queue.removeJobScheduler(triggerId);

    await this.persistNextFireAt(triggerId, null);

    this.logger.log(
      JSON.stringify({
        action: 'trigger_cron_job_removed',
        triggerId,
        removed,
      }),
    );

    return removed;
  }

  async getNextFireAt(triggerId: string): Promise<Date | null> {
    const scheduler = await this.queue.getJobScheduler(triggerId);

    // next 由 Job Scheduler 元数据直接给出，避免旧 repeatable 列表中 id 缺失导致误判未注册。
    if (scheduler?.next === undefined) {
      return null;
    }

    return new Date(scheduler.next);
  }

  async syncOnInit(): Promise<void> {
    const triggers = await this.tenantDb
      .select()
      .from(schema.workflowTriggers)
      .where(
        and(
          eq(schema.workflowTriggers.type, 'cron'),
          eq(schema.workflowTriggers.isEnabled, true),
        ),
      );

    for (const trigger of triggers) {
      await this.registerCronJob(trigger);
    }

    this.logger.log(
      JSON.stringify({
        action: 'trigger_cron_jobs_synced',
        count: triggers.length,
      }),
    );
  }

  private async persistNextFireAt(
    triggerId: string,
    nextFireAt: Date | null,
  ): Promise<void> {
    await this.tenantDb
      .update(schema.workflowTriggers)
      .set({ nextFireAt })
      .where(eq(schema.workflowTriggers.id, triggerId));
  }
}
