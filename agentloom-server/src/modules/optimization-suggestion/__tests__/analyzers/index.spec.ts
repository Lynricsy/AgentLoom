import { describe, expect, it } from 'vitest';

import {
  AutonomyUpgradeAnalyzer,
  ModelDowngradeAnalyzer,
  TimeoutAdjustmentAnalyzer,
  ToolPruningAnalyzer,
} from '../../analyzers';

describe('optimization-suggestion analyzers barrel', () => {
  it('应导出四个 analyzer 类', () => {
    expect(AutonomyUpgradeAnalyzer).toBeDefined();
    expect(ModelDowngradeAnalyzer).toBeDefined();
    expect(TimeoutAdjustmentAnalyzer).toBeDefined();
    expect(ToolPruningAnalyzer).toBeDefined();
  });
});
