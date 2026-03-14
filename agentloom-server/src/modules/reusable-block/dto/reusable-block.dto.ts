import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

import type {
  BlockDefinition,
  BlockMetadata,
  BlockPort,
} from '../../../database/schema/reusable-blocks.schema';

export const ReusableBlockCategorySchema = z.enum([
  'analysis',
  'content',
  'development',
  'automation',
  'reporting',
]);

export const ReusableBlockPortDataTypeSchema = z.enum([
  'model',
  'text',
  'json',
  'image',
  'audio',
  'tool',
  'sandbox',
  'knowledge',
]);

const ReusableBlockNodeSchema = z.object({ id: z.string().min(1) }).passthrough();

const ReusableBlockEdgeSchema = z
  .object({
    id: z.string().min(1),
    source: z.string().min(1),
    target: z.string().min(1),
  })
  .passthrough();

export const ReusableBlockPortSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1),
    dataType: ReusableBlockPortDataTypeSchema,
    sourceNodeId: z.string().min(1).optional(),
    sourcePortId: z.string().min(1).optional(),
  })
  .strict();

export const ReusableBlockDefinitionSchema: z.ZodType<BlockDefinition> = z
  .object({
    nodes: z
      .array(ReusableBlockNodeSchema)
      .min(1, { message: '可复用块至少需要一个节点' }),
    edges: z.array(ReusableBlockEdgeSchema),
    inputPorts: z.array(ReusableBlockPortSchema),
    outputPorts: z.array(ReusableBlockPortSchema),
    viewport: z
      .object({
        x: z.number(),
        y: z.number(),
        zoom: z.number(),
      })
      .optional(),
  })
  .superRefine((definition, ctx) => {
    const nodeIds = new Set(definition.nodes.map((node) => node.id));

    definition.edges.forEach((edge, index) => {
      if (!nodeIds.has(edge.source)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['edges', index, 'source'],
          message: `边 ${edge.id} 引用的 source 节点不存在`,
        });
      }

      if (!nodeIds.has(edge.target)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['edges', index, 'target'],
          message: `边 ${edge.id} 引用的 target 节点不存在`,
        });
      }
    });
  });

export const ReusableBlockMetadataSchema: z.ZodType<BlockMetadata> = z
  .object({
    nodeCount: z.number().int().min(0),
    author: z.string().min(1).optional(),
    version: z.number().int().min(1),
    createdFromWorkflowId: z.string().uuid().optional(),
    exportedAt: z.string().datetime().optional(),
  })
  .strict();

export const CreateReusableBlockSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, { message: '可复用块名称不能为空' })
    .max(255, { message: '可复用块名称不能超过 255 个字符' }),
  description: z
    .string()
    .trim()
    .max(2000, { message: '可复用块描述不能超过 2000 个字符' })
    .optional(),
  category: ReusableBlockCategorySchema.optional(),
  tags: z.array(z.string().trim().min(1)).optional().default([]),
  definition: ReusableBlockDefinitionSchema,
  metadata: ReusableBlockMetadataSchema.optional(),
});

export class CreateReusableBlockDto extends createZodDto(
  CreateReusableBlockSchema,
) {}

export const UpdateReusableBlockSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, { message: '可复用块名称不能为空' })
      .max(255, { message: '可复用块名称不能超过 255 个字符' })
      .optional(),
    description: z
      .string()
      .trim()
      .max(2000, { message: '可复用块描述不能超过 2000 个字符' })
      .nullable()
      .optional(),
    category: ReusableBlockCategorySchema.nullable().optional(),
    tags: z.array(z.string().trim().min(1)).optional(),
    definition: ReusableBlockDefinitionSchema.optional(),
    metadata: ReusableBlockMetadataSchema.nullable().optional(),
    isPublished: z.boolean().optional(),
    version: z.number().int().min(1, { message: '版本号必须为正整数' }),
  })
  .strict();

export class UpdateReusableBlockDto extends createZodDto(
  UpdateReusableBlockSchema,
) {}

export const QueryReusableBlockSchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
  category: ReusableBlockCategorySchema.optional(),
  search: z.string().trim().min(1).optional(),
});

export class QueryReusableBlockDto extends createZodDto(
  QueryReusableBlockSchema,
) {}

export type ReusableBlockCategory = z.infer<typeof ReusableBlockCategorySchema>;
export type ReusableBlockPortDataType = z.infer<
  typeof ReusableBlockPortDataTypeSchema
>;
export type ReusableBlockDefinitionDto = z.infer<
  typeof ReusableBlockDefinitionSchema
>;
export type ReusableBlockMetadataDto = z.infer<
  typeof ReusableBlockMetadataSchema
>;
export type ReusableBlockPortDto = BlockPort;
