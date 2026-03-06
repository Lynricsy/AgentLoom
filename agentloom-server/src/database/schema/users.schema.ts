import { sql } from 'drizzle-orm';
import {
  pgTable,
  pgSchema,
  uuid,
  varchar,
  boolean,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

/**
 * Supabase auth schema 引用 - 仅用于跨 schema FK 约束
 */
const authSchema = pgSchema('auth');
const authUsers = authSchema.table('users', {
  id: uuid('id').primaryKey(),
});

/**
 * 用户表 - 应用层用户记录
 * 与 Supabase auth.users 通过 supabase_user_id 关联
 */
export const users = pgTable(
  'users',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuid_generate_v7()`),
    supabaseUserId: uuid('supabase_user_id')
      .notNull()
      .unique()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    email: varchar('email', { length: 255 }).notNull().unique(),
    displayName: varchar('display_name', { length: 100 }),
    avatarUrl: varchar('avatar_url', { length: 500 }),
    isActive: boolean('is_active').notNull().default(true),
    currentOrganizationId: uuid('current_organization_id'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    uniqueIndex('idx_users_email').on(table.email),
    uniqueIndex('idx_users_supabase_user_id').on(table.supabaseUserId),
  ],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
