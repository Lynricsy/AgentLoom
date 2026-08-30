import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

import {
  KnowledgeChunkingStrategySchema,
  KnowledgeQueryOrchestrationSchema,
  KnowledgeRetrievalStrategySchema,
  KnowledgeRerankerStrategySchema,
} from '../knowledge-base-config';

const EmbeddingModelSchema = z.string().min(1).max(255).optional();

type NormalizedUpdateKnowledgeBaseSettings = {
  embeddingModel?: string;
  embeddingModelConfigId?: string | null;
  chunkingStrategy?: z.output<typeof KnowledgeChunkingStrategySchema>;
  retrievalStrategy?: z.output<typeof KnowledgeRetrievalStrategySchema>;
  rerankingStrategy?: z.output<typeof KnowledgeRerankerStrategySchema>;
  queryOrchestration?: z.output<typeof KnowledgeQueryOrchestrationSchema>;
};

export const UpdateKnowledgeBaseSettingsSchema = z
  .object({
    embeddingModel: EmbeddingModelSchema,
    embedding_model: EmbeddingModelSchema,
    embeddingModelConfigId: z.string().uuid().optional().nullish(),
    embedding_model_config_id: z.string().uuid().optional().nullish(),
    chunkingStrategy: KnowledgeChunkingStrategySchema.optional(),
    chunking_strategy: KnowledgeChunkingStrategySchema.optional(),
    retrievalStrategy: KnowledgeRetrievalStrategySchema.optional(),
    retrieval_strategy: KnowledgeRetrievalStrategySchema.optional(),
    rerankingStrategy: KnowledgeRerankerStrategySchema.optional(),
    reranking_strategy: KnowledgeRerankerStrategySchema.optional(),
    queryOrchestration: KnowledgeQueryOrchestrationSchema.optional(),
    query_orchestration: KnowledgeQueryOrchestrationSchema.optional(),
  })
  .transform((value): NormalizedUpdateKnowledgeBaseSettings => ({
    embeddingModel: value.embeddingModel ?? value.embedding_model,
    embeddingModelConfigId:
      value.embeddingModelConfigId ?? value.embedding_model_config_id,
    chunkingStrategy: value.chunkingStrategy ?? value.chunking_strategy,
    retrievalStrategy: value.retrievalStrategy ?? value.retrieval_strategy,
    rerankingStrategy: value.rerankingStrategy ?? value.reranking_strategy,
    queryOrchestration: value.queryOrchestration ?? value.query_orchestration,
  }));

export class UpdateKnowledgeBaseSettingsDto extends createZodDto(
  UpdateKnowledgeBaseSettingsSchema,
) {}
