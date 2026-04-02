import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const API_PROTOCOL_VALUES = [
  'openai_chat',
  'openai_responses',
  'anthropic',
  'google',
  'cohere',
] as const;

export type ApiProtocol = (typeof API_PROTOCOL_VALUES)[number];

const createLlmProviderSchema = z.object({
  name: z
    .string()
    .min(1, '提供商名称不能为空')
    .max(100, '提供商名称不能超过 100 个字符'),
  slug: z
    .string()
    .min(1, '提供商标识不能为空')
    .max(50, '提供商标识不能超过 50 个字符')
    .regex(/^[a-z0-9-]+$/, '提供商标识只能包含小写字母、数字和连字符')
    .optional(),
  baseUrl: z
    .string()
    .url('基础 URL 格式无效')
    .max(2048, '基础 URL 不能超过 2048 个字符'),
  apiProtocol: z.enum(API_PROTOCOL_VALUES).optional().default('openai_chat'),
  apiKeyId: z.string().uuid('API Key ID 格式无效').optional(),
  apiKey: z
    .string()
    .trim()
    .min(1, 'API Key 不能为空')
    .max(4096, 'API Key 长度不能超过 4096 个字符')
    .optional(),
  iconUrl: z
    .string()
    .url('图标 URL 格式无效')
    .max(2048, '图标 URL 不能超过 2048 个字符')
    .optional(),
  sortOrder: z
    .number()
    .int('排序序号必须为整数')
    .min(0, '排序序号不能为负数')
    .optional()
    .default(0),
  isEnabled: z.boolean().optional().default(true),
});

export class CreateLlmProviderDto extends createZodDto(
  createLlmProviderSchema,
) {}
