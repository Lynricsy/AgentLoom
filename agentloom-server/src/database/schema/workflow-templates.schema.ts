import { sql } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  jsonb,
  boolean,
  timestamp,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import type {
  ReactFlowNode,
  ReactFlowEdge,
  ReactFlowViewport,
} from './workflow-definitions.schema';
import type { WorkflowInputSchema } from '../../modules/workflow/dto/workflow-input-schema.dto';

export interface TemplateDefinition {
  nodes: ReactFlowNode[];
  edges: ReactFlowEdge[];
  viewport: ReactFlowViewport;
  inputSchema?: WorkflowInputSchema;
}

export interface TemplateMetadata {
  author?: string;
  version?: string;
  estimated_runtime_seconds?: number;
  complexity?: 'beginner' | 'intermediate' | 'advanced';
  node_count?: number;
  required_capabilities?: string[];
  [key: string]: unknown;
}

/**
 * 工作流模板表 — 无 RLS，无 tenant_id（全局公共数据）
 */
export const workflowTemplates = pgTable(
  'workflow_templates',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuid_generate_v7()`),

    slug: varchar('slug', { length: 128 }).notNull().unique(),
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),
    category: varchar('category', { length: 64 }).notNull(),
    tags: text('tags')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    thumbnailUrl: varchar('thumbnail_url', { length: 512 }),

    definition: jsonb('definition').$type<TemplateDefinition>().notNull(),
    metadata: jsonb('metadata').$type<TemplateMetadata>().notNull().default({}),

    isPublished: boolean('is_published').notNull().default(true),
    displayOrder: integer('display_order').notNull().default(0),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_workflow_templates_slug').on(table.slug),
    index('idx_workflow_templates_category_published')
      .on(table.category)
      .where(sql`is_published = true`),
    index('idx_workflow_templates_tags_published')
      .using('gin', table.tags)
      .where(sql`is_published = true`),
  ],
);

export type WorkflowTemplate = typeof workflowTemplates.$inferSelect;
export type NewWorkflowTemplate = typeof workflowTemplates.$inferInsert;
