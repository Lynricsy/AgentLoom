import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { routerModels } from './router-models.schema';
import { createJoinTenantPolicies } from './rls-policies';

export const ROUTING_BENCHMARK_TASK_CATEGORIES = [
  'coding',
  'reasoning',
  'creative',
  'qa',
  'math',
  'general',
] as const;

export type RoutingBenchmarkTaskCategory =
  (typeof ROUTING_BENCHMARK_TASK_CATEGORIES)[number];

export interface RoutingBenchmarkMlpLayer {
  weights: number[][];
  biases: number[];
}

export interface RoutingBenchmarkMlpWeights {
  layers: RoutingBenchmarkMlpLayer[];
  metadata: {
    trainedAt: string;
    sampleCount: number;
    version: string;
  };
}

export const routingBenchmarks = pgTable(
  'routing_benchmarks',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuid_generate_v7()`),

    taskCategory: varchar('task_category', { length: 30 })
      .notNull()
      .$type<RoutingBenchmarkTaskCategory>(),

    queryText: text('query_text').notNull(),

    queryEmbeddingId: varchar('query_embedding_id', { length: 255 }),

    modelId: uuid('model_id')
      .notNull()
      .references(() => routerModels.id, { onDelete: 'cascade' }),

    performanceScore: numeric('performance_score', {
      precision: 10,
      scale: 4,
    }).notNull(),

    tokenCount: integer('token_count').notNull(),

    latencyMs: integer('latency_ms').notNull(),

    mlpWeights: jsonb('mlp_weights').$type<RoutingBenchmarkMlpWeights | null>(),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('idx_routing_benchmarks_task_category').on(table.taskCategory),
    index('idx_routing_benchmarks_model_id').on(table.modelId),
    index('idx_routing_benchmarks_query_embedding_id').on(
      table.queryEmbeddingId,
    ),
    ...createJoinTenantPolicies(
      'routing_benchmarks',
      'model_id',
      'router_models',
    ),
  ],
);

export type RoutingBenchmark = typeof routingBenchmarks.$inferSelect;
export type NewRoutingBenchmark = typeof routingBenchmarks.$inferInsert;
