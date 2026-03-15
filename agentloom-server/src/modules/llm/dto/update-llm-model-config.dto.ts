import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

import { AUTH_METHODS, LLM_PROVIDERS } from './create-llm-model-config.dto';

const updateLlmModelConfigSchema = z.object({
  name: z
    .string()
    .min(1, '配置名称不能为空')
    .max(100, '配置名称不能超过 100 个字符')
    .optional(),
  provider: z
    .enum(LLM_PROVIDERS, {
      message: '不支持的 LLM 提供商',
    })
    .optional(),
  modelName: z
    .string()
    .min(1, '模型名称不能为空')
    .max(100, '模型名称不能超过 100 个字符')
    .optional(),
  parameters: z.record(z.string(), z.unknown()).optional(),
  apiKeyId: z.string().uuid('API Key ID 格式无效').nullish(),
  isDefault: z.boolean().optional(),
  endpointUrl: z
    .string()
    .url('端点 URL 格式无效')
    .max(2048, '端点 URL 不能超过 2048 个字符')
    .nullish(),
  authMethod: z.enum(AUTH_METHODS).nullish(),
  authConfig: z.record(z.string(), z.unknown()).nullish(),
  timeoutMs: z
    .number()
    .int()
    .min(1000, '超时时间不能小于 1000ms')
    .max(300000, '超时时间不能超过 300000ms')
    .nullish(),
});

export class UpdateLlmModelConfigDto extends createZodDto(
  updateLlmModelConfigSchema,
) {}
