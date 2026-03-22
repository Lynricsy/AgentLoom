import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

// --------------- Version Operations ---------------

export const CreateMemoryVersionSchema = z.object({
  content: z.string().min(1, '内容不能为空').optional(),
  mode: z.enum(['create', 'patch', 'append']).default('create'),
  // patch 模式下的原始文本
  oldString: z.string().optional(),
  // patch 模式下的替换文本
  newString: z.string().optional(),
});

export class CreateMemoryVersionDto extends createZodDto(
  CreateMemoryVersionSchema,
) {}

export const RollbackVersionSchema = z.object({
  targetVersionId: z.string().uuid('targetVersionId 必须为有效 UUID'),
});

export class RollbackVersionDto extends createZodDto(RollbackVersionSchema) {}

export const ListMemoryVersionsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).optional(),
    page_size: z.coerce.number().int().min(1).max(100).optional(),
  })
  .transform((v) => ({
    page: v.page,
    pageSize: v.pageSize ?? v.page_size ?? 20,
  }));

export class ListMemoryVersionsQueryDto extends createZodDto(
  ListMemoryVersionsQuerySchema,
) {}
