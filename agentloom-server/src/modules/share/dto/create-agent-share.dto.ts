import { z } from 'zod';

export const CreateAgentShareSchema = z.object({
  agent_definition_id: z.uuid(),
  share_type: z.enum(['read_only', 'copyable']).default('read_only'),
  expires_at: z.iso.datetime().optional(),
});

export type CreateAgentShareDto = z.infer<typeof CreateAgentShareSchema>;
