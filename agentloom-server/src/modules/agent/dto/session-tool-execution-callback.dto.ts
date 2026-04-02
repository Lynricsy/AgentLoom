import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const sessionToolExecutionCallbackSchema = z.object({
  sessionId: z.string().uuid(),
  toolCallId: z.string().min(1),
  toolName: z.string().min(1),
  input: z.unknown().optional(),
  phase: z.enum(['preflight', 'execute']).optional(),
});

export class SessionToolExecutionCallbackDto extends createZodDto(
  sessionToolExecutionCallbackSchema,
) {}
