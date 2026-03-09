import { sql } from 'drizzle-orm';
import {
  index,
  jsonb,
  pgEnum,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { createDirectTenantPolicies } from './rls-policies';
import { workflowExecutions } from './workflow-executions.schema';

export const sandboxSessionStatusEnum = pgEnum('sandbox_session_status_enum', [
  'creating',
  'ready',
  'busy',
  'stopping',
  'stopped',
  'failed',
]);

export interface SandboxConfig {
  /** CPU 核数 (0.5-4) */
  cpu: number;
  /** 内存 MB (256-4096) */
  memory: number;
  /** 磁盘 GB (1-10) */
  disk: number;
  /** 持久化路径（可选，指向 MinIO） */
  persistencePath?: string;
  /** 超时时间（小时，1-24） */
  timeout: number;
}

export const sandboxSessions = pgTable(
  'sandbox_sessions',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuid_generate_v7()`),
    executionId: uuid('execution_id')
      .notNull()
      .references(() => workflowExecutions.id, { onDelete: 'cascade' }),
    sandboxNodeId: varchar('sandbox_node_id', { length: 64 }).notNull(),
    tenantId: uuid('tenant_id').notNull(),
    containerId: varchar('container_id', { length: 128 }),
    status: sandboxSessionStatusEnum('status').notNull().default('creating'),
    config: jsonb('config').notNull().$type<SandboxConfig>(),
    workspacePath: varchar('workspace_path', { length: 256 }),
    startedAt: timestamp('started_at', { withTimezone: true }),
    stoppedAt: timestamp('stopped_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('idx_sandbox_sessions_execution_id').on(table.executionId),
    index('idx_sandbox_sessions_tenant_status').on(
      table.tenantId,
      table.status,
    ),
    ...createDirectTenantPolicies('sandbox_sessions'),
  ],
);

export type SandboxSession = typeof sandboxSessions.$inferSelect;
export type NewSandboxSession = typeof sandboxSessions.$inferInsert;
