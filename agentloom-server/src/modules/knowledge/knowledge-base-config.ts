import { z } from 'zod';

import {
  DEFAULT_CHUNK_MAX_TOKENS,
  DEFAULT_CHUNK_OVERLAP_TOKENS,
  EMBEDDING_MODEL,
} from './knowledge.constants';

export const KNOWLEDGE_CHUNKING_STRATEGY_TYPES = [
  'sentence',
  'sentence_window',
  'markdown',
] as const;
export type KnowledgeChunkingStrategyType =
  (typeof KNOWLEDGE_CHUNKING_STRATEGY_TYPES)[number];

export const KNOWLEDGE_RERANKER_TYPES = ['none', 'cohere'] as const;
export type KnowledgeRerankerType = (typeof KNOWLEDGE_RERANKER_TYPES)[number];

export const KNOWLEDGE_QUERY_ORCHESTRATION_TYPES = ['none', 'hyde'] as const;
export type KnowledgeQueryOrchestrationType =
  (typeof KNOWLEDGE_QUERY_ORCHESTRATION_TYPES)[number];

const ChunkSizeSchema = z
  .number()
  .int()
  .min(64, '分块大小最小 64 tokens')
  .max(8192, '分块大小最大 8192 tokens');

const ChunkOverlapSchema = z
  .number()
  .int()
  .min(0, '分块重叠不能为负数')
  .max(4096, '分块重叠最大 4096 tokens');

const WindowSizeSchema = z
  .number()
  .int()
  .min(1, '句窗大小最小 1')
  .max(12, '句窗大小最大 12');

const RetrievalTopKSchema = z
  .number()
  .int()
  .min(1, '检索 Top K 最小为 1')
  .max(50, '检索 Top K 最大为 50');

const SimilarityThresholdSchema = z
  .number()
  .min(0, '相似度阈值不能小于 0')
  .max(1, '相似度阈值不能大于 1');

const RerankerTopNSchema = z
  .number()
  .int()
  .min(1, '重排 Top N 最小为 1')
  .max(50, '重排 Top N 最大为 50');

const OptionalUuidSchema = z
  .string()
  .uuid()
  .nullish()
  .transform((value) => {
    return value ?? null;
  });

const OptionalNullableStringSchema = z
  .string()
  .trim()
  .max(2048, '字符串长度超出限制')
  .nullish()
  .transform((value) => {
    if (value === null || value === undefined) {
      return null;
    }

    return value.length > 0 ? value : null;
  });

export interface SentenceChunkingStrategy {
  type: 'sentence';
  chunkSize: number;
  chunkOverlap: number;
}

export interface SentenceWindowChunkingStrategy {
  type: 'sentence_window';
  windowSize: number;
}

export interface MarkdownChunkingStrategy {
  type: 'markdown';
}

export type KnowledgeChunkingStrategy =
  | SentenceChunkingStrategy
  | SentenceWindowChunkingStrategy
  | MarkdownChunkingStrategy;

export interface KnowledgeRetrievalStrategy {
  topK: number;
  similarityThreshold: number | null;
}

export interface NoopKnowledgeRerankerStrategy {
  type: 'none';
}

export interface CohereKnowledgeRerankerStrategy {
  type: 'cohere';
  model: string;
  topN: number;
  apiKeyId: string | null;
  baseUrl: string | null;
  timeoutMs: number | null;
}

export type KnowledgeRerankerStrategy =
  | NoopKnowledgeRerankerStrategy
  | CohereKnowledgeRerankerStrategy;

export interface NoopKnowledgeQueryOrchestrationStrategy {
  type: 'none';
}

export interface HydeKnowledgeQueryOrchestrationStrategy {
  type: 'hyde';
  modelConfigId: string | null;
  promptTemplate: string | null;
}

export type KnowledgeQueryOrchestrationStrategy =
  | NoopKnowledgeQueryOrchestrationStrategy
  | HydeKnowledgeQueryOrchestrationStrategy;

export interface KnowledgeBaseStrategyConfig {
  embeddingModel: string;
  embeddingModelConfigId: string | null;
  chunkingStrategy: KnowledgeChunkingStrategy;
  retrievalStrategy: KnowledgeRetrievalStrategy;
  rerankingStrategy: KnowledgeRerankerStrategy;
  queryOrchestration: KnowledgeQueryOrchestrationStrategy;
}

export const SentenceChunkingStrategySchema = z
  .object({
    type: z.literal('sentence'),
    chunkSize: ChunkSizeSchema.optional(),
    chunk_size: ChunkSizeSchema.optional(),
    chunkOverlap: ChunkOverlapSchema.optional(),
    chunk_overlap: ChunkOverlapSchema.optional(),
  })
  .transform((value): SentenceChunkingStrategy => {
    return {
      type: 'sentence',
      chunkSize:
        value.chunkSize ?? value.chunk_size ?? DEFAULT_CHUNK_MAX_TOKENS,
      chunkOverlap:
        value.chunkOverlap ??
        value.chunk_overlap ??
        DEFAULT_CHUNK_OVERLAP_TOKENS,
    };
  });

