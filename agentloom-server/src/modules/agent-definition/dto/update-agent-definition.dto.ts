import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const UpdateAgentDefinitionSchema = z
  .object({
    name: z
      .string()
      .min(1, { message: 'Agent 名称不能为空' })
      .max(255, { message: 'Agent 名称不能超过 255 个字符' })
      .optional(),

    description: z
      .string()
      .max(2000, { message: 'Agent 描述不能超过 2000 个字符' })
      .nullable()
      .optional(),

    icon: z
      .string()
      .max(255, { message: '图标标识不能超过 255 个字符' })
      .optional(),

    globalSandboxConfig: z.record(z.string(), z.unknown()).optional(),

    version: z.number().int().min(1, { message: '版本号必须为正整数' }),
  })
  .strict();

export class UpdateAgentDefinitionDto extends createZodDto(
  UpdateAgentDefinitionSchema,
) {}
