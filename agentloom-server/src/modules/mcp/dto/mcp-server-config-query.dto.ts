import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const McpServerConfigQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).optional().default(1),
    pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
    page_size: z.coerce.number().int().min(1).max(100).optional(),
    search: z.string().trim().min(1).optional(),
    status: z.enum(['active', 'inactive', 'error']).optional(),
    transportType: z.enum(['stdio', 'sse', 'streamable_http']).optional(),
    sourceKind: z.enum(['manual', 'share_imported']).optional(),
    source_kind: z.enum(['manual', 'share_imported']).optional(),
  })
  .transform((value) => ({
    page: value.page,
    pageSize: value.pageSize ?? value.page_size ?? 20,
    search: value.search,
    status: value.status,
    transportType: value.transportType,
    sourceKind: value.sourceKind ?? value.source_kind,
  }));

export class McpServerConfigQueryDto extends createZodDto(
  McpServerConfigQuerySchema,
) {}

export type McpServerConfigQueryType = z.infer<
  typeof McpServerConfigQuerySchema
>;
