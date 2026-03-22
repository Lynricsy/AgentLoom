import type { RoutingBenchmarkMlpWeights } from '../../../database/schema/routing-benchmarks.schema';

export const ROUTING_LEARNING_QUEUE = 'routing-learning';
export const ROUTING_LEARNING_JOB_NAME = 'routing-learning';
export const ROUTING_MEMORY_COLLECTION = 'routing_memory';

export interface RoutingLearningJob {
  tenantId: string;
  executionStepId: string;
  routingDecisionId: string;
  selectedModelId: string;
  queryText: string;
  taskCategory?: string;
  actualPerformance: {
    success: boolean;
    latencyMs: number;
    tokenCount: number;
    qualityScore?: number;
    errorType?: string;
  };
}

export interface RoutingLearningConfig {
  mlpEnabled: boolean;
  eloKFactor: number;
  occMaxRetries: number;
  miniBatchSize: number;
  mlpHiddenSize: number;
  mlpBaseLearningRate: number;
}

export const DEFAULT_ROUTING_LEARNING_CONFIG: RoutingLearningConfig = {
  mlpEnabled: true,
  eloKFactor: 32,
  occMaxRetries: 3,
  miniBatchSize: 16,
  mlpHiddenSize: 32,
  mlpBaseLearningRate: 0.05,
};

export const ROUTING_LEARNING_CONFIG_TOKEN = 'ROUTING_LEARNING_CONFIG';

export const ROUTING_LEARNING_QUEUE_DEFAULT_JOB_OPTIONS = {
  attempts: 3,
  backoff: {
    type: 'exponential' as const,
    delay: 2_000,
  },
  removeOnComplete: 100,
  removeOnFail: 500,
};

export interface RoutingMlpTrainingSample {
  tenantId: string;
  taskCategory: string;
  selectedModelId: string;
  candidateModelIds: string[];
  queryEmbedding: number[];
  performanceScore: number;
}

export interface RoutingMlpTrainingResult {
  batchProcessed: boolean;
  learningRate?: number;
  sampleCount?: number;
  weights?: RoutingBenchmarkMlpWeights;
}
