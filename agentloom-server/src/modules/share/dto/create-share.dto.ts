import { z } from 'zod';

export const CreateShareSchema = z.object({
  workflow_definition_id: z.uuid(),
  share_type: z.enum(['read_only', 'copyable']).default('read_only'),
  expires_at: z.iso.datetime().optional(),
});

export type CreateShareDto = z.infer<typeof CreateShareSchema>;
