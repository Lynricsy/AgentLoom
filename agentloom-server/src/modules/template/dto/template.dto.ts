import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

import type { TemplateDefinition } from '../../../database/schema/workflow-templates.schema';

// ──────────────────────────────────────────────
// Query DTO
// ──────────────────────────────────────────────

const ListTemplatesQuerySchema = z.object({
  category: z
    .enum(['analysis', 'content', 'development', 'automation', 'reporting'])
    .optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
});

const TemplateCategorySchema = z.enum([
  'analysis',
  'content',
  'development',
  'automation',
  'reporting',
]);

export class ListTemplatesQueryDto extends createZodDto(
  ListTemplatesQuerySchema,
) {}

// ──────────────────────────────────────────────
// Response schemas
// ──────────────────────────────────────────────

/** 列表项（不含 definition） */
export const TemplateListItemSchema = z.object({
  id: z.uuid(),
  slug: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  category: TemplateCategorySchema,
  tags: z.array(z.string()),
  thumbnailUrl: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()),
  displayOrder: z.number().int(),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
});

export type TemplateListItem = z.infer<typeof TemplateListItemSchema>;

/** 详情（含 definition） */
export const TemplateDetailSchema = TemplateListItemSchema.extend({
  definition: z.object({
    nodes: z.array(z.record(z.string(), z.unknown())),
    edges: z.array(z.record(z.string(), z.unknown())),
    viewport: z.object({ x: z.number(), y: z.number(), zoom: z.number() }),
  }),
});

type TemplateDetailShape = z.infer<typeof TemplateDetailSchema>;

export type TemplateDetail = Omit<TemplateDetailShape, 'definition'> & {
  definition: TemplateDefinition;
};

/** 分页元信息 */
export const PaginationMetaSchema = z.object({
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
  totalPages: z.number().int(),
});

export type PaginationMeta = z.infer<typeof PaginationMetaSchema>;
