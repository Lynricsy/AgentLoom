import { sql } from 'drizzle-orm';
import {
  index,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { agentMemoryInstances } from './agent-memory-instances.schema';
import { memoryNodes } from './memory-nodes.schema';
import { createDirectTenantPolicies } from './rls-policies';

export const memoryGlossaryKeywords = pgTable(
  'memory_glossary_keywords',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuid_generate_v7()`),
    instanceId: uuid('instance_id')
      .notNull()
      .references(() => agentMemoryInstances.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id').notNull(),
    keyword: varchar('keyword', { length: 256 }).notNull(),
    nodeId: uuid('node_id')
      .notNull()
      .references(() => memoryNodes.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_memory_glossary_keywords_instance_keyword_node').on(
      table.instanceId,
      table.keyword,
      table.nodeId,
    ),
    index('idx_memory_glossary_keywords_instance_id').on(table.instanceId),
    index('idx_memory_glossary_keywords_keyword').on(table.keyword),
    index('idx_memory_glossary_keywords_node_id').on(table.nodeId),
    index('idx_memory_glossary_keywords_tenant_id').on(table.tenantId),
    ...createDirectTenantPolicies('memory_glossary_keywords'),
  ],
);

export type MemoryGlossaryKeyword = typeof memoryGlossaryKeywords.$inferSelect;
export type NewMemoryGlossaryKeyword =
  typeof memoryGlossaryKeywords.$inferInsert;
