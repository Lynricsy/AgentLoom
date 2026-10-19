import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

// --------------- Version Operations ---------------

const VersionContentSchema = z.string().min(1, '内容不能为空');

// 每种 mode 的必填字段不同：缺字段必须在入口返回 422，而不是落到数据库
// NOT NULL（500）或被 patch 当成「old_string not found」（409）。mode 省略时按 create 处理。
export const CreateMemoryVersionSchema = z.discriminatedUnion('mode', [
  z.object({
    // optional() 让 discriminatedUnion 把缺省的 mode 路由到本分支，再由 default 补成 create。
    mode: z.literal('create').optional().default('create'),
    content: VersionContentSchema,
  }),
  z.object({
    mode: z.literal('append'),
    content: VersionContentSchema,
  }),
  z.object({
    mode: z.literal('patch'),
    // 当前内容中要替换的原文
    oldString: z.string().min(1, 'oldString 不能为空'),
    // 替换文本（允许为空字符串，用于删除片段）
    newString: z.string(),
  }),
]);

export type CreateMemoryVersionInput = z.infer<
  typeof CreateMemoryVersionSchema
>;

// 仅描述 OpenAPI 请求体形状（discriminatedUnion 无法作为 createZodDto 的基类）；
// 运行时由 controller 上的 ZodValidationPipe(CreateMemoryVersionSchema) 按 mode 校验。
export class CreateMemoryVersionDto extends createZodDto(
  z.object({
    mode: z.enum(['create', 'patch', 'append']).default('create'),
    content: VersionContentSchema.optional().describe('create / append 必填'),
    oldString: z.string().optional().describe('patch 必填'),
    newString: z.string().optional().describe('patch 必填，可为空字符串'),
  }),
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
