import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { bytea } from './api-keys.schema';
import { organizations } from './organizations.schema';
import { createDirectTenantPolicies } from './rls-policies';
import { users } from './users.schema';

export const privateCloudAuthMethodEnum = pgEnum('private_cloud_auth_method', [
  'none',
  'api_key',
]);

export const privateDeploymentCertificateSourceEnum = pgEnum(
  'private_deployment_certificate_source',
  ['none', 'uploaded', 'tls_secret_ref'],
);

export const privateDeploymentSettings = pgTable(
  'private_deployment_settings',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuid_generate_v7()`),

    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),

    tenantId: uuid('tenant_id').notNull(),

    smtpHost: varchar('smtp_host', { length: 255 }),
    smtpPort: integer('smtp_port'),
    smtpUsername: varchar('smtp_username', { length: 255 }),
    smtpFromEmail: varchar('smtp_from_email', { length: 320 }),
    smtpUseTls: boolean('smtp_use_tls').notNull().default(false),
    smtpPasswordEncryptedKey: bytea('smtp_password_encrypted_key'),
    smtpPasswordEncryptedDek: bytea('smtp_password_encrypted_dek'),
    smtpPasswordIv: bytea('smtp_password_iv'),
    smtpPasswordAuthTag: bytea('smtp_password_auth_tag'),

    privateCloudEndpointUrl: varchar('private_cloud_endpoint_url', {
      length: 512,
    }),
    privateCloudAuthMethod: privateCloudAuthMethodEnum(
      'private_cloud_auth_method',
    )
      .notNull()
      .default('none'),
    privateCloudAllowExternalEgress: boolean(
      'private_cloud_allow_external_egress',
    )
      .notNull()
      .default(false),
    privateCloudApiKeyEncryptedKey: bytea(
      'private_cloud_api_key_encrypted_key',
    ),
    privateCloudApiKeyEncryptedDek: bytea(
      'private_cloud_api_key_encrypted_dek',
    ),
    privateCloudApiKeyIv: bytea('private_cloud_api_key_iv'),
    privateCloudApiKeyAuthTag: bytea('private_cloud_api_key_auth_tag'),

    certificateSource: privateDeploymentCertificateSourceEnum(
      'certificate_source',
    )
      .notNull()
      .default('none'),
    certificateTlsSecretRef: varchar('certificate_tls_secret_ref', {
      length: 255,
    }),
    certificateExpiresAt: timestamp('certificate_expires_at', {
      withTimezone: true,
    }),
    certificatePemEncryptedKey: bytea('certificate_pem_encrypted_key'),
    certificatePemEncryptedDek: bytea('certificate_pem_encrypted_dek'),
    certificatePemIv: bytea('certificate_pem_iv'),
    certificatePemAuthTag: bytea('certificate_pem_auth_tag'),
    certificatePrivateKeyEncryptedKey: bytea(
      'certificate_private_key_encrypted_key',
    ),
    certificatePrivateKeyEncryptedDek: bytea(
      'certificate_private_key_encrypted_dek',
    ),
    certificatePrivateKeyIv: bytea('certificate_private_key_iv'),
    certificatePrivateKeyAuthTag: bytea('certificate_private_key_auth_tag'),

    licenseKeyEncryptedKey: bytea('license_key_encrypted_key'),
    licenseKeyEncryptedDek: bytea('license_key_encrypted_dek'),
    licenseKeyIv: bytea('license_key_iv'),
    licenseKeyAuthTag: bytea('license_key_auth_tag'),

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
    uniqueIndex('uq_private_deployment_settings_org').on(table.organizationId),
    index('idx_private_deployment_settings_tenant').on(table.tenantId),
    ...createDirectTenantPolicies('private_deployment_settings'),
  ],
);

export type PrivateDeploymentSetting =
  typeof privateDeploymentSettings.$inferSelect;
export type NewPrivateDeploymentSetting =
  typeof privateDeploymentSettings.$inferInsert;
