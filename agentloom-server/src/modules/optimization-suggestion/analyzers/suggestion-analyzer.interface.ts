/* v8 ignore file -- 仅类型声明 */

import type {
  ImpactEstimate,
  SuggestionCurrentValue,
  SuggestionSuggestedValue,
} from '../../../database/schema/optimization-suggestions.schema';
import type { AutonomyMode } from '../../agent/dto/autonomy.dto';

export interface AnalysisPeriod {
  start: Date;
  end: Date;
}

export interface AnalysisContext {
  tenantId: string;
  workflowDefinitionId: string;
  nodeId: string;
  autonomyCap: AutonomyMode;
  nodeConfig: Record<string, unknown>;
  stepTelemetries: StepTelemetryRecord[];
  executionSummaries: ExecutionSummaryRecord[];
  analysisPeriod: AnalysisPeriod;
}

export interface StepTelemetryRecord {
  executionId: string;
  stepId: string;
  telemetryData: {
    tokenUsage?: {
      promptTokens?: number;
      completionTokens?: number;
      totalTokens?: number;
    };
    latencyMs?: number;
    errors?: Array<{ type?: string; message?: string }>;
    toolCalls?: Array<{ toolName: string; success: boolean }>;
    selfRepairs?: Array<{ success: boolean }>;
    [key: string]: unknown;
  };
  createdAt: Date;
}

export interface ExecutionSummaryRecord {
  executionId: string;
  summaryData: {
    status: string;
    totalDurationMs?: number;
    [key: string]: unknown;
  };
  createdAt: Date;
}

export interface SuggestionCandidate {
  suggestionType:
    | 'model_downgrade'
    | 'timeout_adjustment'
    | 'tool_pruning'
    | 'autonomy_upgrade';
  confidence: number;
  currentValue: SuggestionCurrentValue;
  suggestedValue: SuggestionSuggestedValue;
  rationale: string;
  impactEstimate?: ImpactEstimate;
}

export interface SuggestionAnalyzer {
  readonly type: string;
  analyze(context: AnalysisContext): SuggestionCandidate | null;
}
