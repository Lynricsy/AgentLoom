import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

import { DEFAULT_SANDBOX_CONVERSATION_IDLE_AUTO_END_MINUTES } from '../sandbox-conversation-idle.utils';

export const createSandboxSchema = z.object({
  name: z.string().min(1, 'Name is required').max(128, 'Name too long'),
  cpu: z.number().min(0.5).max(4).default(1),
  memory: z.number().int().min(256).max(4096).default(512),
  disk: z.number().int().min(1).max(10).default(1),
  conversationIdleAutoEndMinutes: z
    .number()
    .int()
    .min(1)
    .max(1440)
    .default(DEFAULT_SANDBOX_CONVERSATION_IDLE_AUTO_END_MINUTES),
});

export class CreateSandboxDto extends createZodDto(createSandboxSchema) {}
