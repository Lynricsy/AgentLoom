import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const UpdateConversationSchema = z.object({
  title: z.string().max(255).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export class UpdateConversationDto extends createZodDto(
  UpdateConversationSchema,
) {}
