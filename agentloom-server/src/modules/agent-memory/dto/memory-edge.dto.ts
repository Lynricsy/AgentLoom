import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

// --------------- Edge Operations ---------------

export const CreateMemoryEdgeSchema = z.object({
  parentNodeId: z.string().uuid('parentNodeId 必须为有效 UUID'),
  childNodeId: z.string().uuid('childNodeId 必须为有效 UUID'),
  name: z.string().max(256).optional(),
  priority: z.coerce.number().int().min(0).default(0),
  disclosure: z.coerce.number().int().min(0).default(0),
});

export class CreateMemoryEdgeDto extends createZodDto(
  CreateMemoryEdgeSchema,
) {}

export const ListMemoryEdgesQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).optional(),
    page_size: z.coerce.number().int().min(1).max(100).optional(),
    parentNodeId: z.string().uuid().optional(),
    parent_node_id: z.string().uuid().optional(),
    childNodeId: z.string().uuid().optional(),
    child_node_id: z.string().uuid().optional(),
  })
  .transform((v) => ({
    page: v.page,
    pageSize: v.pageSize ?? v.page_size ?? 20,
    parentNodeId: v.parentNodeId ?? v.parent_node_id,
    childNodeId: v.childNodeId ?? v.child_node_id,
  }));

export class ListMemoryEdgesQueryDto extends createZodDto(
  ListMemoryEdgesQuerySchema,
) {}
