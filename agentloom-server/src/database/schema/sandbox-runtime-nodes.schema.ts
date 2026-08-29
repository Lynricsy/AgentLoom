import { pgEnum, pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';

export const sandboxRuntimeNodeStatusEnum = pgEnum(
  'sandbox_runtime_node_status_enum',
  ['active', 'draining', 'disabled'],
);

/**
 * 分布式沙箱运行时节点注册表。
 *
 * 平台级基础设施表，故意不带 tenant_id、不挂 tenant RLS policy：
 * 节点是所有租户共享的物理资源，租户隔离由管理 API 的鉴权门
 * （SandboxRuntimeNodeRegistryService.assertNodeAdmin）保证。
 */
export const sandboxRuntimeNodes = pgTable('sandbox_runtime_nodes', {
  /** 节点标识，编码进 sandbox_sessions.runtime_handle 前缀；^[a-z0-9][a-z0-9-]{0,31}$ */
  id: varchar('id', { length: 32 }).primaryKey(),
  /** runtime-manager 的 mTLS 基址，必须 https://，不含尾部斜杠 */
  baseUrl: varchar('base_url', { length: 256 }).notNull(),
  /** TLS SNI / 证书校验用的服务名；null 时取 baseUrl 的 hostname */
  serverName: varchar('server_name', { length: 128 }),
  status: sandboxRuntimeNodeStatusEnum('status').notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type SandboxRuntimeNode = typeof sandboxRuntimeNodes.$inferSelect;
export type NewSandboxRuntimeNode = typeof sandboxRuntimeNodes.$inferInsert;
