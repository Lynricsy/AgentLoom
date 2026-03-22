import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

// --------------- Node CRUD ---------------

export const CreateMemoryNodeSchema = z.object({
  contentType: z.string().min(1).max(64).default('text'),
  metadata: z.record(z.string(), z.unknown()).optional(),
  disclosureLevel: z.coerce.number().int().min(0).max(100).default(0),
});

export class CreateMemoryNodeDto extends createZodDto(
  CreateMemoryNodeSchema,
) {}

export const ListMemoryNodesQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).optional(),
    page_size: z.coerce.number().int().min(1).max(100).optional(),
    contentType: z.string().max(64).optional(),
    content_type: z.string().max(64).optional(),
  })
  .transform((v) => ({
    page: v.page,
    pageSize: v.pageSize ?? v.page_size ?? 20,
    contentType: v.contentType ?? v.content_type,
  }));

export class ListMemoryNodesQueryDto extends createZodDto(
  ListMemoryNodesQuerySchema,
) {}
