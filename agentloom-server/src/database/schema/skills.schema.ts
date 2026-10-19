import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { authenticatedRole } from 'drizzle-orm/supabase';

import { getTenantId } from './rls-helpers';
import { users } from './users.schema';

/** 内置 Skill 种子行所属的哨兵租户（见 database/seeds/skill-seeds.ts）。 */
export const BUILTIN_SKILL_TENANT_ID = '00000000-0000-0000-0000-000000000000';

const skillTenantCheck = sql`tenant_id = ${getTenantId}`;
// 租户只能写入/改成非内置行，防止把自己的行标成 is_builtin 后借 SELECT 策略暴露给其他租户。
const skillTenantWriteCheck = sql`tenant_id = ${getTenantId} AND NOT is_builtin`;

export const skills = pgTable(
  'skills',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuid_generate_v7()`),
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
    // 内置 Skill 存在哨兵租户下，对所有租户只读可见；UPDATE/DELETE 仍只命中本租户行。
    pgPolicy('skills_select_policy', {
      for: 'select',
      to: authenticatedRole,
      using: sql`tenant_id = ${getTenantId} OR (is_builtin AND tenant_id = ${sql.raw(`'${BUILTIN_SKILL_TENANT_ID}'::uuid`)})`,
    }),
    pgPolicy('skills_insert_policy', {
      for: 'insert',
      to: authenticatedRole,
      withCheck: skillTenantWriteCheck,
    }),
    pgPolicy('skills_update_policy', {
      for: 'update',
      to: authenticatedRole,
      using: skillTenantCheck,
      withCheck: skillTenantWriteCheck,
    }),
    pgPolicy('skills_delete_policy', {
      for: 'delete',
      to: authenticatedRole,
      using: skillTenantCheck,
    }),
  ],
);

export type SkillRecord = typeof skills.$inferSelect;
export type NewSkill = typeof skills.$inferInsert;
