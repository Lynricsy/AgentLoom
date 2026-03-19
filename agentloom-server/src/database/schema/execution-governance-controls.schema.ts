import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  pgEnum,
  pgTable,
  timestamp,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { createDirectTenantPolicies } from './rls-policies';
import { organizations } from './organizations.schema';
import { users } from './users.schema';

export const executionGovernanceStateEnum = pgEnum(
  'execution_governance_state_enum',
  ['active', 'paused'],
);

export const governanceScopeEnum = pgEnum('governance_scope_enum', [
  'tenant',
  'workflow',
]);

export type ExecutionGovernanceState = 'active' | 'paused';
export type GovernanceScope = 'tenant' | 'workflow';

export const executionGovernanceControls = pgTable(
  'execution_governance_controls',
  {
    id: uuid('id').primaryKey().default(sql`uuid_generate_v7()`),

    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),

    tenantId: uuid('tenant_id').notNull(),

    scope: governanceScopeEnum('scope').notNull(),

    targetId: uuid('target_id').notNull(),

    status: executionGovernanceStateEnum('status')
      .notNull()
      .default('active'),

    reason: text('reason'),

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
    uniqueIndex('uq_execution_governance_controls_target').on(
      table.organizationId,
      table.scope,
      table.targetId,
    ),
    index('idx_execution_governance_controls_tenant').on(table.tenantId),
    index('idx_execution_governance_controls_scope').on(
      table.organizationId,
      table.scope,
    ),
    ...createDirectTenantPolicies('execution_governance_controls'),
  ],
);

export type ExecutionGovernanceControl =
  typeof executionGovernanceControls.$inferSelect;
export type NewExecutionGovernanceControl =
  typeof executionGovernanceControls.$inferInsert;
