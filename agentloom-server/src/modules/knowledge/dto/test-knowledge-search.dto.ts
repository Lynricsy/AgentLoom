import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const TestKnowledgeSearchSchema = z
  .object({
    query: z
      .string()
      .trim()
      .min(1, '测试检索查询不能为空')
      .max(4000, '测试检索查询最长 4000 个字符'),
    topK: z.number().int().min(1).max(20).optional(),
    top_k: z.number().int().min(1).max(20).optional(),
  })
  .transform((value) => ({
    query: value.query,
    topK: value.topK ?? value.top_k,
  }));

export class TestKnowledgeSearchDto extends createZodDto(
  TestKnowledgeSearchSchema,
) {}
