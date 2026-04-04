import { z } from 'zod';

export const QueryAgentShareSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(20),
  agent_definition_id: z.uuid().optional(),
});

export type QueryAgentShareDto = z.infer<typeof QueryAgentShareSchema>;
