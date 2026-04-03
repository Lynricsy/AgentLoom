import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const RuntimeModeSchema = z.enum(['sandbox', 'no_sandbox'], {
  message: 'runtimeMode 必须是 sandbox 或 no_sandbox',
});

export const CreateAgentDefinitionSchema = z
  .object({
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

    runtimeMode: RuntimeModeSchema.optional(),
    runtime_mode: RuntimeModeSchema.optional(),

    globalSandboxConfig: z.record(z.string(), z.unknown()).optional(),
    global_sandbox_config: z.record(z.string(), z.unknown()).optional(),
  })
  .transform((value) => ({
    name: value.name,
    description: value.description,
    icon: value.icon,
    runtimeMode: value.runtimeMode ?? value.runtime_mode,
    globalSandboxConfig:
      value.globalSandboxConfig ?? value.global_sandbox_config,
  }))
  .superRefine((value, ctx) => {
    if (!value.runtimeMode) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'runtimeMode 必须是 sandbox 或 no_sandbox',
        path: ['runtimeMode'],
      });
    }
  });

export class CreateAgentDefinitionDto extends createZodDto(
  CreateAgentDefinitionSchema,
) {}
