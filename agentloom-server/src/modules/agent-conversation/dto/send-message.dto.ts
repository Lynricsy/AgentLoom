import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const sendMessageSchema = z.object({
  content: z.string().min(1),
  role: z.enum(['user', 'assistant', 'system', 'tool']).default('user'),
  contentType: z.enum(['text', 'image', 'file']).default('text'),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export class SendMessageDto extends createZodDto(sendMessageSchema) {}
