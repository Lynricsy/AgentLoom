import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const LLM_PROVIDERS = [
  'openai',
  'anthropic',
  'google',
  'azure-openai',
  'cohere',
  'mistral',
  'deepseek',
  'groq',
] as const;

const createApiKeySchema = z.object({
  provider: z.enum(LLM_PROVIDERS, {
    message: '无效的 LLM 提供商',
  }),
  label: z
    .string()
    .min(1, '标签不能为空')
    .max(255, '标签长度不能超过 255 个字符'),
  apiKey: z.string().min(1, 'API 密钥不能为空'),
});

export class CreateApiKeyDto extends createZodDto(createApiKeySchema) {}
