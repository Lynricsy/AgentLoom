import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const toolPermissionRequestSchema = z.object({
  description: z.string().min(1),
  resourcePaths: z.array(z.string().min(1)).optional(),
  domain: z.string().min(1).optional(),
  category: z.string().min(1).optional(),
  riskLevel: z.enum(['low', 'medium', 'high']).optional(),
  sourceLabel: z.string().min(1).optional(),
  targetType: z.string().min(1).optional(),
  targetLabel: z.string().min(1).optional(),
  approveEffect: z.string().min(1).optional(),
  denyEffect: z.string().min(1).optional(),
  diffPreview: z.record(z.string(), z.unknown()).optional(),
  rememberable: z.boolean().optional(),
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
