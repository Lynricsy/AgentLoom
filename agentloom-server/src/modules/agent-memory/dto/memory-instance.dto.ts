import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

// --------------- 分页公用 Schema ---------------

const PageSizeSchema = z.coerce.number().int().min(1).max(100).optional();

function preferDefined<T>(
  primary: T | undefined,
  fallback: T | undefined,
): T | undefined {
  return primary !== undefined ? primary : fallback;
}

export const PaginationQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: PageSizeSchema,
    page_size: PageSizeSchema,
  })
  .transform((v) => ({
    page: v.page,
    pageSize: v.pageSize ?? v.page_size ?? 20,
  }));

// --------------- Instance CRUD ---------------

export const CreateMemoryInstanceSchema = z
  .object({
    name: z.string().min(1, '名称不能为空').max(255, '名称最长 255 个字符'),
    description: z
      .string()
      .max(2000, '描述最长 2000 个字符')
      .optional()
      .nullable(),
    config: z.record(z.string(), z.unknown()).optional(),
    systemPromptOverride: z.string().max(10000).optional().nullable(),
    system_prompt_override: z.string().max(10000).optional().nullable(),
    validDomains: z.array(z.string().min(1).max(64)).optional(),
    valid_domains: z.array(z.string().min(1).max(64)).optional(),
    coreMemoryUris: z.array(z.string().min(1).max(512)).optional(),
    core_memory_uris: z.array(z.string().min(1).max(512)).optional(),
  })
  .transform((v) => ({
    name: v.name,
    description: v.description,
    config: v.config,
    systemPromptOverride: preferDefined(
      v.systemPromptOverride,
      v.system_prompt_override,
    ),
    validDomains: v.validDomains ?? v.valid_domains,
    coreMemoryUris: v.coreMemoryUris ?? v.core_memory_uris,
  }));

export class CreateMemoryInstanceDto extends createZodDto(
  CreateMemoryInstanceSchema,
) {}

export const UpdateMemoryInstanceSchema = z
  .object({
    name: z.string().min(1).max(255).optional(),
    description: z.string().max(2000).optional().nullable(),
    config: z.record(z.string(), z.unknown()).optional(),
    systemPromptOverride: z.string().max(10000).optional().nullable(),
    system_prompt_override: z.string().max(10000).optional().nullable(),
    validDomains: z.array(z.string().min(1).max(64)).optional(),
    valid_domains: z.array(z.string().min(1).max(64)).optional(),
    coreMemoryUris: z.array(z.string().min(1).max(512)).optional(),
    core_memory_uris: z.array(z.string().min(1).max(512)).optional(),
    status: z.enum(['active', 'archived']).optional(),
  })
  .transform((v) => ({
    name: v.name,
    description: v.description,
    config: v.config,
    systemPromptOverride: preferDefined(
      v.systemPromptOverride,
      v.system_prompt_override,
    ),
    validDomains: v.validDomains ?? v.valid_domains,
    coreMemoryUris: v.coreMemoryUris ?? v.core_memory_uris,
    status: v.status,
  }));

export class UpdateMemoryInstanceDto extends createZodDto(
  UpdateMemoryInstanceSchema,
) {}

export const ListMemoryInstancesQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: PageSizeSchema,
    page_size: PageSizeSchema,
    search: z.string().max(255).optional(),
    status: z.enum(['active', 'archived', 'deleted']).optional(),
  })
  .transform((v) => ({
    page: v.page,
    pageSize: v.pageSize ?? v.page_size ?? 20,
    search: v.search,
    status: v.status,
  }));

export class ListMemoryInstancesQueryDto extends createZodDto(
  ListMemoryInstancesQuerySchema,
) {}
