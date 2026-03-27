import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

import { AUTH_METHODS } from './create-llm-model-config.dto';

const fetchPrivateCloudModelsSchema = z
  .object({
    endpointUrl: z
      .string()
      .url('端点 URL 格式无效')
      .max(2048, '端点 URL 不能超过 2048 个字符'),
    authMethod: z.enum(AUTH_METHODS),
    apiKeyId: z.string().uuid('API Key ID 格式无效').optional(),
  })
  .superRefine((data, ctx) => {
    if (data.authMethod === 'api_key' && !data.apiKeyId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: '私有云 API Key 认证必须选择 API Key',
        path: ['apiKeyId'],
      });
    }
  });

export class FetchPrivateCloudModelsDto extends createZodDto(
  fetchPrivateCloudModelsSchema,
) {}
