import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

import { AUTH_METHODS } from './create-llm-model-config.dto';

const testConnectionSchema = z.object({
  endpointUrl: z
    .string()
    .url('端点 URL 格式无效')
    .max(2048, '端点 URL 不能超过 2048 个字符'),
  authMethod: z.enum(AUTH_METHODS),
  authConfig: z.record(z.string(), z.unknown()).optional().default({}),
  timeoutMs: z
    .number()
    .int()
    .min(1000, '超时时间不能小于 1000ms')
    .max(300000, '超时时间不能超过 300000ms')
    .optional()
    .default(10000),
});

export class TestConnectionDto extends createZodDto(testConnectionSchema) {}
