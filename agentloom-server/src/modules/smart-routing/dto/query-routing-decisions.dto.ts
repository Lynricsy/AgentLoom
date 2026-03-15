import { z } from 'zod';

export const QueryRoutingDecisionsSchema = z.object({
  executionId: z.string().uuid().optional(),
  routingNodeId: z.string().min(1).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type QueryRoutingDecisionsDto = z.infer<
  typeof QueryRoutingDecisionsSchema
>;
