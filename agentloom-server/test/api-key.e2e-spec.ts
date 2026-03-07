import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
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
  type StartedPostgreSqlContainer,
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

type TestUser = { id: string; email: string };
type AuthenticatedTestUser = TestUser & {
  tenantId?: string;
  tenantRole?: string;
};

function signToken(payload: Record<string, unknown>): string {
  return jwt.sign(payload, JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: '1h',
  });
}

function authHeaders(user: AuthenticatedTestUser): Record<string, string> {
  const payload: Record<string, unknown> = {
    sub: user.id,
    email: user.email,
    aud: 'authenticated',
    jti: crypto.randomUUID(),
  };
  if (user.tenantId) {
    payload.tenant_id = user.tenantId;
    payload.tenant_role = user.tenantRole ?? 'member';
  }
  return { authorization: `Bearer ${signToken(payload)}` };
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
    onModuleDestroy: vi.fn(),
  };
}

function createMockRedisPubSubService() {
  return {
    publish: vi.fn().mockResolvedValue(undefined),
    onModuleInit: vi.fn(),
    onModuleDestroy: vi.fn(),
  };
}

function createTestUser(prefix: string): TestUser {
  return {
    id: crypto.randomUUID(),
    email: `${prefix}-${crypto.randomUUID().slice(0, 8)}@example.com`,
  };
}

function withTenantContext(
  user: TestUser,
  tenantId: string,
  tenantRole: string,
): AuthenticatedTestUser {
  return { ...user, tenantId, tenantRole };
}

