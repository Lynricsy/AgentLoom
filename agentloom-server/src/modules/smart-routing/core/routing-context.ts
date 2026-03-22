export interface HistoricalMetrics {
  [modelId: string]: {
    successRate: number;
    avgLatencyMs: number;
    avgTokenUsage: number;
    lastUsedAt?: string;
  };
}

export interface RoutingContext {
  inputTokenCount: number;
  queryText?: string;
  queryEmbedding?: number[];
  taskCategory?: string;
  historicalMetrics?: HistoricalMetrics;
  strategyConfig?: Record<string, unknown>;
  tenantId: string;
}
