import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { createDirectTenantPolicies } from './rls-policies';

export interface MemoryInstanceConfig {
  [key: string]: unknown;
}

export const memoryInstanceStatusEnum = pgEnum('memory_instance_status', [
  'active',
  'archived',
  'deleted',
]);

export const agentMemoryInstances = pgTable(
  'agent_memory_instances',
  {
    id: uuid('id').primaryKey().default(sql`uuid_generate_v7()`),
    tenantId: uuid('tenant_id').notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),
    config: jsonb('config').$type<MemoryInstanceConfig>(),
    systemPromptOverride: text('system_prompt_override'),
    validDomains: text('valid_domains')
      .array()
      .notNull()
      .default(sql`ARRAY['core', 'notes']::text[]`),
    coreMemoryUris: text('core_memory_uris')
      .array()
      .notNull()
      .default(sql`ARRAY['core://agent']::text[]`),
    status: memoryInstanceStatusEnum('status').notNull().default('active'),
    occVersion: integer('occ_version').notNull().default(1),
    createdBy: uuid('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('idx_agent_memory_instances_tenant_id').on(table.tenantId),
    index('idx_agent_memory_instances_created_by').on(table.createdBy),
    index('idx_agent_memory_instances_status').on(table.status),
    ...createDirectTenantPolicies('agent_memory_instances'),
  ],
);

export type MemoryInstance = typeof agentMemoryInstances.$inferSelect;
export type NewMemoryInstance = typeof agentMemoryInstances.$inferInsert;
