import {
  integer,
  jsonb,
  pgTable,
  text,
  uuid,
  timestamp,
  index,
  varchar,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

import { documents, knowledgeBases } from './knowledge-bases.schema';
import { createDirectTenantPolicies } from './rls-policies';

export const knowledgeNodes = pgTable(
  'knowledge_nodes',
  {
    id: text('id').primaryKey(),
    documentId: uuid('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id').notNull(),
    knowledgeBaseId: uuid('knowledge_base_id')
      .notNull()
      .references(() => knowledgeBases.id, { onDelete: 'cascade' }),
    nodeIndex: integer('node_index').notNull(),
    nodeType: varchar('node_type', { length: 64 }).notNull(),
    content: text('content').notNull(),
    tokenCount: integer('token_count').notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (table) => [
    index('knowledge_nodes_document_id_idx').on(table.documentId),
    index('knowledge_nodes_tenant_id_idx').on(table.tenantId),
    index('knowledge_nodes_knowledge_base_id_idx').on(table.knowledgeBaseId),
    index('knowledge_nodes_document_node_idx').on(
      table.documentId,
      table.nodeIndex,
    ),
    uniqueIndex('knowledge_nodes_document_node_unique').on(
      table.documentId,
      table.nodeIndex,
    ),
    ...createDirectTenantPolicies('knowledge_nodes'),
  ],
);

export type KnowledgeNodeRow = typeof knowledgeNodes.$inferSelect;
export type NewKnowledgeNode = typeof knowledgeNodes.$inferInsert;
