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
import { memoryEdges } from './memory-edges.schema';
import { memoryNodes } from './memory-nodes.schema';
import { createDirectTenantPolicies } from './rls-policies';

export const memoryPaths = pgTable(
  'memory_paths',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuid_generate_v7()`),
    instanceId: uuid('instance_id')
      .notNull()
      .references(() => agentMemoryInstances.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id').notNull(),
    domain: varchar('domain', { length: 64 }).notNull(),
    pathString: varchar('path_string', { length: 512 }).notNull(),
    edgeId: uuid('edge_id').references(() => memoryEdges.id, {
      onDelete: 'set null',
    }),
    nodeId: uuid('node_id')
      .notNull()
      .references(() => memoryNodes.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_memory_paths_instance_domain_path').on(
      table.instanceId,
      table.domain,
      table.pathString,
    ),
    index('idx_memory_paths_instance_domain').on(
      table.instanceId,
      table.domain,
    ),
    index('idx_memory_paths_node_id').on(table.nodeId),
    index('idx_memory_paths_tenant_id').on(table.tenantId),
    ...createDirectTenantPolicies('memory_paths'),
  ],
);

export type MemoryPath = typeof memoryPaths.$inferSelect;
export type NewMemoryPath = typeof memoryPaths.$inferInsert;
