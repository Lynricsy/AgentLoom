import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const LLM_PROVIDERS = [
  'openai',
  'anthropic',
  'google',
  'deepseek',
  'custom',
  'private_cloud',
] as const;

export type LlmProvider = (typeof LLM_PROVIDERS)[number];

const AUTH_METHODS = ['api_key', 'mtls', 'none'] as const;

export type AuthMethod = (typeof AUTH_METHODS)[number];

const createLlmModelConfigSchema = z
  .object({
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
    endpointUrl: z
      .string()
      .url('端点 URL 格式无效')
      .max(2048, '端点 URL 不能超过 2048 个字符')
      .optional(),
    authMethod: z.enum(AUTH_METHODS).optional(),
    authConfig: z.record(z.string(), z.unknown()).optional(),
    timeoutMs: z
      .number()
      .int()
      .min(1000, '超时时间不能小于 1000ms')
      .max(300000, '超时时间不能超过 300000ms')
      .optional(),
  })
  .refine(
    (data) => {
      if (data.provider === 'private_cloud') {
        return !!data.endpointUrl;
      }
      return true;
    },
    {
      message: '私有云部署必须提供端点 URL',
      path: ['endpointUrl'],
    },
  )
  .refine(
    (data) => {
      if (data.provider === 'private_cloud' && !data.authMethod) {
        return false;
      }
      return true;
    },
    {
      message: '私有云部署必须指定认证方式',
      path: ['authMethod'],
    },
  );

export class CreateLlmModelConfigDto extends createZodDto(
  createLlmModelConfigSchema,
) {}

export { LLM_PROVIDERS, AUTH_METHODS };
