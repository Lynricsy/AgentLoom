import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const ChunkSizeSchema = z
  .number()
  .int()
  .min(64, '分块大小最小 64 tokens')
  .max(8192, '分块大小最大 8192 tokens')
  .optional();

const ChunkOverlapSchema = z
  .number()
  .int()
  .min(0, '分块重叠不能为负数')
  .max(4096, '分块重叠最大 4096 tokens')
  .optional();

const EmbeddingModelSchema = z
  .string()
  .min(1, '嵌入模型不能为空')
  .max(255, '嵌入模型名称最长 255 个字符')
  .optional();

export const CreateKnowledgeBaseSchema = z
  .object({
    name: z.string().min(1, '名称不能为空').max(255, '名称最长 255 个字符'),
    description: z.string().max(2000, '描述最长 2000 个字符').optional(),
    visibility: z.enum(['private', 'organization']).default('private'),
    chunkSize: ChunkSizeSchema,
    chunk_size: ChunkSizeSchema,
    chunkOverlap: ChunkOverlapSchema,
    chunk_overlap: ChunkOverlapSchema,
    embeddingModel: EmbeddingModelSchema,
    embedding_model: EmbeddingModelSchema,
    embeddingModelConfigId: z.string().uuid().optional().nullish(),
    embedding_model_config_id: z.string().uuid().optional().nullish(),
  })
  .transform((value) => ({
    name: value.name,
    description: value.description,
    visibility: value.visibility,
    chunkSize: value.chunkSize ?? value.chunk_size,
    chunkOverlap: value.chunkOverlap ?? value.chunk_overlap,
    embeddingModel: value.embeddingModel ?? value.embedding_model,
    embeddingModelConfigId:
      value.embeddingModelConfigId ?? value.embedding_model_config_id,
  }));

export class CreateKnowledgeBaseDto extends createZodDto(
  CreateKnowledgeBaseSchema,
) {}
