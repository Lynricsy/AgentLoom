import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { DRIZZLE, type DrizzleDB } from '../../database/database.module';
import { ExecutionService, type ExecutionJobData } from './execution.service';
import { NodeSchedulerService } from './node-scheduler.service';
import { EXECUTION_QUEUE } from './execution.constants';

@Processor(EXECUTION_QUEUE)
export class ExecutionWorker extends WorkerHost {
  private readonly logger = new Logger(ExecutionWorker.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly executionService: ExecutionService,
    private readonly nodeScheduler: NodeSchedulerService,
  ) {
    super();
  }

  async process(job: Job<ExecutionJobData>): Promise<void> {
    const { executionId, tenantId } = job.data;
    this.logger.log(
      `Processing execution: ${JSON.stringify({ executionId, jobId: job.id, jobName: job.name })}`,
    );

    if (job.name === 'resume-execution') {
      await this.nodeScheduler.resumeScheduling(executionId, tenantId);
      return;
    }

    // initializeSteps 自己会在短事务里创建 step 并把 execution 标记为 running。
    // 后续 DAG 调度包含外部 I/O（Agent prompt、sandbox、memory 等），
    // 不能再包在同一个长事务里，否则管理端会一直读到 pending / 0 steps。
    await this.executionService.initializeSteps(executionId);
    await this.nodeScheduler.startExecution(executionId, tenantId);
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job<ExecutionJobData>, error: Error): Promise<void> {
    const { executionId } = job.data;
    this.logger.error(
      `Execution job failed: ${JSON.stringify({ executionId, jobId: job.id, error: error.message })}`,
    );

    await this.executionService.markFailed(executionId, error);
  }
}
