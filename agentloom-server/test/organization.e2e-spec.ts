import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  afterAll,
  beforeEach,
} from 'vitest';
import { Test } from '@nestjs/testing';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import * as jwt from 'jsonwebtoken';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { AppModule } from '../src/app.module';
import { RedisCacheService } from '../src/common/redis/redis-cache.service';
import { REDIS_CLIENT } from '../src/common/redis/redis.constants';
import { RedisPubSubService } from '../src/common/redis/redis-pubsub.service';
import { DRIZZLE, type DrizzleDB } from '../src/database/database.module';
import { SupabaseService } from '../src/modules/auth/supabase/supabase.service';
import * as schema from '../src/database/schema';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { ZodValidationPipe } from '../src/common/pipes/zod-validation.pipe';

const JWT_SECRET = 'test-e2e-jwt-secret';

type OrganizationRole = 'owner' | 'admin' | 'creator' | 'operator' | 'viewer';

type TestUser = {
  id: string;
  email: string;
};

type AuthenticatedTestUser = TestUser & {
  tenantId?: string;
  tenantRole?: OrganizationRole;
};

type HookEvent = {
  user_id: string;
  claims: Record<string, unknown>;
};

const originalStringToISOString = Reflect.get(String.prototype, 'toISOString');

function signToken(payload: Record<string, unknown>) {
  return jwt.sign(payload, JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: '1h',
  });
}

function authHeaders(user: AuthenticatedTestUser) {
  const claims: Record<string, unknown> = {
    sub: user.id,
    email: user.email,
    aud: 'authenticated',
    jti: crypto.randomUUID(),
  };

  if (user.tenantId) {
    claims.tenant_id = user.tenantId;
  }

  if (user.tenantRole) {
    claims.tenant_role = user.tenantRole;
  }

  return {
    authorization: `Bearer ${signToken(claims)}`,
  };
}

function createMockSupabaseService() {
  return {
    signUp: vi.fn(),
    signIn: vi.fn(),
    refreshToken: vi.fn(),
    signOut: vi.fn(),
    getUser: vi.fn(),
  };
}

function createMockRedisClient() {
  return {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue('OK'),
    del: vi.fn().mockResolvedValue(0),
    keys: vi.fn().mockResolvedValue([]),
    quit: vi.fn().mockResolvedValue('OK'),
    publish: vi.fn().mockResolvedValue(1),
  };
}

