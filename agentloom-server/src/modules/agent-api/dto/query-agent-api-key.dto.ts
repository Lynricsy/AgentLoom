import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const AGENT_API_KEY_MAX_PAGE_SIZE = 100;

export const QueryAgentApiKeySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  /** 超过上限时按上限处理，而不是报错（与契约一致） */
  page_size: z.coerce
    .number()
    .int()
    .min(1)
    .transform((value) => Math.min(value, AGENT_API_KEY_MAX_PAGE_SIZE))
    .default(20),
  status: z.enum(['active', 'revoked', 'all']).default('active'),
});

export type QueryAgentApiKeyDto = z.infer<typeof QueryAgentApiKeySchema>;

export class QueryAgentApiKeySwaggerDto extends createZodDto(
  QueryAgentApiKeySchema,
) {}
