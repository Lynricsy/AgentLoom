import { z } from 'zod';

export const QueryShareSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(20),
  workflow_definition_id: z.uuid().optional(),
});

export type QueryShareDto = z.infer<typeof QueryShareSchema>;
