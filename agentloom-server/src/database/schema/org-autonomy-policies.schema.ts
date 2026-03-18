import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { createDirectTenantPolicies } from './rls-policies';
import { organizations } from './organizations.schema';
import { users } from './users.schema';

export const organizationAutonomyPolicies = pgTable(
  'organization_autonomy_policies',
  {
    id: uuid().primaryKey().default(sql`uuid_generate_v7()`),

    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),

    tenantId: uuid('tenant_id').notNull(),

    autonomyCap: varchar('autonomy_cap', { length: 32 })
      .notNull()
      .default('LLM_SUGGEST'),

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
    uniqueIndex('uq_organization_autonomy_policies_org').on(table.organizationId),
    index('idx_organization_autonomy_policies_tenant').on(table.tenantId),
    ...createDirectTenantPolicies('organization_autonomy_policies'),
  ],
);

export type OrganizationAutonomyPolicy =
  typeof organizationAutonomyPolicies.$inferSelect;
export type NewOrganizationAutonomyPolicy =
  typeof organizationAutonomyPolicies.$inferInsert;
