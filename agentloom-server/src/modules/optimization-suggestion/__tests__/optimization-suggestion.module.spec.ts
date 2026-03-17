import { MODULE_METADATA } from '@nestjs/common/constants';
import { describe, expect, it } from 'vitest';

import { OptimizationAnalysisScheduler } from '../optimization-analysis.scheduler';
import { OptimizationAnalysisService } from '../optimization-analysis.service';
import { OptimizationAnalysisWorker } from '../optimization-analysis.worker';
import { OptimizationSuggestionController } from '../optimization-suggestion.controller';
import { OptimizationSuggestionModule } from '../optimization-suggestion.module';
import { OptimizationSuggestionService } from '../optimization-suggestion.service';

describe('OptimizationSuggestionModule', () => {
  it('应声明控制器与核心 providers', () => {
    const controllers = Reflect.getMetadata(
      MODULE_METADATA.CONTROLLERS,
      OptimizationSuggestionModule,
    ) as unknown[];
    const providers = Reflect.getMetadata(
      MODULE_METADATA.PROVIDERS,
      OptimizationSuggestionModule,
    ) as unknown[];

    expect(controllers).toContain(OptimizationSuggestionController);
    expect(providers).toContain(OptimizationSuggestionService);
    expect(providers).toContain(OptimizationAnalysisService);
    expect(providers).toContain(OptimizationAnalysisWorker);
    expect(providers).toContain(OptimizationAnalysisScheduler);
  });
});
