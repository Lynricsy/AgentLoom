import { sql } from 'drizzle-orm';
import { pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

import { createJoinTenantPolicies } from './rls-policies';
import { sandboxSessions } from './sandbox-sessions.schema';

export const sandboxLogs = pgTable(
  'sandbox_logs',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuid_generate_v7()`),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => sandboxSessions.id, { onDelete: 'cascade' }),
    level: varchar('level', { length: 16 }).notNull(), // stdout / stderr / system
    message: text('message').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  () => [
    ...createJoinTenantPolicies(
      'sandbox_logs',
      'session_id',
      'sandbox_sessions',
    ),
  ],
);

export type SandboxLog = typeof sandboxLogs.$inferSelect;
export type NewSandboxLog = typeof sandboxLogs.$inferInsert;
