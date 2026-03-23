import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const toolPermissionRequestSchema = z.object({
  description: z.string().min(1),
  resourcePaths: z.array(z.string().min(1)).optional(),
});

export const toolPermissionCallbackSchema = z.object({
  sessionId: z.string().uuid().optional(),
  toolCallId: z.string().min(1),
  toolName: z.string().min(1),
  input: z.unknown().optional(),
  permissionRequest: toolPermissionRequestSchema.optional(),
});

export class ToolPermissionCallbackDto extends createZodDto(
  toolPermissionCallbackSchema,
) {}
