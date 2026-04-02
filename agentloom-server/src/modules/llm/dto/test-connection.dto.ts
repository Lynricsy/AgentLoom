import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const AUTH_METHODS = ['api_key', 'mtls', 'none'] as const;
const PRIVATE_CLOUD_TIMEOUT_MIN = 5_000;
const PRIVATE_CLOUD_TIMEOUT_MAX = 600_000;

const testConnectionSchema = z
  .object({
    endpointUrl: z
      .string()
      .url('端点 URL 格式无效')
      .max(2048, '端点 URL 不能超过 2048 个字符'),
    authMethod: z.enum(AUTH_METHODS),
    apiKeyId: z.string().uuid('API Key ID 格式无效').optional(),
    apiKey: z
      .string()
      .trim()
      .min(1, 'API Key 不能为空')
      .max(4096, 'API Key 长度不能超过 4096 个字符')
      .optional(),
    timeoutMs: z
      .number()
      .int()
      .min(
        PRIVATE_CLOUD_TIMEOUT_MIN,
        `超时时间不能小于 ${PRIVATE_CLOUD_TIMEOUT_MIN}ms`,
      )
      .max(
        PRIVATE_CLOUD_TIMEOUT_MAX,
        `超时时间不能超过 ${PRIVATE_CLOUD_TIMEOUT_MAX}ms`,
      )
      .optional()
      .default(10000),
  })
  .superRefine((data, ctx) => {
    if (
      data.authMethod === 'api_key' &&
      !data.apiKeyId &&
      !data.apiKey?.trim()
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: '私有云 API Key 认证必须填写 API Key',
        path: ['apiKey'],
      });
    }
  });

export class TestConnectionDto extends createZodDto(testConnectionSchema) {}
