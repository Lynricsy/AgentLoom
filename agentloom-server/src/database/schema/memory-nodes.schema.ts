import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  jsonb,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { agentMemoryInstances } from './agent-memory-instances.schema';
import { createDirectTenantPolicies } from './rls-policies';

export interface MemoryNodeMetadata {
  [key: string]: unknown;
}

export const memoryNodes = pgTable(
  'memory_nodes',
  {
    id: uuid('id').primaryKey().default(sql`uuid_generate_v7()`),
    instanceId: uuid('instance_id')
      .notNull()
      .references(() => agentMemoryInstances.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id').notNull(),
    contentType: varchar('content_type', { length: 64 })
      .notNull()
      .default('text'),
    metadata: jsonb('metadata').$type<MemoryNodeMetadata>(),
    disclosureLevel: integer('disclosure_level').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('idx_memory_nodes_instance_id').on(table.instanceId),
    index('idx_memory_nodes_tenant_id').on(table.tenantId),
    ...createDirectTenantPolicies('memory_nodes'),
  ],
);

export type MemoryNode = typeof memoryNodes.$inferSelect;
export type NewMemoryNode = typeof memoryNodes.$inferInsert;
