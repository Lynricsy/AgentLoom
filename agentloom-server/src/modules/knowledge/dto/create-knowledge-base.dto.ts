import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

import {
  KnowledgeChunkingStrategySchema,
  KnowledgeQueryOrchestrationSchema,
  KnowledgeRetrievalStrategySchema,
  KnowledgeRerankerStrategySchema,
} from '../knowledge-base-config';

const EmbeddingModelSchema = z.string().min(1).max(255).optional();

export const CreateKnowledgeBaseSchema = z
  .object({
    name: z.string().min(1, '名称不能为空').max(255, '名称最长 255 个字符'),
    description: z.string().max(2000, '描述最长 2000 个字符').optional(),
    visibility: z.enum(['private', 'organization']).default('private'),
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
  .transform((value) => ({
    name: value.name,
    description: value.description,
    visibility: value.visibility,
    embeddingModel: value.embeddingModel ?? value.embedding_model,
    embeddingModelConfigId:
      value.embeddingModelConfigId ?? value.embedding_model_config_id,
    chunkingStrategy: value.chunkingStrategy ?? value.chunking_strategy,
    retrievalStrategy: value.retrievalStrategy ?? value.retrieval_strategy,
    rerankingStrategy: value.rerankingStrategy ?? value.reranking_strategy,
    queryOrchestration: value.queryOrchestration ?? value.query_orchestration,
  }));

export class CreateKnowledgeBaseDto extends createZodDto(
  CreateKnowledgeBaseSchema,
) {}
