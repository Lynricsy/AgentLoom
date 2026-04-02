import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const LLM_MODEL_TYPES = ['chat', 'embedding'] as const;

export type LlmModelType = (typeof LLM_MODEL_TYPES)[number];

const pricingTierSchema = z.object({
  aboveTokens: z.number(),
  inputPer1MTokens: z.number(),
  outputPer1MTokens: z.number(),
  cachedReadPer1MTokens: z.number().optional(),
  cachedWritePer1MTokens: z.number().optional(),
});

const pricingSchema = z.object({
  inputPer1MTokens: z.number(),
  outputPer1MTokens: z.number(),
  cachedReadPer1MTokens: z.number().optional(),
  cachedWritePer1MTokens: z.number().optional(),
  tiers: z.array(pricingTierSchema).optional(),
});

const capabilitiesSchema = z.object({
  vision: z.boolean().optional(),
  functionCalling: z.boolean().optional(),
  reasoning: z.boolean().optional(),
  structuredOutput: z.boolean().optional(),
});

const createLlmModelConfigSchema = z.object({
  name: z
    .string()
    .min(1, '配置名称不能为空')
    .max(100, '配置名称不能超过 100 个字符'),
  providerId: z.string().uuid('提供商 ID 格式无效'),
  modelId: z
    .string()
    .min(1, '模型 ID 不能为空')
    .max(100, '模型 ID 不能超过 100 个字符'),
  parameters: z.record(z.string(), z.unknown()).optional().default({}),
  isDefault: z.boolean().optional().default(false),
  isEnabled: z.boolean().optional().default(true),
  modelType: z.enum(LLM_MODEL_TYPES).optional().default('chat'),
  capabilities: capabilitiesSchema.optional().default({}),
  contextWindow: z.number().int().positive().nullish(),
  maxOutputTokens: z.number().int().positive().nullish(),
  pricing: pricingSchema.nullish(),
  timeoutMs: z
    .number()
    .int()
    .min(5_000, '超时时间不能小于 5000ms')
    .max(600_000, '超时时间不能超过 600000ms')
    .optional(),
  embeddingDimensions: z
    .number()
    .int('Embedding 维度必须为整数')
    .min(1, 'Embedding 维度必须大于 0')
    .optional(),
});

export class CreateLlmModelConfigDto extends createZodDto(
  createLlmModelConfigSchema,
) {}

export { LLM_MODEL_TYPES };
