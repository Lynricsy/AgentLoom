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
 * 团队运行时队列：截止时间到达 → 截止处理；周期清扫 → 邮箱重投/唤醒/过期/按游标消费 + 运行结算、截止兜底、
 * 启动重派、空闲催办与终态恢复（步骤推进、成员对话结束）。
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
      await this.teamRunService.sweep();
    }
  }
}
