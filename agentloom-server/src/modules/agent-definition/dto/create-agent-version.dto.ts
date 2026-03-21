import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const CreateAgentVersionSchema = z.object({
  changelog: z
    .string()
    .max(2000, { message: '变更日志不能超过 2000 个字符' })
    .optional(),
});

export class CreateAgentVersionDto extends createZodDto(
  CreateAgentVersionSchema,
) {}
