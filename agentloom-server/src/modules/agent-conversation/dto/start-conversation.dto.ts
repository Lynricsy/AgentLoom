import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const startConversationSchema = z.object({
  title: z.string().max(255).optional(),
  content: z.string().min(1),
  contentType: z.enum(['text', 'image', 'file']).default('text'),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export class StartConversationDto extends createZodDto(
  startConversationSchema,
) {}
