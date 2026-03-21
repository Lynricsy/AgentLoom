import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const createConversationSchema = z.object({
  title: z.string().max(255).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export class CreateConversationDto extends createZodDto(
  createConversationSchema,
) {}
