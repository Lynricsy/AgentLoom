import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const testProviderConnectionSchema = z.object({
  timeoutMs: z
    .number()
    .int()
    .min(5_000, '超时时间不能小于 5000ms')
    .max(600_000, '超时时间不能超过 600000ms')
    .optional(),
});

export class TestProviderConnectionDto extends createZodDto(
  testProviderConnectionSchema,
) {}