export const SentenceWindowChunkingStrategySchema = z
  .object({
    type: z.literal('sentence_window'),
    windowSize: WindowSizeSchema.optional(),
    window_size: WindowSizeSchema.optional(),
  })
  .transform((value): SentenceWindowChunkingStrategy => {
    return {
      type: 'sentence_window',
      windowSize: value.windowSize ?? value.window_size ?? 3,
    };
  });

export const MarkdownChunkingStrategySchema = z
  .object({
    type: z.literal('markdown'),
  })
  .transform(
    (): MarkdownChunkingStrategy => ({
      type: 'markdown',
    }),
  );

export const KnowledgeChunkingStrategySchema = z.discriminatedUnion('type', [
  SentenceChunkingStrategySchema,
  SentenceWindowChunkingStrategySchema,
  MarkdownChunkingStrategySchema,
]);

export const KnowledgeRetrievalStrategySchema = z
  .object({
    topK: RetrievalTopKSchema.optional(),
    top_k: RetrievalTopKSchema.optional(),
    similarityThreshold: SimilarityThresholdSchema.nullish(),
    similarity_threshold: SimilarityThresholdSchema.nullish(),
  })
  .transform((value): KnowledgeRetrievalStrategy => {
    return {
      topK: value.topK ?? value.top_k ?? 8,
      similarityThreshold:
        value.similarityThreshold ?? value.similarity_threshold ?? null,
    };
  });

export const NoopKnowledgeRerankerStrategySchema = z
  .object({
    type: z.literal('none'),
  })
  .transform(
    (): NoopKnowledgeRerankerStrategy => ({
      type: 'none',
    }),
  );

export const CohereKnowledgeRerankerStrategySchema = z
  .object({
    type: z.literal('cohere'),
    model: z
      .string()
      .trim()
      .min(1, 'Cohere 重排模型不能为空')
      .max(255, 'Cohere 重排模型名称最长 255 个字符')
      .optional(),
    topN: RerankerTopNSchema.optional(),
    top_n: RerankerTopNSchema.optional(),
    apiKeyId: OptionalUuidSchema.optional(),
    api_key_id: OptionalUuidSchema.optional(),
    baseUrl: OptionalNullableStringSchema.optional(),
    base_url: OptionalNullableStringSchema.optional(),
    timeoutMs: z.number().int().positive().max(120_000).nullish(),
    timeout_ms: z.number().int().positive().max(120_000).nullish(),
  })
  .transform((value): CohereKnowledgeRerankerStrategy => {
    return {
      type: 'cohere',
      model: value.model ?? 'rerank-english-v2.0',
      topN: value.topN ?? value.top_n ?? 5,
      apiKeyId: value.apiKeyId ?? value.api_key_id ?? null,
      baseUrl: value.baseUrl ?? value.base_url ?? null,
      timeoutMs: value.timeoutMs ?? value.timeout_ms ?? null,
    };
  });

export const KnowledgeRerankerStrategySchema = z.discriminatedUnion('type', [
  NoopKnowledgeRerankerStrategySchema,
  CohereKnowledgeRerankerStrategySchema,
]);

export const NoopKnowledgeQueryOrchestrationSchema = z
  .object({
    type: z.literal('none'),
  })
  .transform(
    (): NoopKnowledgeQueryOrchestrationStrategy => ({
      type: 'none',
    }),
  );

export const HydeKnowledgeQueryOrchestrationSchema = z
  .object({
    type: z.literal('hyde'),
    modelConfigId: OptionalUuidSchema.optional(),
    model_config_id: OptionalUuidSchema.optional(),
    promptTemplate: z
      .string()
      .trim()
      .max(10_000, 'HyDE 提示词最长 10000 个字符')
      .nullish(),
    prompt_template: z
      .string()
      .trim()
      .max(10_000, 'HyDE 提示词最长 10000 个字符')
      .nullish(),
  })
  .transform((value): HydeKnowledgeQueryOrchestrationStrategy => {
    return {
      type: 'hyde',
      modelConfigId: value.modelConfigId ?? value.model_config_id ?? null,
      promptTemplate: value.promptTemplate ?? value.prompt_template ?? null,
    };
  });

export const KnowledgeQueryOrchestrationSchema = z.discriminatedUnion('type', [
  NoopKnowledgeQueryOrchestrationSchema,
  HydeKnowledgeQueryOrchestrationSchema,
]);

export function createDefaultChunkingStrategy(): KnowledgeChunkingStrategy {
  return {
    type: 'sentence_window',
    windowSize: 3,
  };
}

export function createDefaultRetrievalStrategy(): KnowledgeRetrievalStrategy {
  return {
    topK: 8,
    similarityThreshold: null,
  };
}

export function createDefaultRerankerStrategy(): KnowledgeRerankerStrategy {
  return {
    type: 'none',
  };
}

export function createDefaultQueryOrchestration(): KnowledgeQueryOrchestrationStrategy {
  return {
    type: 'none',
  };
}

export function createDefaultKnowledgeBaseStrategyConfig(): KnowledgeBaseStrategyConfig {
  return {
    embeddingModel: EMBEDDING_MODEL,
    embeddingModelConfigId: null,
    chunkingStrategy: createDefaultChunkingStrategy(),
    retrievalStrategy: createDefaultRetrievalStrategy(),
    rerankingStrategy: createDefaultRerankerStrategy(),
    queryOrchestration: createDefaultQueryOrchestration(),
  };
}
