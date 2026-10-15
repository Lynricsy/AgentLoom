import { Injectable } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';

import { TeamMailboxService } from './team-mailbox.service';
import { type TeamDeadlineJobData, TeamRunService } from './team-run.service';
import {
  TEAM_DEADLINE_JOB_NAME,
  TEAM_RUNTIME_QUEUE,
  TEAM_SWEEP_JOB_NAME,
} from './team.constants';

/**
 * 团队运行时队列：截止时间到达 → deadline_exceeded；周期清扫 → 邮箱重投/唤醒/过期 + 空闲催办。
 */
@Injectable()
@Processor(TEAM_RUNTIME_QUEUE)
export class TeamRuntimeWorker extends WorkerHost {
  constructor(
    private readonly teamRunService: TeamRunService,
    private readonly mailbox: TeamMailboxService,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name === TEAM_DEADLINE_JOB_NAME) {
      await this.teamRunService.handleDeadline(job.data as TeamDeadlineJobData);
      return;
    }
    if (job.name === TEAM_SWEEP_JOB_NAME) {
      await this.mailbox.sweep();
      await this.teamRunService.sweepIdleRuns();
    }
  }
}
