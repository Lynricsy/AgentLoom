import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

// 请求体整体可省略：不带 body 调用时 Fastify 给出 undefined，必须在 schema 层兜成 {}，
// 否则全局 ZodValidationPipe 会以「expected object, received undefined」拒绝。
export const TestProviderConnectionSchema = z
  .object({
    timeoutMs: z
      .number()
      .int()
      .min(5_000, '超时时间不能小于 5000ms')
      .max(600_000, '超时时间不能超过 600000ms')
      .optional(),
  })
  .optional()
  .default({});

export class TestProviderConnectionDto extends createZodDto(
  TestProviderConnectionSchema,
) {}
