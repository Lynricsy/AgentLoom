import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

import { workflowInputSchemaSchema } from '../../workflow/dto/workflow-input-schema.dto';

export const UpdateWorkflowDefinitionSchema = z
  .object({
    name: z
      .string()
      .min(1, { message: '工作流名称不能为空' })
      .max(255, { message: '工作流名称不能超过 255 个字符' })
      .optional(),
    description: z
      .string()
      .max(2000, { message: '工作流描述不能超过 2000 个字符' })
      .nullable()
      .optional(),
    icon: z
      .string()
      .max(255, { message: '图标标识不能超过 255 个字符' })
      .nullable()
      .optional(),
    nodes: z.array(z.record(z.string(), z.unknown())).optional(),
    edges: z.array(z.record(z.string(), z.unknown())).optional(),
    viewport: z
      .object({
        x: z.number(),
        y: z.number(),
        zoom: z.number(),
      })
      .nullable()
      .optional(),
    inputSchema: workflowInputSchemaSchema.optional(),
    version: z.number().int().min(1, { message: '版本号必须为正整数' }),
  })
  .strict();

export class UpdateWorkflowDefinitionDto extends createZodDto(
  UpdateWorkflowDefinitionSchema,
) {}
