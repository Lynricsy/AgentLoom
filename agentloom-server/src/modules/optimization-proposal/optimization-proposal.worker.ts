import { Injectable } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';

import { OptimizationAnalysisService } from './optimization-analysis.service';
import { OptimizationEvaluationService } from './optimization-evaluation.service';
import {
  OPTIMIZATION_ANALYZE_JOB_NAME,
  OPTIMIZATION_EVALUATE_JOB_NAME,
  OPTIMIZATION_QUEUE,
  OPTIMIZATION_SWEEP_JOB_NAME,
} from './optimization-proposal.constants';
import type { OptimizationEvaluateJobData } from './optimization-proposal.types';

/** 优化提案队列：每周分析 → 新建提案；评测启动；评测清扫（超时 + 补偿结算 + 启动恢复） */
@Injectable()
@Processor(OPTIMIZATION_QUEUE)
export class OptimizationProposalWorker extends WorkerHost {
  constructor(
    private readonly analysisService: OptimizationAnalysisService,
    private readonly evaluationService: OptimizationEvaluationService,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    switch (job.name) {
      case OPTIMIZATION_ANALYZE_JOB_NAME:
        await this.analysisService.analyzeAllTenants();
        return;
      case OPTIMIZATION_EVALUATE_JOB_NAME:
        await this.evaluationService.run(
          job.data as OptimizationEvaluateJobData,
        );
        return;
      case OPTIMIZATION_SWEEP_JOB_NAME:
        await this.evaluationService.sweep();
        return;
    }
  }
}
