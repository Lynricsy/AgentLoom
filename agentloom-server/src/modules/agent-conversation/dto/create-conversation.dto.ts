import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

import { ConversationMetadataInputSchema } from './update-conversation.dto';

export const createConversationSchema = z.object({
  title: z.string().max(255).optional(),
  metadata: ConversationMetadataInputSchema.optional(),
});

export class CreateConversationDto extends createZodDto(
  createConversationSchema,
) {}