describe('API Key (E2E)', () => {
  let container: StartedPostgreSqlContainer;
  let app: NestFastifyApplication;
  let sql: ReturnType<typeof postgres>;
  let drizzleClient: ReturnType<typeof postgres>;
  let drizzleDb: DrizzleDB;

  let owner: AuthenticatedTestUser;
  let organization: { id: string; tenant_id: string };

  const originalStringToISOString = Reflect.get(
    String.prototype,
    'toISOString',
  );

  async function seedAuthUser(id: string, email: string) {
    await sql`INSERT INTO auth.users (id, email) VALUES (${id}, ${email})`;
  }

  async function seedAppUser(id: string, email: string) {
    await seedAuthUser(id, email);
    await sql`INSERT INTO users (id, supabase_user_id, email) VALUES (${id}, ${id}, ${email})`;
  }

  async function seedOrganization(ownerId: string) {
    const slug = `org-${crypto.randomUUID().slice(0, 8)}`;
    const [org] = await sql`
      INSERT INTO organizations (name, slug, owner_id)
      VALUES ('Test Org', ${slug}, ${ownerId})
      RETURNING id, tenant_id
    `;
    await sql`
      INSERT INTO organization_members (organization_id, user_id, role, invited_by)
      VALUES (${org.id}, ${ownerId}, 'owner', ${ownerId})
    `;
    await sql`
      UPDATE users SET current_organization_id = ${org.id} WHERE id = ${ownerId}
    `;
    return org as { id: string; tenant_id: string };
  }

  beforeAll(async () => {
    Reflect.set(
      String.prototype,
      'toISOString',
      function (this: string) {
        return this;
      },
    );

    container = await new PostgreSqlContainer('postgres:16-alpine')
      .withDatabase('test_db')
      .withUsername('test_user')
      .withPassword('test_pass')
      .start();

    const connectionUri = container.getConnectionUri();
    process.env.APP_DATABASE_URL = connectionUri;

    sql = postgres(connectionUri, { max: 1 });

    await sql`DO $$ BEGIN CREATE ROLE supabase_auth_admin; EXCEPTION WHEN duplicate_object THEN null; END $$`;
    await sql`DO $$ BEGIN CREATE ROLE authenticated; EXCEPTION WHEN duplicate_object THEN null; END $$`;
    await sql`DO $$ BEGIN CREATE ROLE anon; EXCEPTION WHEN duplicate_object THEN null; END $$`;
    await sql`GRANT authenticated TO test_user`;

    await sql`CREATE SCHEMA IF NOT EXISTS auth`;
    await sql`CREATE TABLE IF NOT EXISTS auth.users (id uuid PRIMARY KEY, email text UNIQUE)`;

    const migrationsDir = path.join(
      __dirname,
      '../src/database/migrations',
    );
    const migrationFiles = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    for (const file of migrationFiles) {
      const content = fs.readFileSync(
        path.join(migrationsDir, file),
        'utf-8',
      );
      const statements = content
        .split('--> statement-breakpoint')
        .map((s) => s.trim())
        .filter(Boolean);

      for (const statement of statements) {
        try {
          await sql.unsafe(statement);
        } catch {
          // ignore if object already exists (idempotent migrations)
        }
      }
    }

    drizzleClient = postgres(connectionUri, { max: 5 });
    drizzleDb = drizzle(drizzleClient, { schema }) as unknown as DrizzleDB;

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(SupabaseService)
      .useValue(createMockSupabaseService())
      .overrideProvider(DRIZZLE)
      .useValue(drizzleDb)
      .overrideProvider(REDIS_CLIENT)
      .useValue(createMockRedisClient())
      .overrideProvider(RedisCacheService)
      .useValue(createMockRedisCacheService())
      .overrideProvider(RedisPubSubService)
      .useValue(createMockRedisPubSubService())
      .compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );

    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalPipes(new ZodValidationPipe());

    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  }, 120_000);

  afterAll(async () => {
    Reflect.set(
      String.prototype,
      'toISOString',
      originalStringToISOString,
    );
    await app?.close();
    await drizzleClient?.end();
    await sql?.end();
    await container?.stop();
  });

  beforeEach(async () => {
    await sql`DELETE FROM api_keys`;
    await sql`DELETE FROM organization_invitations`;
    await sql`DELETE FROM organization_members`;
    await sql`DELETE FROM organizations`;
    await sql`DELETE FROM revoked_tokens`;
    await sql`DELETE FROM users`;
    await sql`DELETE FROM auth.users`;
    vi.clearAllMocks();

    const testUser = createTestUser('apikey-owner');
    await seedAppUser(testUser.id, testUser.email);
    organization = await seedOrganization(testUser.id);
    owner = withTenantContext(testUser, organization.tenant_id, 'owner');
  });

  const createApiKeyPayload = {
    provider: 'openai',
    label: 'My OpenAI Key',
    apiKey: 'sk-test-redacted',
  };

  describe('POST /api/v1/api-keys', () => {
    it('should create an API key and return safe response (201)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/api-keys',
        payload: createApiKeyPayload,
        headers: authHeaders(owner),
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.data).toBeDefined();
      expect(body.data.provider).toBe('openai');
      expect(body.data.label).toBe('My OpenAI Key');
      expect(body.data.keyPreview).toBe('...cdef');
      expect(body.data.status).toBe('active');
      expect(body.data.id).toBeDefined();
      expect(body.data.createdAt).toBeDefined();
      expect(body.data.encryptedKey).toBeUndefined();
      expect(body.data.encryptedDek).toBeUndefined();
      expect(body.data.iv).toBeUndefined();
      expect(body.data.authTag).toBeUndefined();
    });

    it('should reject invalid provider (400)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/api-keys',
        payload: { ...createApiKeyPayload, provider: 'invalid-provider' },
        headers: authHeaders(owner),
      });

      expect(res.statusCode).toBe(422);
    });

    it('should reject missing required fields (400)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/api-keys',
        payload: { provider: 'openai' },
        headers: authHeaders(owner),
      });

      expect(res.statusCode).toBe(422);
    });

    it('should reject unauthenticated request (401)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/api-keys',
        payload: createApiKeyPayload,
      });

      expect(res.statusCode).toBe(401);
    });
  });

  describe('GET /api/v1/api-keys', () => {
    it('should list API keys for the tenant (200)', async () => {
      await app.inject({
        method: 'POST',
        url: '/api/v1/api-keys',
        payload: createApiKeyPayload,
        headers: authHeaders(owner),
      });

      await app.inject({
        method: 'POST',
        url: '/api/v1/api-keys',
        payload: {
          ...createApiKeyPayload,
          provider: 'anthropic',
          label: 'My Anthropic Key',
          apiKey: 'sk-ant-test9876',
        },
        headers: authHeaders(owner),
      });

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/api-keys',
        headers: authHeaders(owner),
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.data).toHaveLength(2);
      expect(body.data[0].encryptedKey).toBeUndefined();
      expect(body.data[0].encryptedDek).toBeUndefined();
    });

    it('should return empty array when no keys exist (200)', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/api-keys',
        headers: authHeaders(owner),
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().data).toHaveLength(0);
    });
  });

  describe('PUT /api/v1/api-keys/:id/rotate', () => {
    it('should rotate an API key with new encrypted data (200)', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/v1/api-keys',
        payload: createApiKeyPayload,
        headers: authHeaders(owner),
      });
      const keyId = createRes.json().data.id;

      const res = await app.inject({
        method: 'PUT',
        url: `/api/v1/api-keys/${keyId}/rotate`,
        payload: { apiKey: 'sk-proj-newkey9999' },
        headers: authHeaders(owner),
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.data.keyPreview).toBe('...9999');
      expect(body.data.id).toBe(keyId);
      expect(body.data.status).toBe('active');
    });

    it('should return 404 for non-existent key', async () => {
      const res = await app.inject({
        method: 'PUT',
        url: `/api/v1/api-keys/${crypto.randomUUID()}/rotate`,
        payload: { apiKey: 'sk-proj-newkey9999' },
        headers: authHeaders(owner),
      });

      expect(res.statusCode).toBe(404);
    });
  });

  describe('DELETE /api/v1/api-keys/:id', () => {
    it('should revoke an API key and nullify encrypted data (200)', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/v1/api-keys',
        payload: createApiKeyPayload,
        headers: authHeaders(owner),
      });
      const keyId = createRes.json().data.id;

      const res = await app.inject({
        method: 'DELETE',
        url: `/api/v1/api-keys/${keyId}`,
        headers: authHeaders(owner),
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.data.status).toBe('revoked');

      const [dbRecord] = await sql`
        SELECT encrypted_key, encrypted_dek, iv, auth_tag, status
        FROM api_keys WHERE id = ${keyId}
      `;
      expect(dbRecord.encrypted_key).toBeNull();
      expect(dbRecord.encrypted_dek).toBeNull();
      expect(dbRecord.iv).toBeNull();
      expect(dbRecord.auth_tag).toBeNull();
      expect(dbRecord.status).toBe('revoked');
    });

    it('should return 404 for non-existent key', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: `/api/v1/api-keys/${crypto.randomUUID()}`,
        headers: authHeaders(owner),
      });

      expect(res.statusCode).toBe(404);
    });
  });

  describe('Full Lifecycle', () => {
    it('should support create → list → rotate → revoke', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/v1/api-keys',
        payload: createApiKeyPayload,
        headers: authHeaders(owner),
      });
      expect(createRes.statusCode).toBe(201);
      const keyId = createRes.json().data.id;

      const listRes = await app.inject({
        method: 'GET',
        url: '/api/v1/api-keys',
        headers: authHeaders(owner),
      });
      expect(listRes.statusCode).toBe(200);
      expect(listRes.json().data).toHaveLength(1);

      const rotateRes = await app.inject({
        method: 'PUT',
        url: `/api/v1/api-keys/${keyId}/rotate`,
        payload: { apiKey: 'sk-proj-rotated5678' },
        headers: authHeaders(owner),
      });
      expect(rotateRes.statusCode).toBe(200);
      expect(rotateRes.json().data.keyPreview).toBe('...5678');

      const revokeRes = await app.inject({
        method: 'DELETE',
        url: `/api/v1/api-keys/${keyId}`,
        headers: authHeaders(owner),
      });
      expect(revokeRes.statusCode).toBe(200);
      expect(revokeRes.json().data.status).toBe('revoked');

      const [dbRecord] = await sql`
        SELECT encrypted_key, status FROM api_keys WHERE id = ${keyId}
      `;
      expect(dbRecord.encrypted_key).toBeNull();
      expect(dbRecord.status).toBe('revoked');
    });
  });
});
