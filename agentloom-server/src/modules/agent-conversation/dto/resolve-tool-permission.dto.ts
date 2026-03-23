import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const resolveConversationToolPermissionSchema = z.object({
  action: z.enum(['approve', 'deny']),
});

export class ResolveConversationToolPermissionDto extends createZodDto(
  resolveConversationToolPermissionSchema,
) {}
