import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { executionSteps } from './execution-steps.schema';
import { llmModelConfigs } from './llm-model-configs.schema';
import { createDirectTenantPolicies } from './rls-policies';

export const routingDecisions = pgTable(
  'routing_decisions',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuid_generate_v7()`),

    executionStepId: uuid('execution_step_id')
      .notNull()
      .references(() => executionSteps.id, { onDelete: 'cascade' }),

    tenantId: uuid('tenant_id').notNull(),

    routingNodeId: text('routing_node_id').notNull(),

    strategy: varchar('strategy', { length: 30 }).notNull(),

    modelsEvaluated: jsonb('models_evaluated')
      .notNull()
      .$type<ModelEvaluation[]>(),

    selectedModelId: uuid('selected_model_id')
      .notNull()
      .references(() => llmModelConfigs.id, { onDelete: 'set null' }),

    decisionReasoning: text('decision_reasoning').notNull(),

    routingLatencyMs: integer('routing_latency_ms').notNull(),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('idx_routing_decisions_execution_step_id').on(table.executionStepId),
    index('idx_routing_decisions_tenant_id').on(table.tenantId),
    index('idx_routing_decisions_selected_model_id').on(table.selectedModelId),
    ...createDirectTenantPolicies('routing_decisions'),
  ],
);

export interface ModelEvaluation {
  modelId: string;
  modelName: string;
  provider: string;
  score: number;
  reasoning: string;
}

export type RoutingDecision = typeof routingDecisions.$inferSelect;
export type NewRoutingDecision = typeof routingDecisions.$inferInsert;
