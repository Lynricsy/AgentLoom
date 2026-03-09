import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const interveneStepSchema = z.object({
  /** 用户反馈内容 */
  feedback: z.string().min(1, '反馈内容不能为空'),
});

export class InterveneStepDto extends createZodDto(interveneStepSchema) {}
