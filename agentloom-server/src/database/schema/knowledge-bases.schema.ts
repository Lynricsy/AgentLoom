import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  integer,
  index,
  pgEnum,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { createDirectTenantPolicies } from './rls-policies';
import { llmModelConfigs } from './llm-model-configs.schema';

export const knowledgeBaseVisibilityEnum = pgEnum('knowledge_base_visibility', [
  'private',
  'organization',
]);

export const documentStatusEnum = pgEnum('document_status', [
  'uploaded',
  'processing',
  'ready',
  'failed',
]);

export const knowledgeBases = pgTable(
  'knowledge_bases',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuid_generate_v7()`),
    tenantId: uuid('tenant_id').notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),
    visibility: knowledgeBaseVisibilityEnum('visibility')
      .notNull()
      .default('private'),
    chunkSize: integer('chunk_size').notNull().default(512),
    chunkOverlap: integer('chunk_overlap').notNull().default(64),
    embeddingModel: varchar('embedding_model', { length: 255 })
      .notNull()
      .default('text-embedding-3-small'),
    embeddingModelConfigId: uuid('embedding_model_config_id').references(
      () => llmModelConfigs.id,
      { onDelete: 'set null' },
    ),
    createdBy: uuid('created_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('idx_knowledge_bases_tenant_id').on(table.tenantId),
    index('idx_knowledge_bases_created_by').on(table.createdBy),
    index('idx_knowledge_bases_updated_at').on(table.updatedAt),
    ...createDirectTenantPolicies('knowledge_bases'),
  ],
);

export const documents = pgTable(
  'documents',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuid_generate_v7()`),
    knowledgeBaseId: uuid('knowledge_base_id')
      .notNull()
      .references(() => knowledgeBases.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id').notNull(),
    fileName: varchar('file_name', { length: 1024 }).notNull(),
    mimeType: varchar('mime_type', { length: 255 }).notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    storageKey: varchar('storage_key', { length: 2048 }).notNull(),
    status: documentStatusEnum('status').notNull().default('uploaded'),
    errorMessage: text('error_message'),
    uploadedBy: uuid('uploaded_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('idx_documents_knowledge_base_id').on(table.knowledgeBaseId),
    index('idx_documents_tenant_id').on(table.tenantId),
    index('idx_documents_status').on(table.status),
    index('idx_documents_updated_at').on(table.updatedAt),
    ...createDirectTenantPolicies('documents'),
  ],
);

export type KnowledgeBase = typeof knowledgeBases.$inferSelect;
export type NewKnowledgeBase = typeof knowledgeBases.$inferInsert;
export type Document = typeof documents.$inferSelect;
export type NewDocument = typeof documents.$inferInsert;
