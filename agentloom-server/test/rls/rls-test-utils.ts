import * as fs from 'node:fs';
import * as path from 'node:path';
import postgres from 'postgres';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import * as schema from '../../src/database/schema/index';

import type { DrizzleDB } from '../../src/database/database.module';
export type { DrizzleDB };
export type TestSql = ReturnType<typeof postgres>;
export type OrganizationRole = (typeof schema.orgRoleEnum.enumValues)[number];

export type RlsTestContext = {
  container: StartedPostgreSqlContainer;
  adminSql: TestSql;
  drizzleClient: TestSql;
  db: DrizzleDB;
  reset: () => Promise<void>;
  close: () => Promise<void>;
};

const ROLE_SETUP_SQL = `
  DO $$
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_auth_admin') THEN
      CREATE ROLE supabase_auth_admin NOLOGIN;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      CREATE ROLE authenticated NOLOGIN;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
      CREATE ROLE anon NOLOGIN;
    END IF;
  END
  $$;
`;

function splitStatements(content: string) {
  return content
    .split(/-->\s*statement-breakpoint/g)
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
}

export async function createRlsTestContext(): Promise<RlsTestContext> {
  const container = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('testdb')
    .withUsername('testuser')
    .withPassword('testpass')
    .withStartupTimeout(120_000)
    .start();

  const connectionUri = container.getConnectionUri();
  const adminSql = postgres(connectionUri, { max: 1 });

  await adminSql.unsafe(ROLE_SETUP_SQL);
  await adminSql`CREATE SCHEMA IF NOT EXISTS auth`;
  await adminSql`
    CREATE TABLE auth.users (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      email text NOT NULL UNIQUE
    )
  `;

  const migrationsDir = path.join(__dirname, '../../src/database/migrations');
  const migrationFiles = fs
    .readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort();

  for (const file of migrationFiles) {
    const content = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');

    for (const statement of splitStatements(content)) {
      await adminSql.unsafe(statement);
    }
  }

  const drizzleClient = postgres(connectionUri, { max: 5 });
  const db = drizzle(drizzleClient, { schema });

  return {
    container,
    adminSql,
    drizzleClient,
    db,
    reset: async () => cleanupTables(adminSql),
    close: async () => {
      await drizzleClient.end();
      await adminSql.end();
      await container.stop();
    },
  };
}

export async function cleanupTables(sqlClient: TestSql) {
  await sqlClient`DELETE FROM "audit_log_archives"`;
  await sqlClient`DELETE FROM "audit_logs"`;
  await sqlClient`DELETE FROM "marketplace_listings"`;
  await sqlClient`DELETE FROM "reusable_blocks"`;
  await sqlClient`DELETE FROM "optimization_suggestions"`;
  await sqlClient`DELETE FROM "knowledge_nodes"`;
  await sqlClient`DELETE FROM "documents"`;
  await sqlClient`DELETE FROM "knowledge_bases"`;
  await sqlClient`DELETE FROM "workflow_definitions"`;
  await sqlClient`DELETE FROM "organization_invitations"`;
  await sqlClient`DELETE FROM "organization_members"`;
  await sqlClient`DELETE FROM "organizations"`;
  await sqlClient`DELETE FROM "revoked_tokens"`;
  await sqlClient`DELETE FROM "users"`;
  await sqlClient`DELETE FROM auth.users`;
}

export async function withTenantContext<T>(
  db: DrizzleDB,
  tenantId: string,
  operation: (db: DrizzleDB) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL ROLE authenticated`);
    await tx.execute(
      sql`SELECT set_config('app.current_tenant', ${tenantId}, true)`,
    );
    return operation(tx as unknown as DrizzleDB);
  });
}

export async function withoutTenantContext<T>(
  db: DrizzleDB,
  operation: (db: DrizzleDB) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL ROLE authenticated`);
    return operation(tx as unknown as DrizzleDB);
  });
}

export async function seedAuthUser(
  sqlClient: TestSql,
  id: string,
  email: string,
) {
  await sqlClient`
    INSERT INTO auth.users (id, email)
    VALUES (${id}::uuid, ${email})
  `;
}

export async function seedAppUser(
  sqlClient: TestSql,
  id: string,
  email: string,
) {
  await seedAuthUser(sqlClient, id, email);
  await sqlClient`
    INSERT INTO "users" (id, supabase_user_id, email)
    VALUES (${id}::uuid, ${id}::uuid, ${email})
  `;
}

export async function seedOrg(
  sqlClient: TestSql,
  id: string,
  name: string,
  slug: string,
  ownerId: string,
  tenantId: string,
) {
  const [organization] = await sqlClient`
    INSERT INTO organizations (id, name, slug, owner_id, tenant_id)
    VALUES (${id}::uuid, ${name}, ${slug}, ${ownerId}::uuid, ${tenantId}::uuid)
    RETURNING *
  `;

  return organization;
}

export async function seedMember(
  sqlClient: TestSql,
  orgId: string,
  userId: string,
  role: OrganizationRole,
  invitedBy: string,
) {
  const [member] = await sqlClient`
    INSERT INTO organization_members (organization_id, user_id, role, invited_by)
    VALUES (${orgId}::uuid, ${userId}::uuid, ${role}::org_role, ${invitedBy}::uuid)
    RETURNING *
  `;

  return member;
}

export async function seedInvitation(
  sqlClient: TestSql,
  orgId: string,
  email: string,
  role: OrganizationRole,
  invitedBy: string,
  token: string,
  expiresAt: Date,
) {
  const [invitation] = await sqlClient`
    INSERT INTO organization_invitations (
      organization_id,
      email,
      role,
      invited_by,
      token,
      expires_at
    )
    VALUES (
      ${orgId}::uuid,
      ${email},
      ${role}::org_role,
      ${invitedBy}::uuid,
      ${token},
      ${expiresAt}
    )
    RETURNING *
  `;

  return invitation;
}

export async function seedWorkflowDefinition(
  sqlClient: TestSql,
  options: {
    id: string;
    tenantId: string;
    name: string;
    slug: string;
    createdBy: string;
    updatedBy: string;
    description?: string;
    nodes?: readonly postgres.JSONValue[];
    edges?: readonly postgres.JSONValue[];
    viewport?: postgres.JSONValue;
    inputSchema?: postgres.JSONValue;
    version?: number;
    status?: (typeof schema.workflowStatusEnum.enumValues)[number];
  },
) {
  const [row] = await sqlClient`
    INSERT INTO workflow_definitions (
      id, tenant_id, name, slug, description,
      nodes, edges, viewport, input_schema,
      version, status, created_by, updated_by
    )
    VALUES (
      ${options.id}::uuid,
      ${options.tenantId}::uuid,
      ${options.name},
      ${options.slug},
      ${options.description ?? null},
      ${sqlClient.json(options.nodes ?? [])},
      ${sqlClient.json(options.edges ?? [])},
      ${options.viewport ? sqlClient.json(options.viewport) : null},
      ${options.inputSchema ? sqlClient.json(options.inputSchema) : null},
      ${options.version ?? 1},
      ${options.status ?? 'draft'}::workflow_status_enum,
      ${options.createdBy}::uuid,
      ${options.updatedBy}::uuid
    )
    RETURNING *
  `;

  return row;
}

export function getErrorText(error: unknown) {
  if (!(error instanceof Error)) {
    return String(error);
  }

  const messages = [error.message];

  if (error.cause instanceof Error) {
    messages.push(error.cause.message);
  }

  return messages.join('\n');
}
