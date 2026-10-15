import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { agentConversations } from './agent-conversations.schema';
import { executionSteps } from './execution-steps.schema';
import { llmModelConfigs } from './llm-model-configs.schema';
import { createDirectTenantPolicies } from './rls-policies';

export const routingDecisions = pgTable(
  'routing_decisions',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuid_generate_v7()`),

    // 决策主体二选一：工作流智能路由节点的步骤，或 Agent 对话的启动路由
    executionStepId: uuid('execution_step_id').references(
      () => executionSteps.id,
      { onDelete: 'cascade' },
    ),

    conversationId: uuid('conversation_id').references(
      () => agentConversations.id,
      { onDelete: 'cascade' },
    ),

    tenantId: uuid('tenant_id').notNull(),

    routingNodeId: text('routing_node_id').notNull(),

    strategy: varchar('strategy', { length: 30 }).notNull(),

    routerType: varchar('router_type', { length: 30 }),

    modelsEvaluated: jsonb('models_evaluated')
      .notNull()
      .$type<ModelEvaluation[]>(),

    selectedModelId: uuid('selected_model_id').references(
      () => llmModelConfigs.id,
      { onDelete: 'set null' },
    ),

    decisionReasoning: text('decision_reasoning').notNull(),

    routingLatencyMs: integer('routing_latency_ms').notNull(),

    // 策略失败走确定性回退时的原因（RoutingFallbackReason）与模型来源（RoutingFallbackSource）
    fallbackReason: varchar('fallback_reason', { length: 40 }),

    fallbackSource: varchar('fallback_source', { length: 20 }),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('idx_routing_decisions_execution_step_id').on(table.executionStepId),
    index('idx_routing_decisions_conversation_id').on(table.conversationId),
    index('idx_routing_decisions_tenant_id').on(table.tenantId),
    index('idx_routing_decisions_selected_model_id').on(table.selectedModelId),
    check(
      'chk_routing_decisions_subject',
      sql`(${table.executionStepId} IS NOT NULL) <> (${table.conversationId} IS NOT NULL)`,
    ),
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
