import { z } from 'zod';

export const ROUTING_STRATEGIES = [
  'TOKEN_OPTIMIZED',
  'COST_OPTIMIZED',
  'QUALITY_FIRST',
  'LATENCY_FIRST',
  'HISTORICAL_BEST',
  'FALLBACK_CHAIN',
] as const;

export type RoutingStrategy = (typeof ROUTING_STRATEGIES)[number];

export const RoutingContextSchema = z.object({
  inputTokenCount: z.number().int().min(0),
  tokenThreshold: z.number().int().positive().optional(),
  outputSchemaComplexity: z.number().int().min(0).optional(),
  taskType: z.string().max(50).optional(),
  historicalMetrics: z
    .record(
      z.string(),
      z.object({
        successRate: z.number().min(0).max(1),
        avgLatencyMs: z.number().min(0),
        avgTokenUsage: z.number().min(0),
        lastUsedAt: z.string().datetime().optional(),
      }),
    )
    .optional(),
});

export type RoutingContext = z.infer<typeof RoutingContextSchema>;

export interface RoutingDecisionResult {
  selectedModelId: string;
  strategy: RoutingStrategy;
  reasoning: string;
  evaluatedModels: ModelEvaluationResult[];
  latencyMs: number;
}

export interface ModelEvaluationResult {
  modelId: string;
  modelName: string;
  provider: string;
  score: number;
  reasoning: string;
}
