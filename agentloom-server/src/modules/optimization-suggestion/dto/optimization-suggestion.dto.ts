import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const SuggestionStatusSchema = z.enum([
  'pending',
  'applied',
  'dismissed',
  'blocked',
]);

export const SuggestionTypeSchema = z.enum([
  'model_downgrade',
  'timeout_adjustment',
  'tool_pruning',
  'autonomy_upgrade',
]);

export const QuerySuggestionsSchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  status: SuggestionStatusSchema.optional(),
  suggestionType: SuggestionTypeSchema.optional(),
  workflowDefinitionId: z.string().uuid().optional(),
  nodeId: z.string().min(1).optional(),
});

export class QuerySuggestionsDto extends createZodDto(QuerySuggestionsSchema) {}

export const QueryStatsSchema = z.object({
  workflowDefinitionId: z.string().uuid().optional(),
});

export class QueryStatsDto extends createZodDto(QueryStatsSchema) {}
