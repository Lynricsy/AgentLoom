import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const listConversationsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['active', 'paused', 'ended', 'failed']).optional(),
  /** 不传时排除团队成员对话（source=team）；显式传 team 才返回 */
  source: z.enum(['studio', 'api', 'team']).optional(),
});

export class ListConversationsQueryDto extends createZodDto(
  listConversationsQuerySchema,
) {}
