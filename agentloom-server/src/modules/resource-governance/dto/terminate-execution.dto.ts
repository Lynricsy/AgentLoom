import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const TerminateExecutionSchema = z
  .object({
    reason: z
      .string()
      .trim()
      .min(1, '终止原因不能为空')
      .max(500, '终止原因不能超过 500 个字符'),
  })
  .strict();

export type TerminateExecutionDto = z.infer<typeof TerminateExecutionSchema>;

export class TerminateExecutionRequestDto extends createZodDto(
  TerminateExecutionSchema,
) {}
