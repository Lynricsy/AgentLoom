import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const LLM_PROVIDERS = [
  'openai',
  'anthropic',
  'google',
  'deepseek',
  'custom',
] as const;

export type LlmProvider = (typeof LLM_PROVIDERS)[number];

const createLlmModelConfigSchema = z.object({
  name: z
    .string()
    .min(1, '配置名称不能为空')
    .max(100, '配置名称不能超过 100 个字符'),
  provider: z.enum(LLM_PROVIDERS, {
    message: '不支持的 LLM 提供商',
  }),
  modelName: z
    .string()
    .min(1, '模型名称不能为空')
    .max(100, '模型名称不能超过 100 个字符'),
  parameters: z.record(z.string(), z.unknown()).optional().default({}),
  apiKeyId: z.string().uuid('API Key ID 格式无效').optional(),
  isDefault: z.boolean().optional().default(false),
});

export class CreateLlmModelConfigDto extends createZodDto(
  createLlmModelConfigSchema,
) {}

export { LLM_PROVIDERS };
