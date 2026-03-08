import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const UpdateKnowledgeBaseSettingsSchema = z.object({
  chunkSize: z
    .number()
    .int()
    .min(64, '分块大小最小 64 tokens')
    .max(8192, '分块大小最大 8192 tokens')
    .optional(),
  chunkOverlap: z
    .number()
    .int()
    .min(0, '分块重叠不能为负数')
    .max(4096, '分块重叠最大 4096 tokens')
    .optional(),
  embeddingModel: z
    .string()
    .min(1, '嵌入模型不能为空')
    .max(255, '嵌入模型名称最长 255 个字符')
    .optional(),
});

export class UpdateKnowledgeBaseSettingsDto extends createZodDto(
  UpdateKnowledgeBaseSettingsSchema,
) {}
