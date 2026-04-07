import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const RememberScopeSchema = z.enum(['none', 'conversation_category']);

export const resolveConversationToolPermissionSchema = z
  .object({
    action: z.enum(['approve', 'deny']),
    rememberScope: RememberScopeSchema.optional(),
    remember_scope: RememberScopeSchema.optional(),
  })
  .transform((value) => ({
    action: value.action,
    ...((value.rememberScope ?? value.remember_scope)
      ? { rememberScope: value.rememberScope ?? value.remember_scope }
      : {}),
  }));

export class ResolveConversationToolPermissionDto extends createZodDto(
  resolveConversationToolPermissionSchema,
) {}
