import { sql } from 'drizzle-orm';
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  varchar,
  timestamp,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { organizations } from './organizations.schema';
import { createDirectTenantPolicies } from './rls-policies';

export const encryptionKeyStatusEnum = pgEnum('encryption_key_status', [
  'active',
  'rotating',
  'revoked',
]);

export const tenantEncryptionKeys = pgTable(
  'tenant_encryption_keys',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuid_generate_v7()`),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id').notNull(),
    publicKey: text('public_key').notNull(),
    keyFingerprint: varchar('key_fingerprint', { length: 64 }).notNull(),
    status: encryptionKeyStatusEnum('status').notNull().default('active'),
    activatedAt: timestamp('activated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    rotatedAt: timestamp('rotated_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_tenant_encryption_keys_org_fingerprint').on(
      table.organizationId,
      table.keyFingerprint,
    ),
    uniqueIndex('uq_tenant_encryption_keys_org_active')
      .on(table.organizationId)
      .where(sql`${table.status} = 'active'`),
    index('idx_tenant_encryption_keys_tenant_id').on(table.tenantId),
    index('idx_tenant_encryption_keys_fingerprint').on(table.keyFingerprint),
    index('idx_tenant_encryption_keys_status').on(table.status),
    ...createDirectTenantPolicies('tenant_encryption_keys'),
  ],
);

export type TenantEncryptionKey = typeof tenantEncryptionKeys.$inferSelect;
export type NewTenantEncryptionKey = typeof tenantEncryptionKeys.$inferInsert;
