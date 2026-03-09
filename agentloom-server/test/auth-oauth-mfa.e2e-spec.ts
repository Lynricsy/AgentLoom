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
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as jwt from 'jsonwebtoken';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { RedisCacheService } from '../src/common/redis/redis-cache.service';
import { REDIS_CLIENT } from '../src/common/redis/redis.constants';
import { RedisPubSubService } from '../src/common/redis/redis-pubsub.service';
import { ZodValidationPipe } from '../src/common/pipes/zod-validation.pipe';
import { DRIZZLE } from '../src/database/database.module';
import * as schema from '../src/database/schema';
import { SupabaseService } from '../src/modules/auth/supabase/supabase.service';

const JWT_SECRET = 'test-e2e-jwt-secret';
const MOCK_SUPABASE_UUID = '7b0e1fce-e8ab-4e10-b846-07a97e0ef111';
const MOCK_EMAIL = 'oauth-mfa@example.com';
const MOCK_FACTOR_ID = '01912345-6789-7abc-8ef0-123456789abc';

function createMockAccessToken(
  sub = MOCK_SUPABASE_UUID,
  email = MOCK_EMAIL,
): string {
  return jwt.sign(
    { sub, email, aud: 'authenticated', jti: crypto.randomUUID() },
    JWT_SECRET,
    { algorithm: 'HS256', expiresIn: '1h' },
  );
}

function createMfaPendingToken(supabaseAccessToken: string): string {
  return jwt.sign(
    {
      sub: crypto.randomUUID(),
      email: MOCK_EMAIL,
      aud: 'authenticated',
      type: 'mfa_pending',
      supabaseAccessToken,
    },
    JWT_SECRET,
    { algorithm: 'HS256', expiresIn: '5m' },
  );
}

function createMockSupabaseService() {
  return {
    signUp: vi.fn(),
    signIn: vi.fn(),
    refreshToken: vi.fn(),
    signOut: vi.fn(),
    getUser: vi.fn(),
    exchangeCodeForSession: vi.fn(),
    listFactors: vi.fn(),
    challengeAndVerifyTotp: vi.fn(),
    getAuthenticatorAssuranceLevel: vi.fn(),
    unenrollFactor: vi.fn(),
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

describe('Auth OAuth/MFA E2E (testcontainers)', () => {
  let app: NestFastifyApplication;
  let container: StartedPostgreSqlContainer;
  let supabaseService: ReturnType<typeof createMockSupabaseService>;
  let sql: ReturnType<typeof postgres>;
  let drizzleClient: ReturnType<typeof postgres>;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine')
      .withDatabase('testdb')
      .withUsername('testuser')
      .withPassword('testpass')
      .start();

    const connectionUri = container.getConnectionUri();
    sql = postgres(connectionUri);

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
    await sql`CREATE TABLE auth.users (id uuid PRIMARY KEY DEFAULT gen_random_uuid())`;

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
    const drizzleDb = drizzle(drizzleClient, { schema });

    supabaseService = createMockSupabaseService();
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(SupabaseService)
      .useValue(supabaseService)
      .overrideProvider(DRIZZLE)
      .useValue(drizzleDb)
      .overrideProvider(REDIS_CLIENT)
      .useValue(createMockRedisClient())
      .overrideProvider(RedisCacheService)
      .useValue(createMockRedisCacheService())
      .overrideProvider(RedisPubSubService)
      .useValue(createMockRedisPubSubService())
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
  });

  beforeEach(async () => {
    await sql`DELETE FROM "revoked_tokens"`;
    await sql`DELETE FROM "users"`;
    await sql`DELETE FROM auth.users`;
    vi.clearAllMocks();
    supabaseService.listFactors.mockResolvedValue({ totp: [] });
  });

  async function seedAuthUser(supabaseId = MOCK_SUPABASE_UUID) {
    await sql`INSERT INTO auth.users (id) VALUES (${supabaseId}::uuid)`;
  }

  it('GET /api/v1/auth/oauth/callback 在已启用 MFA 时重定向到 mfa_required 回调', async () => {
    await seedAuthUser();
    supabaseService.exchangeCodeForSession.mockResolvedValue({
      session: {
        access_token: 'oauth-access-token',
        refresh_token: 'oauth-refresh-token',
        expires_in: 3600,
      },
      user: {
        id: MOCK_SUPABASE_UUID,
        email: MOCK_EMAIL,
        user_metadata: {
          full_name: 'OAuth User',
          avatar_url: 'https://cdn.example.com/oauth.png',
        },
      },
    });
    supabaseService.listFactors.mockResolvedValue({
      totp: [{ id: MOCK_FACTOR_ID, status: 'verified' }],
    });

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/oauth/callback?code=oauth-code',
    });

    expect(res.statusCode).toBe(302);
    const location = res.headers.location;

    expect(location).toBeDefined();
    expect(location).toContain('mfa_required=true');

    const redirectUrl = new URL(location!);
    const mfaToken = redirectUrl.searchParams.get('mfa_token');
    const [dbUser] = await sql`
      SELECT id FROM "users" WHERE supabase_user_id = ${MOCK_SUPABASE_UUID}::uuid
    `;
    const payload = jwt.verify(mfaToken!, JWT_SECRET) as jwt.JwtPayload;

    expect(payload.type).toBe('mfa_pending');
    expect(payload.supabaseAccessToken).toBe('oauth-access-token');
    expect(payload.sub).toBe(dbUser.id);
  });

  it('POST /api/v1/auth/mfa/totp/verify 接受 mfa_pending bearer 并返回新 tokens', async () => {
    const mfaToken = createMfaPendingToken('oauth-access-token');
    supabaseService.challengeAndVerifyTotp.mockResolvedValue({
      access_token: 'aal2-access-token',
      refresh_token: 'aal2-refresh-token',
      expires_in: 3600,
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/mfa/totp/verify',
      headers: {
        authorization: `Bearer ${mfaToken}`,
      },
      payload: {
        factor_id: MOCK_FACTOR_ID,
        code: '123456',
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      data: {
        tokens: {
          access_token: 'aal2-access-token',
          refresh_token: 'aal2-refresh-token',
          expires_in: 3600,
        },
      },
    });
    expect(supabaseService.challengeAndVerifyTotp).toHaveBeenCalledWith(
      'oauth-access-token',
      MOCK_FACTOR_ID,
      '123456',
    );
  });

  it('DELETE /api/v1/auth/mfa 在当前会话不是 AAL2 时返回 403 aal2-required', async () => {
    supabaseService.getAuthenticatorAssuranceLevel.mockResolvedValue({
      currentLevel: 'aal1',
      nextLevel: 'aal2',
      currentAuthenticationMethods: [],
    });

    const res = await app.inject({
      method: 'DELETE',
      url: '/api/v1/auth/mfa',
      headers: {
        authorization: `Bearer ${createMockAccessToken()}`,
      },
      payload: {
        code: '123456',
      },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().type).toBe('https://agentloom.dev/errors/aal2-required');
  });
});
