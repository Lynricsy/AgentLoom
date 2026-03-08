import {
  integer,
  jsonb,
  pgTable,
  text,
  uuid,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { documents } from './knowledge-bases.schema';
import { createDirectTenantPolicies } from './rls-policies';
import type { PhysicalLocation } from '../../modules/knowledge/interfaces/document-parser.interface';

export const documentChunks = pgTable(
  'document_chunks',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuid_generate_v7()`),
    documentId: uuid('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id').notNull(),
    knowledgeBaseId: uuid('knowledge_base_id').notNull(),
    chunkIndex: integer('chunk_index').notNull(),
    content: text('content').notNull(),
    metadata: jsonb('metadata').$type<PhysicalLocation>().notNull(),
    tokenCount: integer('token_count').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (table) => [
    index('document_chunks_document_id_idx').on(table.documentId),
    index('document_chunks_tenant_id_idx').on(table.tenantId),
    index('document_chunks_knowledge_base_id_idx').on(table.knowledgeBaseId),
    index('document_chunks_document_chunk_idx').on(
      table.documentId,
      table.chunkIndex,
    ),
    ...createDirectTenantPolicies('document_chunks'),
  ],
);

export type DocumentChunkRow = typeof documentChunks.$inferSelect;
export type NewDocumentChunk = typeof documentChunks.$inferInsert;
