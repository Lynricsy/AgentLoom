import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';

import { OPTIMIZATION_ANALYSIS_QUEUE } from './optimization-analysis.constants';
import { OptimizationAnalysisService } from './optimization-analysis.service';

export interface OptimizationAnalysisJobData {
  tenantId?: string;
}

@Injectable()
@Processor(OPTIMIZATION_ANALYSIS_QUEUE)
export class OptimizationAnalysisWorker extends WorkerHost {
  private readonly logger = new Logger(OptimizationAnalysisWorker.name);

  constructor(
    private readonly analysisService: OptimizationAnalysisService,
  ) {
    super();
  }

  async process(job: Job<OptimizationAnalysisJobData>): Promise<void> {
    await this.analysisService.runAnalysis(job.data?.tenantId);
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job<OptimizationAnalysisJobData> | undefined): void {
    this.logger.log(
      `Optimization analysis completed: ${JSON.stringify({
        jobId: job?.id ?? null,
        tenantId: job?.data?.tenantId ?? null,
      })}`,
    );
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<OptimizationAnalysisJobData> | undefined, error: Error): void {
    this.logger.error(
      `Optimization analysis failed: ${JSON.stringify({
        jobId: job?.id ?? null,
        tenantId: job?.data?.tenantId ?? null,
        attempt: job?.attemptsMade ?? null,
        error: error.message,
      })}`,
    );
  }
}
