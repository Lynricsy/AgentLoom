import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

// --------------- Path / Alias Operations ---------------

export const CreateMemoryPathSchema = z.object({
  domain: z.string().min(1).max(64, 'domain 最长 64 个字符'),
  pathString: z.string().min(1).max(512, 'pathString 最长 512 个字符'),
  nodeId: z.string().uuid('nodeId 必须为有效 UUID'),
});

export class CreateMemoryPathDto extends createZodDto(CreateMemoryPathSchema) {}

export const CreateMemoryAliasSchema = z.object({
  sourceUri: z.string().min(1, 'sourceUri 不能为空').max(600),
  aliasUri: z.string().min(1, 'aliasUri 不能为空').max(600),
});

export class CreateMemoryAliasDto extends createZodDto(
  CreateMemoryAliasSchema,
) {}

export const ListMemoryPathsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).optional(),
    page_size: z.coerce.number().int().min(1).max(100).optional(),
    domain: z.string().max(64).optional(),
  })
  .transform((v) => ({
    page: v.page,
    pageSize: v.pageSize ?? v.page_size ?? 20,
    domain: v.domain,
  }));

export class ListMemoryPathsQueryDto extends createZodDto(
  ListMemoryPathsQuerySchema,
) {}
