import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const interveneStepDtoSchema = z.object({
  action: z.enum(['approve', 'modify', 'reject']),
  feedback: z.string().trim().min(1, '反馈内容不能为空').optional(),
  modifiedContent: z.string().trim().min(1, '修改内容不能为空').optional(),
});

export const interveneStepSchema = interveneStepDtoSchema.superRefine(
  (value, ctx) => {
    if (value.action === 'modify' && !value.modifiedContent) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['modifiedContent'],
        message: '修改内容不能为空',
      });
    }

    if (value.action !== 'modify' && value.modifiedContent !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['modifiedContent'],
        message: '只有 modify 动作允许提供 modifiedContent',
      });
    }
  },
);

export class InterveneStepDto extends createZodDto(interveneStepDtoSchema) {}
