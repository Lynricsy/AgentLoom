import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

// --------------- Search / URI Resolution ---------------

export const MemorySearchQuerySchema = z
  .object({
    q: z.string().min(1, '搜索关键词不能为空').max(500),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    offset: z.coerce.number().int().min(0).optional(),
    minDisclosure: z.coerce.number().int().min(0).optional(),
    min_disclosure: z.coerce.number().int().min(0).optional(),
  })
  .transform((v) => ({
    q: v.q,
    limit: v.limit ?? 20,
    offset: v.offset ?? 0,
    minDisclosure: v.minDisclosure ?? v.min_disclosure,
  }));

export class MemorySearchQueryDto extends createZodDto(
  MemorySearchQuerySchema,
) {}

export const ResolveUriQuerySchema = z.object({
  uri: z.string().min(1, 'URI 不能为空').max(600),
});

export class ResolveUriQueryDto extends createZodDto(ResolveUriQuerySchema) {}
