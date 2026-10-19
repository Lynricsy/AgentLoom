import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/** 用户接口只能写入用户消息；assistant/system/tool 消息只由运行时产生，故不接受 role */
export const sendMessageSchema = z
  .object({
    content: z.string().min(1),
    contentType: z.enum(['text', 'image', 'file']).default('text'),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export class SendMessageDto extends createZodDto(sendMessageSchema) {}
