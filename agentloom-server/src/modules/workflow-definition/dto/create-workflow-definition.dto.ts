import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const createWorkflowDefinitionSchema = z.object({
  name: z
    .string()
    .min(1, { message: '工作流名称不能为空' })
    .max(255, { message: '工作流名称不能超过 255 个字符' }),
  description: z
    .string()
    .max(2000, { message: '工作流描述不能超过 2000 个字符' })
    .optional(),
  template_slug: z
    .string()
    .max(128, { message: '模板 slug 不能超过 128 个字符' })
    .optional(),
});

export class CreateWorkflowDefinitionDto extends createZodDto(
  createWorkflowDefinitionSchema,
) {}
