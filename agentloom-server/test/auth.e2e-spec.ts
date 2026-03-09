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
import { AuthApiError } from '@supabase/supabase-js';
import { AppModule } from '../src/app.module';
import { RedisCacheService } from '../src/common/redis/redis-cache.service';
import { REDIS_CLIENT } from '../src/common/redis/redis.constants';
import { RedisPubSubService } from '../src/common/redis/redis-pubsub.service';
import { DRIZZLE, type DrizzleDB } from '../src/database/database.module';
import { SupabaseService } from '../src/modules/auth/supabase/supabase.service';
import { users } from '../src/database/schema';
import * as schema from '../src/database/schema';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { ZodValidationPipe } from '../src/common/pipes/zod-validation.pipe';

const JWT_SECRET = 'test-e2e-jwt-secret';
const MOCK_SUPABASE_UUID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const MOCK_EMAIL = 'e2e@example.com';

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

describe('Auth E2E (testcontainers)', () => {
  let app: NestFastifyApplication;
  let container: StartedPostgreSqlContainer;
  let supabaseService: ReturnType<typeof createMockSupabaseService>;
  let sql: ReturnType<typeof postgres>;
  let drizzleClient: ReturnType<typeof postgres>;

  beforeAll(async () => {
    // 1. PostgreSQL コンテナ起動
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

    // 2. auth スキーマ作成（FK 制約用）
    await sql`CREATE SCHEMA IF NOT EXISTS auth`;
    await sql`CREATE TABLE auth.users (id uuid PRIMARY KEY DEFAULT gen_random_uuid())`;

    // 3. マイグレーション実行（全 .sql ファイルをソート順で適用）
    const migrationsDir = path.join(__dirname, '../src/database/migrations');
    const migrationFiles = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();
    for (const file of migrationFiles) {
      const content = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
      const statements = content
        .split('--> statement-breakpoint')
        .filter((s) => s.trim());
      for (const stmt of statements) {
        await sql.unsafe(stmt.trim());
      }
    }

    // 4. Drizzle インスタンスを直接作成（ConfigModule のキャッシュを回避）
    drizzleClient = postgres(connectionUri, { max: 5 });
    const drizzleDb = drizzle(drizzleClient, { schema });

    // 5. NestJS アプリ作成（SupabaseService + DRIZZLE をオーバーライド）
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
  });

  beforeEach(async () => {
    await sql`DELETE FROM "revoked_tokens"`;
    await sql`DELETE FROM "users"`;
    await sql`DELETE FROM auth.users`;
    vi.clearAllMocks();
  });

  it('users schema: DB 默认生成 UUIDv7，updated_at 由触发器自动刷新', async () => {
    await seedAuthUser();

    const [inserted] = await sql`
      INSERT INTO "users" (supabase_user_id, email)
      VALUES (${MOCK_SUPABASE_UUID}::uuid, ${MOCK_EMAIL})
      RETURNING id, created_at, updated_at
    `;

    expect(inserted).toBeDefined();
    expect(inserted.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(inserted.created_at).toBeDefined();
    expect(inserted.updated_at).toBeDefined();

    await new Promise((resolve) => setTimeout(resolve, 20));

    const [updated] = await sql`
      UPDATE "users"
      SET email = ${'updated-' + MOCK_EMAIL}
      WHERE supabase_user_id = ${MOCK_SUPABASE_UUID}::uuid
      RETURNING updated_at
    `;

    expect(new Date(updated.updated_at).getTime()).toBeGreaterThan(
      new Date(inserted.updated_at).getTime(),
    );
  });

  /**
   * auth.users に Supabase ユーザー行を挿入（FK 制約を満たすため）
   */
  async function seedAuthUser(supabaseId = MOCK_SUPABASE_UUID) {
    await sql`INSERT INTO auth.users (id) VALUES (${supabaseId}::uuid)`;
  }

  /**
   * users テーブルにアプリユーザーを挿入（ログインテスト用）
   */
  async function seedAppUser(
    supabaseId = MOCK_SUPABASE_UUID,
    email = MOCK_EMAIL,
  ) {
    await seedAuthUser(supabaseId);
    await sql`
      INSERT INTO "users" (id, supabase_user_id, email)
      VALUES (${crypto.randomUUID()}::uuid, ${supabaseId}::uuid, ${email})
    `;
  }

  it('GET /api/v1/health: @Public() → 200', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/health' });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe('ok');
    expect(body.timestamp).toBeDefined();
  });

  describe('POST /api/v1/auth/register', () => {
    it('正常登録 → 201 + DB にユーザー作成', async () => {
      await seedAuthUser();

      supabaseService.signUp.mockResolvedValue({
        user: { id: MOCK_SUPABASE_UUID, email: MOCK_EMAIL },
        session: {
          access_token: createMockAccessToken(),
          refresh_token: 'mock-refresh-token',
          expires_in: 3600,
        },
      });

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: { email: MOCK_EMAIL, password: 'ValidPass1' },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.data.user.email).toBe(MOCK_EMAIL);
      expect(body.data.tokens.access_token).toBeDefined();
      expect(body.data.tokens.refresh_token).toBe('mock-refresh-token');

      const [dbUser] =
        await sql`SELECT * FROM "users" WHERE email = ${MOCK_EMAIL}`;
      expect(dbUser).toBeDefined();
      expect(dbUser.supabase_user_id).toBe(MOCK_SUPABASE_UUID);
      expect(dbUser.is_active).toBe(true);
    });

    it('パスワードバリデーション失敗 → 422 (RFC 7807)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: { email: MOCK_EMAIL, password: 'short' },
      });

      expect(res.statusCode).toBe(422);
      const body = res.json();
      expect(body.type).toBeDefined();
      expect(body.title).toBeDefined();
      expect(body.status).toBe(422);
    });

    it('無効なメール → 422', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: { email: 'not-an-email', password: 'ValidPass1' },
      });

      expect(res.statusCode).toBe(422);
    });

    it('重複登録 → 409 email-conflict', async () => {
      supabaseService.signUp.mockRejectedValue(
        new AuthApiError('User already registered', 422, 'email_exists'),
      );

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: { email: MOCK_EMAIL, password: 'ValidPass1' },
      });

      expect(res.statusCode).toBe(409);
      const body = res.json();
      expect(body.type).toBe('https://agentloom.dev/errors/email-conflict');
      expect(body.detail).toContain('already exists');
    });
  });

  describe('POST /api/v1/auth/login', () => {
    it('正常ログイン → 200', async () => {
      await seedAppUser();

      supabaseService.signIn.mockResolvedValue({
        user: { id: MOCK_SUPABASE_UUID, email: MOCK_EMAIL },
        session: {
          access_token: createMockAccessToken(),
          refresh_token: 'mock-refresh-token',
          expires_in: 3600,
        },
      });

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: MOCK_EMAIL, password: 'ValidPass1' },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.data.user.email).toBe(MOCK_EMAIL);
      expect(body.data.tokens.access_token).toBeDefined();
      expect(body.data.tokens.refresh_token).toBe('mock-refresh-token');
    });

    it('パスワード不正 → 401 invalid-credentials', async () => {
      supabaseService.signIn.mockRejectedValue(
        new AuthApiError(
          'Invalid login credentials',
          400,
          'invalid_credentials',
        ),
      );

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: MOCK_EMAIL, password: 'WrongPass1' },
      });

      expect(res.statusCode).toBe(401);
      const body = res.json();
      expect(body.type).toBe(
        'https://agentloom.dev/errors/invalid-credentials',
      );
      expect(body.detail).toContain('Invalid email or password');
    });
  });

  describe('POST /api/v1/auth/refresh', () => {
    it('正常リフレッシュ → 200 + トークンローテーション', async () => {
      const newAccessToken = 'rotated-access-token';
      const newRefreshToken = 'rotated-refresh-token';

      supabaseService.refreshToken.mockResolvedValue({
        session: {
          access_token: newAccessToken,
          refresh_token: newRefreshToken,
          expires_in: 3600,
        },
      });

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/refresh',
        payload: { refresh_token: 'old-refresh-token' },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.data.tokens.access_token).toBe(newAccessToken);
      expect(body.data.tokens.refresh_token).toBe(newRefreshToken);
      expect(body.data.tokens.refresh_token).not.toBe('old-refresh-token');
    });
  });

  describe('POST /api/v1/auth/logout', () => {
    it('認証済みでログアウト → 204', async () => {
      supabaseService.signOut.mockResolvedValue(undefined);
      const token = createMockAccessToken();

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/logout',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(204);
    });

    it('認証なし → 401 token-missing', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/logout',
      });

      expect(res.statusCode).toBe(401);
      const body = res.json();
      expect(body.type).toBe('https://agentloom.dev/errors/token-missing');
    });

    it('ログアウト後のトークン無効化 → 401 token-revoked', async () => {
      supabaseService.signOut.mockResolvedValue(undefined);
      const token = createMockAccessToken();

      // 1回目: 正常ログアウト
      const logoutRes = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/logout',
        headers: { authorization: `Bearer ${token}` },
      });
      expect(logoutRes.statusCode).toBe(204);

      // 2回目: 同じトークンで再度アクセス → ブラックリストで拒否
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/logout',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(401);
      const body = res.json();
      expect(body.type).toBe('https://agentloom.dev/errors/token-revoked');
    });
  });

  describe('トークン検証', () => {
    it('期限切れトークン → 401 token-expired', async () => {
      const expiredToken = jwt.sign(
        {
          sub: MOCK_SUPABASE_UUID,
          email: MOCK_EMAIL,
          aud: 'authenticated',
          exp: Math.floor(Date.now() / 1000) - 3600,
        },
        JWT_SECRET,
        { algorithm: 'HS256' },
      );

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/logout',
        headers: { authorization: `Bearer ${expiredToken}` },
      });

      expect(res.statusCode).toBe(401);
      expect(res.json().type).toBe(
        'https://agentloom.dev/errors/token-expired',
      );
    });

    it('不正署名トークン → 401 token-invalid', async () => {
      const invalidToken = jwt.sign(
        { sub: MOCK_SUPABASE_UUID, email: MOCK_EMAIL, aud: 'authenticated' },
        'wrong-secret',
        { algorithm: 'HS256', expiresIn: '1h' },
      );

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/logout',
        headers: { authorization: `Bearer ${invalidToken}` },
      });

      expect(res.statusCode).toBe(401);
      expect(res.json().type).toBe(
        'https://agentloom.dev/errors/token-invalid',
      );
    });
  });
});
