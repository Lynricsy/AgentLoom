import { sql } from 'drizzle-orm';
import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  jsonb,
  boolean,
  timestamp,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { users } from './users.schema';
import { createDirectTenantPolicies } from './rls-policies';

export const notificationTypeEnum = pgEnum('notification_type_enum', [
  'execution_completed',
  'execution_failed',
  'intervention_required',
  'system',
]);

export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuid_generate_v7()`),

    tenantId: uuid('tenant_id').notNull(),

    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    type: notificationTypeEnum('type').notNull(),
    title: varchar('title', { length: 256 }).notNull(),
    body: jsonb('body').$type<Record<string, unknown>>(),

    isRead: boolean('is_read').notNull().default(false),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('idx_notifications_user_tenant_read_created').on(
      table.userId,
      table.tenantId,
      table.isRead,
      table.createdAt,
    ),
    index('idx_notifications_tenant_id').on(table.tenantId),
    ...createDirectTenantPolicies('notifications'),
  ],
);

export const notificationPreferences = pgTable(
  'notification_preferences',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuid_generate_v7()`),

    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    tenantId: uuid('tenant_id').notNull(),

    type: notificationTypeEnum('type').notNull(),
    channel: varchar('channel', { length: 32 }).notNull(),
    enabled: boolean('enabled').notNull().default(true),
  },
  (table) => [
    uniqueIndex('uq_notification_preferences_user_tenant_type_channel').on(
      table.userId,
      table.tenantId,
      table.type,
      table.channel,
    ),
    index('idx_notification_preferences_tenant_id').on(table.tenantId),
    ...createDirectTenantPolicies('notification_preferences'),
  ],
);

export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;
export type NotificationPreference =
  typeof notificationPreferences.$inferSelect;
export type NewNotificationPreference =
  typeof notificationPreferences.$inferInsert;
