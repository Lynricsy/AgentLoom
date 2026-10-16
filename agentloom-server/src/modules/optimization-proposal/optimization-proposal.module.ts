import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';

import { EvidenceModule } from '../evidence/evidence.module';
import { ExecutionModule } from '../execution/execution.module';
import { WorkflowDefinitionModule } from '../workflow-definition/workflow-definition.module';
import { OptimizationAnalysisService } from './optimization-analysis.service';
import { OptimizationEvaluationService } from './optimization-evaluation.service';
import {
  OPTIMIZATION_QUEUE,
  OPTIMIZATION_QUEUE_DEFAULT_JOB_OPTIONS,
} from './optimization-proposal.constants';
import { OptimizationProposalController } from './optimization-proposal.controller';
import { OptimizationProposalScheduler } from './optimization-proposal.scheduler';
import { OptimizationProposalService } from './optimization-proposal.service';
import { OptimizationProposalWorker } from './optimization-proposal.worker';

/**
 * 证据驱动的工作流配置优化：运行证据 → 提案 → 回放评测 → 审批发布 / 回滚。
 *
 * 依赖方向 OptimizationProposalModule → ExecutionModule / WorkflowDefinitionModule / EvidenceModule，
 * 无模块反向依赖本模块。
 */
@Module({
  imports: [
    BullModule.registerQueue({
      name: OPTIMIZATION_QUEUE,
      defaultJobOptions: OPTIMIZATION_QUEUE_DEFAULT_JOB_OPTIONS,
    }),
    ExecutionModule,
    WorkflowDefinitionModule,
    EvidenceModule,
  ],
  controllers: [OptimizationProposalController],
  providers: [
    OptimizationAnalysisService,
    OptimizationProposalService,
    OptimizationEvaluationService,
    OptimizationProposalWorker,
    OptimizationProposalScheduler,
  ],
})
export class OptimizationProposalModule {}
