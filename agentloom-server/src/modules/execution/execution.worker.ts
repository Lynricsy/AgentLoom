import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { DRIZZLE, type DrizzleDB } from '../../database/database.module';
import { runInTenantTransaction } from '../../common/interceptors/tenant-transaction.context';
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
      `Processing execution: ${JSON.stringify({ executionId, jobId: job.id })}`,
    );

    await runInTenantTransaction(this.db, tenantId, async () => {
      await this.executionService.initializeSteps(executionId);
      await this.nodeScheduler.startExecution(executionId, tenantId);
    });
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
