import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue, type RepeatableJob } from 'bullmq';
import { and, eq } from 'drizzle-orm';

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

type RepeatableQueueCompat = Pick<Queue<TriggerCronJobData>, 'add'> & {
  getRepeatableJobs(
    start?: number,
    end?: number,
    asc?: boolean,
  ): Promise<RepeatableJob[]>;
  removeRepeatableByKey(key: string): Promise<boolean>;
};

@Injectable()
export class TriggerSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(TriggerSchedulerService.name);

  private get repeatableQueue(): RepeatableQueueCompat {
    return this.queue;
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

    await this.queue.add(
      TRIGGER_CRON_JOB,
      {
        triggerId: trigger.id,
        tenantId: trigger.tenantId,
        workflowId: trigger.workflowDefinitionId,
      },
      {
        jobId: trigger.id,
        repeat: {
          pattern: config.expression,
          tz: config.timezone,
        },
      },
    );

    const nextFireAt = await this.getNextFireAt(trigger.id);

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
    const repeatableJob = await this.findRepeatableJob(triggerId);

    if (!repeatableJob) {
      return false;
    }

    const removed = await this.repeatableQueue.removeRepeatableByKey(
      repeatableJob.key,
    );

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
    const repeatableJob = await this.findRepeatableJob(triggerId);

    if (!repeatableJob || repeatableJob.next === undefined) {
      return null;
    }

    return new Date(repeatableJob.next);
  }

  async syncOnInit(): Promise<void> {
    const triggers = await this.db
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

  private async findRepeatableJob(
    triggerId: string,
  ): Promise<RepeatableJob | undefined> {
    const repeatableJobs = await this.repeatableQueue.getRepeatableJobs();

    return repeatableJobs.find(
      (job) => job.name === TRIGGER_CRON_JOB && job.id === triggerId,
    );
  }
}
