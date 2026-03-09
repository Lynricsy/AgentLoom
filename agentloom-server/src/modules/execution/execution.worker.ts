import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { ExecutionService, type ExecutionJobData } from './execution.service';
import { EXECUTION_QUEUE } from './execution.constants';

@Processor(EXECUTION_QUEUE)
export class ExecutionWorker extends WorkerHost {
  private readonly logger = new Logger(ExecutionWorker.name);

  constructor(private readonly executionService: ExecutionService) {
    super();
  }

  async process(job: Job<ExecutionJobData>): Promise<void> {
    const { executionId } = job.data;
    this.logger.log(
      `Processing execution: ${JSON.stringify({ executionId, jobId: job.id })}`,
    );

    await this.executionService.initializeSteps(executionId);
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