function createMockRedisCacheService() {
  return {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
    del: vi.fn().mockResolvedValue(undefined),
    delByPattern: vi.fn().mockResolvedValue(undefined),
    onModuleDestroy: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockRedisPubSubService() {
  return {
    publish: vi.fn().mockResolvedValue(undefined),
    onModuleInit: vi.fn().mockResolvedValue(undefined),
    onModuleDestroy: vi.fn().mockResolvedValue(undefined),
  };
}

function withTenantContext(
  user: TestUser,
  tenantId: string,
  tenantRole: OrganizationRole,
): AuthenticatedTestUser {
  return {
    ...user,
    tenantId,
    tenantRole,
  };
}

function createTestUser(prefix: string): TestUser {
  const suffix = crypto.randomUUID().slice(0, 8);
  return {
    id: crypto.randomUUID(),
    email: `${prefix}-${suffix}@example.com`,
  };
}

function parseHookEvent(value: HookEvent | string) {
  return typeof value === 'string' ? (JSON.parse(value) as HookEvent) : value;
}

describe('Organization E2E (testcontainers)', () => {
  let app: NestFastifyApplication;
  let container: StartedPostgreSqlContainer;
  let supabaseService: ReturnType<typeof createMockSupabaseService>;
  let sql: ReturnType<typeof postgres>;
  let drizzleClient: ReturnType<typeof postgres>;
  let drizzleDb: DrizzleDB;

  beforeAll(async () => {
    Reflect.set(
      String.prototype,
      'toISOString',
      function stringToISOString(this: string) {
        return this.toString();
      },
    );

    container = await new PostgreSqlContainer('postgres:16-alpine')
      .withDatabase('testdb')
      .withUsername('testuser')
      .withPassword('testpass')
      .withStartupTimeout(120_000)
      .start();

    const connectionUri = container.getConnectionUri();
    sql = postgres(connectionUri, { max: 1 });

    await sql.unsafe(`
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
    `);

    await sql`CREATE SCHEMA IF NOT EXISTS auth`;
    await sql`
      CREATE TABLE auth.users (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        email text NOT NULL UNIQUE
      )
    `;

    const migrationsDir = path.join(__dirname, '../src/database/migrations');
    const migrationFiles = fs
      .readdirSync(migrationsDir)
      .filter((file) => file.endsWith('.sql'))
      .sort();

    for (const file of migrationFiles) {
      const content = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
      const statements = content
        .split('--> statement-breakpoint')
        .filter((statement) => statement.trim());

      for (const statement of statements) {
        await sql.unsafe(statement.trim());
      }
    }

    drizzleClient = postgres(connectionUri, { max: 5 });
    drizzleDb = drizzle(drizzleClient, { schema });

    supabaseService = createMockSupabaseService();
    const redisClient = createMockRedisClient();
    const redisCacheService = createMockRedisCacheService();
    const redisPubSubService = createMockRedisPubSubService();
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(SupabaseService)
      .useValue(supabaseService)
      .overrideProvider(DRIZZLE)
      .useValue(drizzleDb)
      .overrideProvider(REDIS_CLIENT)
      .useValue(redisClient)
      .overrideProvider(RedisCacheService)
      .useValue(redisCacheService)
      .overrideProvider(RedisPubSubService)
      .useValue(redisPubSubService)
      .compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalPipes(new ZodValidationPipe());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await drizzleClient?.end();
    await sql?.end();
    await container?.stop();

    if (originalStringToISOString === undefined) {
      Reflect.deleteProperty(String.prototype, 'toISOString');
    } else {
      Reflect.set(String.prototype, 'toISOString', originalStringToISOString);
    }
  });

  beforeEach(async () => {
    await sql`DELETE FROM "organization_invitations"`;
    await sql`DELETE FROM "organization_members"`;
    await sql`DELETE FROM "organizations"`;
    await sql`DELETE FROM "revoked_tokens"`;
    await sql`DELETE FROM "users"`;
    await sql`DELETE FROM auth.users`;
    vi.clearAllMocks();
  });

  async function seedAuthUser(id: string, email: string) {
    await sql`
      INSERT INTO auth.users (id, email)
      VALUES (${id}::uuid, ${email})
    `;
  }

  async function seedAppUser(id: string, email: string) {
    await seedAuthUser(id, email);

    const [user] = await sql`
      INSERT INTO "users" (id, supabase_user_id, email)
      VALUES (${id}::uuid, ${id}::uuid, ${email})
      RETURNING *
    `;

    return user;
  }

  async function seedOrganization(
    ownerId: string,
    input?: {
      name?: string;
      slug?: string;
      description?: string;
    },
  ) {
    const name = input?.name ?? 'Seed Organization';
    const slug = input?.slug ?? `org-${crypto.randomUUID().slice(0, 8)}`;
    const description = input?.description ?? null;

    const [organization] = await sql`
      INSERT INTO "organizations" (name, slug, owner_id, description)
      VALUES (${name}, ${slug}, ${ownerId}::uuid, ${description})
      RETURNING *
    `;

    await sql`
      INSERT INTO "organization_members" (
        organization_id,
        user_id,
        role,
        invited_by
      )
      VALUES (
        ${organization.id}::uuid,
        ${ownerId}::uuid,
        ${'owner'}::org_role,
        ${ownerId}::uuid
      )
    `;

    await sql`
      UPDATE "users"
      SET current_organization_id = ${organization.id}::uuid
      WHERE id = ${ownerId}::uuid
    `;

    return organization;
  }

  async function seedOrganizationMember(
    organizationId: string,
    userId: string,
    role: OrganizationRole,
    invitedBy: string,
  ) {
    const [member] = await sql`
      INSERT INTO "organization_members" (
        organization_id,
        user_id,
        role,
        invited_by
      )
      VALUES (
        ${organizationId}::uuid,
        ${userId}::uuid,
        ${role}::org_role,
        ${invitedBy}::uuid
      )
      RETURNING *
    `;

    return member;
  }

  async function seedInvitation(
    organizationId: string,
    email: string,
    role: OrganizationRole,
    invitedBy: string,
    token = crypto.randomBytes(32).toString('base64url'),
    expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  ) {
    const [invitation] = await sql`
      INSERT INTO "organization_invitations" (
        organization_id,
        email,
        role,
        token,
        invited_by,
        expires_at
      )
      VALUES (
        ${organizationId}::uuid,
        ${email},
        ${role}::org_role,
        ${token},
        ${invitedBy}::uuid,
        ${expiresAt}
      )
      RETURNING *
    `;

    return invitation;
  }

  async function callAccessTokenHook(eventPayload: HookEvent) {
    const serializedEvent = JSON.stringify(eventPayload).replaceAll("'", "''");
    const [row] = await sql.unsafe<{ result: HookEvent | string }[]>(`
      SELECT custom_access_token_hook('${serializedEvent}'::jsonb) AS result
    `);

    return parseHookEvent(row.result);
  }

  describe('POST /api/v1/organizations', () => {
    it('认证用户创建组织成功 (201)', async () => {
      const owner = createTestUser('org-owner');
      await seedAppUser(owner.id, owner.email);

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/organizations',
        payload: {
          name: 'Acme Team',
          description: 'Primary workspace',
        },
        headers: authHeaders(owner),
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.data.name).toBe('Acme Team');
      expect(body.data.slug).toBe('acme-team');
      expect(body.data.ownerId).toBe(owner.id);

      const [member] = await sql`
        SELECT role
        FROM "organization_members"
        WHERE organization_id = ${body.data.id}::uuid
          AND user_id = ${owner.id}::uuid
      `;
      expect(member.role).toBe('owner');

      const [user] = await sql`
        SELECT current_organization_id
        FROM "users"
        WHERE id = ${owner.id}::uuid
      `;
      expect(user.current_organization_id).toBe(body.data.id);
    });

    it('未认证请求返回 401', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/organizations',
        payload: { name: 'Acme Team' },
      });

      expect(res.statusCode).toBe(401);
      const body = res.json();
      expect(body.type).toBe('https://agentloom.dev/errors/token-missing');
    });

    it('缺少名称返回 422 validation error', async () => {
      const owner = createTestUser('org-validation');
      await seedAppUser(owner.id, owner.email);

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/organizations',
        payload: { description: 'Missing name' },
        headers: authHeaders(owner),
      });

      expect(res.statusCode).toBe(422);
      const body = res.json();
      expect(body.status).toBe(422);
      expect(body.title).toBeDefined();
    });
  });

  describe('GET /api/v1/organizations/:id', () => {
    it('组织成员获取详情成功 (200)', async () => {
      const owner = createTestUser('org-detail-owner');
      const member = createTestUser('org-detail-member');
      await seedAppUser(owner.id, owner.email);
      await seedAppUser(member.id, member.email);

      const organization = await seedOrganization(owner.id, {
        name: 'Detail Org',
        slug: 'detail-org',
      });
      await seedOrganizationMember(
        organization.id,
        member.id,
        'viewer',
        owner.id,
      );

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/organizations/${organization.id}`,
        headers: authHeaders(member),
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.data.id).toBe(organization.id);
      expect(body.data.name).toBe('Detail Org');
      expect(body.data.memberCount).toBe(2);
    });

    it('非成员访问返回 404', async () => {
      const owner = createTestUser('org-forbidden-owner');
      const outsider = createTestUser('org-forbidden-outsider');
      await seedAppUser(owner.id, owner.email);
      await seedAppUser(outsider.id, outsider.email);

      const organization = await seedOrganization(owner.id, {
        name: 'Secret Org',
        slug: 'secret-org',
      });

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/organizations/${organization.id}`,
        headers: authHeaders(outsider),
      });

      expect(res.statusCode).toBe(404);
      const body = res.json();
      expect(body.type).toBe(
        'https://agentloom.dev/errors/organization-not-found',
      );
    });

    it('组织不存在返回 404', async () => {
      const user = createTestUser('org-missing');
      await seedAppUser(user.id, user.email);

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/organizations/${crypto.randomUUID()}`,
        headers: authHeaders(user),
      });

      expect(res.statusCode).toBe(404);
      const body = res.json();
      expect(body.type).toBe(
        'https://agentloom.dev/errors/organization-not-found',
      );
    });
  });

  describe('POST /api/v1/organizations/:id/invitations', () => {
    it('owner 邀请成员成功 (201)', async () => {
      const owner = createTestUser('invite-owner');
      await seedAppUser(owner.id, owner.email);

      const organization = await seedOrganization(owner.id, {
        name: 'Invite Org',
        slug: 'invite-org',
      });

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/organizations/${organization.id}/invitations`,
        payload: {
          email: 'new-member@example.com',
          role: 'viewer',
        },
        headers: authHeaders(
          withTenantContext(owner, organization.tenant_id, 'owner'),
        ),
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.data.organizationId).toBe(organization.id);
      expect(body.data.email).toBe('new-member@example.com');
      expect(body.data.role).toBe('viewer');
      expect(body.data.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    });

    it('非管理员邀请返回 403', async () => {
      const owner = createTestUser('invite-forbidden-owner');
      const viewer = createTestUser('invite-forbidden-viewer');
      await seedAppUser(owner.id, owner.email);
      await seedAppUser(viewer.id, viewer.email);

      const organization = await seedOrganization(owner.id, {
        name: 'Viewer Org',
        slug: 'viewer-org',
      });
      await seedOrganizationMember(
        organization.id,
        viewer.id,
        'viewer',
        owner.id,
      );

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/organizations/${organization.id}/invitations`,
        payload: {
          email: 'blocked-member@example.com',
          role: 'creator',
        },
        headers: authHeaders(
          withTenantContext(viewer, organization.tenant_id, 'viewer'),
        ),
      });

      expect(res.statusCode).toBe(403);
      const body = res.json();
      expect(body.type).toBe(
        'https://agentloom.dev/errors/insufficient-permissions',
      );
    });

    it('admin 邀请 owner 角色返回 403', async () => {
      const owner = createTestUser('invite-admin-owner');
      const admin = createTestUser('invite-admin-actor');
      await seedAppUser(owner.id, owner.email);
      await seedAppUser(admin.id, admin.email);

      const organization = await seedOrganization(owner.id, {
        name: 'Admin Invite Org',
        slug: 'admin-invite-org',
      });
      await seedOrganizationMember(
        organization.id,
        admin.id,
        'admin',
        owner.id,
      );

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/organizations/${organization.id}/invitations`,
        payload: {
          email: 'future-owner@example.com',
          role: 'owner',
        },
        headers: authHeaders(
          withTenantContext(admin, organization.tenant_id, 'admin'),
        ),
      });

      expect(res.statusCode).toBe(403);
      const body = res.json();
      expect(body.type).toBe(
        'https://agentloom.dev/errors/admin-cannot-invite-owner',
      );
    });
  });

  describe('POST /api/v1/invitations/:token/accept', () => {
    it('接受有效邀请成功 (200)', async () => {
      const owner = createTestUser('accept-owner');
      const invitee = createTestUser('accept-invitee');
      await seedAppUser(owner.id, owner.email);
      await seedAppUser(invitee.id, invitee.email);

      const organization = await seedOrganization(owner.id, {
        name: 'Accept Org',
        slug: 'accept-org',
      });
      const invitation = await seedInvitation(
        organization.id,
        invitee.email,
        'viewer',
        owner.id,
      );

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/invitations/${invitation.token}/accept`,
        headers: authHeaders(invitee),
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.data.organization.id).toBe(organization.id);
      expect(body.data.member.userId).toBe(invitee.id);
      expect(body.data.member.role).toBe('viewer');

      const [member] = await sql`
        SELECT role
        FROM "organization_members"
        WHERE organization_id = ${organization.id}::uuid
          AND user_id = ${invitee.id}::uuid
      `;
      expect(member.role).toBe('viewer');

      const [acceptedInvitation] = await sql`
        SELECT status
        FROM "organization_invitations"
        WHERE id = ${invitation.id}::uuid
      `;
      expect(acceptedInvitation.status).toBe('accepted');
    });

    it('无效 token 返回 404', async () => {
      const user = createTestUser('accept-invalid');
      await seedAppUser(user.id, user.email);

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/invitations/not-a-valid-token/accept',
        headers: authHeaders(user),
      });

      expect(res.statusCode).toBe(404);
      const body = res.json();
      expect(body.type).toBe(
        'https://agentloom.dev/errors/invitation-not-found',
      );
    });
  });

  describe('PUT /api/v1/organizations/:id/members/:userId/role', () => {
    it('owner 更新成员角色成功 (200)', async () => {
      const owner = createTestUser('role-owner');
      const member = createTestUser('role-member');
      await seedAppUser(owner.id, owner.email);
      await seedAppUser(member.id, member.email);

      const organization = await seedOrganization(owner.id, {
        name: 'Role Org',
        slug: 'role-org',
      });
      await seedOrganizationMember(
        organization.id,
        member.id,
        'viewer',
        owner.id,
      );

      const res = await app.inject({
        method: 'PUT',
        url: `/api/v1/organizations/${organization.id}/members/${member.id}/role`,
        payload: { role: 'admin' },
        headers: authHeaders(
          withTenantContext(owner, organization.tenant_id, 'owner'),
        ),
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.data.organizationId).toBe(organization.id);
      expect(body.data.userId).toBe(member.id);
      expect(body.data.role).toBe('admin');

      const [updatedMember] = await sql`
        SELECT role
        FROM "organization_members"
        WHERE organization_id = ${organization.id}::uuid
          AND user_id = ${member.id}::uuid
      `;
      expect(updatedMember.role).toBe('admin');
    });
  });

  describe('DELETE /api/v1/organizations/:id/members/:userId', () => {
    it('owner 移除成员成功 (204)', async () => {
      const owner = createTestUser('remove-owner');
      const member = createTestUser('remove-member');
      await seedAppUser(owner.id, owner.email);
      await seedAppUser(member.id, member.email);

      const organization = await seedOrganization(owner.id, {
        name: 'Remove Org',
        slug: 'remove-org',
      });
      await seedOrganizationMember(
        organization.id,
        member.id,
        'viewer',
        owner.id,
      );
      await sql`
        UPDATE "users"
        SET current_organization_id = ${organization.id}::uuid
        WHERE id = ${member.id}::uuid
      `;

      const res = await app.inject({
        method: 'DELETE',
        url: `/api/v1/organizations/${organization.id}/members/${member.id}`,
        headers: authHeaders(
          withTenantContext(owner, organization.tenant_id, 'owner'),
        ),
      });

      expect(res.statusCode).toBe(204);

      const rows = await sql`
        SELECT *
        FROM "organization_members"
        WHERE organization_id = ${organization.id}::uuid
          AND user_id = ${member.id}::uuid
      `;
      expect(rows).toHaveLength(0);

      const [user] = await sql`
        SELECT current_organization_id
        FROM "users"
        WHERE id = ${member.id}::uuid
      `;
      expect(user.current_organization_id).toBeNull();
    });
  });

  describe('custom_access_token_hook', () => {
    it('用户设置了 current_organization_id 时返回正确的 tenant_id 和 tenant_role', async () => {
      const owner = createTestUser('hook-owner');
      await seedAppUser(owner.id, owner.email);

      const organization = await seedOrganization(owner.id, {
        name: 'Hook Org',
        slug: 'hook-org',
      });

      const result = await callAccessTokenHook({
        user_id: owner.id,
        claims: {
          app_metadata: {
            source: 'seed',
          },
        },
      });

      expect(result.claims).toEqual({
        app_metadata: {
          source: 'seed',
        },
        tenant_id: organization.tenant_id,
        tenant_role: 'owner',
      });
    });

    it('用户未设置 current_organization_id 时写入空 tenant claims', async () => {
      const user = createTestUser('hook-empty');
      await seedAppUser(user.id, user.email);

      const result = await callAccessTokenHook({
        user_id: user.id,
        claims: {},
      });

      expect(result.claims).toEqual({
        tenant_id: null,
        tenant_role: null,
      });
    });

    it('用户有当前组织但没有 membership 时写入空 tenant claims', async () => {
      const owner = createTestUser('hook-no-member-owner');
      const user = createTestUser('hook-no-member');
      await seedAppUser(owner.id, owner.email);
      await seedAppUser(user.id, user.email);

      const organization = await seedOrganization(owner.id, {
        name: 'Hook No Member Org',
        slug: 'hook-no-member-org',
      });

      await sql`
        UPDATE "users"
        SET current_organization_id = ${organization.id}::uuid
        WHERE id = ${user.id}::uuid
      `;

      const result = await callAccessTokenHook({
        user_id: user.id,
        claims: {},
      });

      expect(result.claims).toEqual({
        tenant_id: null,
        tenant_role: null,
      });
    });

    it('hook 查询异常时 fail-open 并保留原有 claims', async () => {
      const owner = createTestUser('hook-fail-open-owner');
      await seedAppUser(owner.id, owner.email);
      await seedOrganization(owner.id, {
        name: 'Hook Fail Open Org',
        slug: 'hook-fail-open-org',
      });

      const eventPayload: HookEvent = {
        user_id: owner.id,
        claims: {
          app_metadata: {
            marker: 'keep-me',
          },
          user_metadata: {
            locale: 'zh-CN',
          },
        },
      };
      let result: HookEvent | null = null;

      await sql.unsafe('BEGIN');
      try {
        await sql.unsafe(
          'ALTER TABLE "organization_members" DROP COLUMN "role"',
        );
        result = await callAccessTokenHook(eventPayload);
      } finally {
        await sql.unsafe('ROLLBACK');
      }

      if (!result) {
        throw new Error('Expected hook result');
      }

      expect(result.claims).toEqual({
        app_metadata: {
          marker: 'keep-me',
        },
        user_metadata: {
          locale: 'zh-CN',
        },
        tenant_id: null,
        tenant_role: null,
      });
    });
  });
});
