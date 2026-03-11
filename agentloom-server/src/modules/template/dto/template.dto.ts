import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

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
  createdAt: z.string().or(z.date()),
  updatedAt: z.string().or(z.date()),
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

export type TemplateDetail = z.infer<typeof TemplateDetailSchema>;

/** 分页元信息 */
export const PaginationMetaSchema = z.object({
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
  totalPages: z.number().int(),
});

export type PaginationMeta = z.infer<typeof PaginationMetaSchema>;
