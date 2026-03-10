import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const resolveToolPermissionSchema = z.object({
  action: z.enum(['approve', 'deny']),
});

export class ResolveToolPermissionDto extends createZodDto(
  resolveToolPermissionSchema,
) {}
