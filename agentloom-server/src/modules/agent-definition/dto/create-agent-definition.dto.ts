import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const CreateAgentDefinitionSchema = z.object({
  name: z
    .string()
    .min(1, { message: 'Agent 名称不能为空' })
    .max(255, { message: 'Agent 名称不能超过 255 个字符' }),

  description: z
    .string()
    .max(2000, { message: 'Agent 描述不能超过 2000 个字符' })
    .optional(),

  icon: z
    .string()
    .max(255, { message: '图标标识不能超过 255 个字符' })
    .optional(),

  globalSandboxConfig: z.record(z.string(), z.unknown()).optional(),
});

export class CreateAgentDefinitionDto extends createZodDto(
  CreateAgentDefinitionSchema,
) {}
