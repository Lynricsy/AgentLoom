import { z } from 'zod';

export const CreateWorkspaceSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(2000).optional().nullable(),
  sandboxSessionId: z.string().uuid().optional(),
});

export type CreateWorkspaceDto = z.infer<typeof CreateWorkspaceSchema>;
