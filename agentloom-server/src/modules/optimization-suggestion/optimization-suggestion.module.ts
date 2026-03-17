/* v8 ignore file -- Nest 模块装配声明 */

import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { ModelDowngradeAnalyzer } from './analyzers/model-downgrade.analyzer';
import { TimeoutAdjustmentAnalyzer } from './analyzers/timeout-adjustment.analyzer';
import { ToolPruningAnalyzer } from './analyzers/tool-pruning.analyzer';
import { AutonomyUpgradeAnalyzer } from './analyzers/autonomy-upgrade.analyzer';
import { OptimizationAnalysisService } from './optimization-analysis.service';
import { OptimizationAnalysisWorker } from './optimization-analysis.worker';
import {
  OPTIMIZATION_ANALYSIS_QUEUE,
  defaultJobOptions,
} from './optimization-analysis.constants';
import { OptimizationAnalysisScheduler } from './optimization-analysis.scheduler';
import { OptimizationSuggestionService } from './optimization-suggestion.service';
import { OptimizationSuggestionController } from './optimization-suggestion.controller';

@Module({
  imports: [
    BullModule.registerQueue({
      name: OPTIMIZATION_ANALYSIS_QUEUE,
      defaultJobOptions,
    }),
  ],
  controllers: [OptimizationSuggestionController],
  providers: [
    ModelDowngradeAnalyzer,
    TimeoutAdjustmentAnalyzer,
    ToolPruningAnalyzer,
    AutonomyUpgradeAnalyzer,
    OptimizationAnalysisService,
    OptimizationAnalysisWorker,
    OptimizationAnalysisScheduler,
    OptimizationSuggestionService,
  ],
  exports: [OptimizationSuggestionService, OptimizationAnalysisService],
})
export class OptimizationSuggestionModule {}
