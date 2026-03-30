import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { organizations } from './organizations.schema';
import { createDirectTenantPolicies } from './rls-policies';
import { users } from './users.schema';

export interface BlockPort {
  id: string;
  label: string;
  dataType:
    | 'model'
    | 'text'
    | 'json'
    | 'image'
    | 'audio'
    | 'tool'
    | 'sandbox'
    | 'knowledge'
    | 'skill'
    | 'memory';
  sourceNodeId?: string;
  sourcePortId?: string;
}

export interface BlockDefinition {
  nodes: Array<Record<string, unknown>>;
  edges: Array<Record<string, unknown>>;
  inputPorts: BlockPort[];
  outputPorts: BlockPort[];
  viewport?: { x: number; y: number; zoom: number };
}

export interface BlockMetadata {
  nodeCount: number;
  author?: string;
  version: number;
  createdFromWorkflowId?: string;
  exportedAt?: string;
}

export const reusableBlocks = pgTable(
  'reusable_blocks',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuid_generate_v7()`),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id').notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),
    category: varchar('category', { length: 64 }),
    tags: text('tags')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    definition: jsonb('definition').$type<BlockDefinition>().notNull(),
    metadata: jsonb('metadata').$type<BlockMetadata>(),
    version: integer('version').notNull().default(1),
    isPublished: boolean('is_published').notNull().default(false),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('idx_reusable_blocks_org_id').on(table.orgId),
    index('idx_reusable_blocks_tags').using('gin', table.tags),
    ...createDirectTenantPolicies('reusable_blocks'),
  ],
);

export type ReusableBlock = typeof reusableBlocks.$inferSelect;
export type NewReusableBlock = typeof reusableBlocks.$inferInsert;
