import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { createDirectTenantPolicies } from './rls-policies';
import { users } from './users.schema';

export const skills = pgTable(
  'skills',
  {
    id: uuid('id').primaryKey().default(sql`uuid_generate_v7()`),
    tenantId: uuid('tenant_id').notNull(),
    name: varchar('name', { length: 128 }).notNull(),
    slug: varchar('slug', { length: 128 }).notNull(),
    description: text('description').notNull(),
    content: text('content'),
    frontmatter: jsonb('frontmatter').$type<Record<string, unknown>>(),
    isBuiltin: boolean('is_builtin').notNull().default(false),
    status: varchar('status', { length: 20 }).notNull().default('active'),
    fileCount: integer('file_count').notNull().default(1),
    totalSizeBytes: bigint('total_size_bytes', { mode: 'number' })
      .notNull()
      .default(0),
    version: integer('version').notNull().default(1),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
    updatedBy: uuid('updated_by')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('skills_tenant_name_idx').on(table.tenantId, table.name),
    uniqueIndex('skills_tenant_slug_idx').on(table.tenantId, table.slug),
    index('skills_tenant_status_idx').on(table.tenantId, table.status),
    index('skills_is_builtin_idx').on(table.isBuiltin),
    ...createDirectTenantPolicies('skills'),
  ],
);

export type SkillRecord = typeof skills.$inferSelect;
export type NewSkill = typeof skills.$inferInsert;
