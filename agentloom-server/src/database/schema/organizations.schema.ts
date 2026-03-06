import { sql } from 'drizzle-orm';
import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  boolean,
  timestamp,
  jsonb,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';
import { users } from './users.schema';
import {
  createDirectTenantPolicies,
  createJoinTenantPolicies,
} from './rls-policies';

export const orgRoleEnum = pgEnum('org_role', [
  'owner',
  'admin',
  'creator',
  'operator',
  'viewer',
]);

export const invitationStatusEnum = pgEnum('invitation_status', [
  'pending',
  'accepted',
  'expired',
  'cancelled',
]);

export const organizations = pgTable(
  'organizations',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuid_generate_v7()`),
    name: varchar('name', { length: 255 }).notNull(),
    slug: varchar('slug', { length: 100 }).notNull().unique(),
    tenantId: uuid('tenant_id')
      .notNull()
      .default(sql`uuid_generate_v7()`)
      .unique(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    description: varchar('description', { length: 500 }),
    settings: jsonb('settings').$type<Record<string, unknown>>(),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('idx_organizations_slug').on(table.slug),
    uniqueIndex('idx_organizations_tenant_id').on(table.tenantId),
    ...createDirectTenantPolicies('organizations'),
  ],
);

export const organizationMembers = pgTable(
  'organization_members',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuid_generate_v7()`),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: orgRoleEnum('role').notNull().default('viewer'),
    invitedBy: uuid('invited_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    joinedAt: timestamp('joined_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('idx_org_members_org_user').on(
      table.organizationId,
      table.userId,
    ),
    index('idx_org_members_user_id').on(table.userId),
    ...createJoinTenantPolicies(
      'organization_members',
      'organization_id',
      'organizations',
    ),
  ],
);

export const organizationInvitations = pgTable(
  'organization_invitations',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuid_generate_v7()`),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    email: varchar('email', { length: 255 }).notNull(),
    role: orgRoleEnum('role').notNull().default('viewer'),
    token: varchar('token', { length: 255 }).notNull().unique(),
    invitedBy: uuid('invited_by')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    status: invitationStatusEnum('status').notNull().default('pending'),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    acceptedBy: uuid('accepted_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('idx_org_invitations_token').on(table.token),
    index('idx_org_invitations_email').on(table.email),
    uniqueIndex('idx_org_invitations_org_email_pending')
      .on(table.organizationId, table.email)
      .where(sql`${table.status} = 'pending'`),
    ...createJoinTenantPolicies(
      'organization_invitations',
      'organization_id',
      'organizations',
    ),
  ],
);

export type Organization = typeof organizations.$inferSelect;
export type NewOrganization = typeof organizations.$inferInsert;
export type OrganizationMember = typeof organizationMembers.$inferSelect;
export type NewOrganizationMember = typeof organizationMembers.$inferInsert;
export type OrganizationInvitation =
  typeof organizationInvitations.$inferSelect;
export type NewOrganizationInvitation =
  typeof organizationInvitations.$inferInsert;
