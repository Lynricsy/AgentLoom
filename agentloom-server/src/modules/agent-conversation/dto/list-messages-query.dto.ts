import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/** 对话详情与消息列表共用的消息分页参数 */
export const listMessagesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export class ListMessagesQueryDto extends createZodDto(
  listMessagesQuerySchema,
) {}
