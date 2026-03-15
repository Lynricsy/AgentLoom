import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

import { AUTH_METHODS } from './create-llm-model-config.dto';

const fetchPrivateCloudModelsSchema = z.object({
  endpointUrl: z
    .string()
    .url('端点 URL 格式无效')
    .max(2048, '端点 URL 不能超过 2048 个字符'),
  authMethod: z.enum(AUTH_METHODS),
  authConfig: z.record(z.string(), z.unknown()).optional().default({}),
});

export class FetchPrivateCloudModelsDto extends createZodDto(
  fetchPrivateCloudModelsSchema,
) {}
