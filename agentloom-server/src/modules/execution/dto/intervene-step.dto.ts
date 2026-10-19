import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const interveneStepBaseSchema = z.object({
  action: z.enum(['approve', 'modify', 'reject']),
  feedback: z.string().trim().min(1, '反馈内容不能为空').optional(),
  modifiedContent: z.string().trim().min(1, '修改内容不能为空').optional(),
});

/** 管道直接使用带跨字段约束的 schema：controller 不再二次 parse（裸 ZodError 会变成 500）。 */
export const interveneStepSchema = interveneStepBaseSchema.superRefine(
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

export class InterveneStepDto extends createZodDto(interveneStepSchema) {}
