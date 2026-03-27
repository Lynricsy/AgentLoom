import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { agentMemoryInstances } from './agent-memory-instances.schema';
import { memoryNodes } from './memory-nodes.schema';
import { createDirectTenantPolicies } from './rls-policies';

export const memoryEdges = pgTable(
  'memory_edges',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuid_generate_v7()`),
    instanceId: uuid('instance_id')
      .notNull()
      .references(() => agentMemoryInstances.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id').notNull(),
    parentNodeId: uuid('parent_node_id')
      .notNull()
      .references(() => memoryNodes.id, { onDelete: 'cascade' }),
    childNodeId: uuid('child_node_id')
      .notNull()
      .references(() => memoryNodes.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 256 }),
    priority: integer('priority').notNull().default(0),
    disclosure: integer('disclosure').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_memory_edges_instance_parent_child').on(
      table.instanceId,
      table.parentNodeId,
      table.childNodeId,
    ),
    index('idx_memory_edges_instance_id').on(table.instanceId),
    index('idx_memory_edges_parent_node_id').on(table.parentNodeId),
    index('idx_memory_edges_child_node_id').on(table.childNodeId),
    index('idx_memory_edges_tenant_id').on(table.tenantId),
    ...createDirectTenantPolicies('memory_edges'),
  ],
);

export type MemoryEdge = typeof memoryEdges.$inferSelect;
export type NewMemoryEdge = typeof memoryEdges.$inferInsert;
