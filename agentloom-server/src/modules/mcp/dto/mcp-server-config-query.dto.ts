import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const McpServerConfigQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
  search: z.string().trim().min(1).optional(),
  status: z.enum(['active', 'inactive', 'error']).optional(),
  transportType: z.enum(['stdio', 'sse', 'streamable_http']).optional(),
});

export class McpServerConfigQueryDto extends createZodDto(
  McpServerConfigQuerySchema,
) {}

export type McpServerConfigQueryType = z.infer<
  typeof McpServerConfigQuerySchema
>;
