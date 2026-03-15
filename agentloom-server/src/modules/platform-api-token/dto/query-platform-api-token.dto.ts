import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const QueryPlatformApiTokenSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['active', 'revoked', 'all']).default('active'),
});

export type QueryPlatformApiTokenDto = z.infer<
  typeof QueryPlatformApiTokenSchema
>;

export class QueryPlatformApiTokenSwaggerDto extends createZodDto(
  QueryPlatformApiTokenSchema,
) {}
