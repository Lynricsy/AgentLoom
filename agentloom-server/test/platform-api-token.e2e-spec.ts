vi.mock('@anatine/zod-nestjs', async () => {
  const { createZodDto } = await import('nestjs-zod');
  return { createZodDto };
});

declare const vi: typeof import('vitest').vi;

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import * as crypto from 'node:crypto';
import * as jwt from 'jsonwebtoken';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { AuthGuard } from '../src/common/guards/auth.guard';
import { DomainException } from '../src/common/exceptions/domain.exception';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { ZodValidationPipe } from '../src/common/pipes/zod-validation.pipe';
import { RedisCacheService } from '../src/common/redis/redis-cache.service';
import { REDIS_CLIENT } from '../src/common/redis/redis.constants';
import { RedisPubSubService } from '../src/common/redis/redis-pubsub.service';
import { DRIZZLE } from '../src/database/database.module';
import { SupabaseService } from '../src/modules/auth/supabase/supabase.service';
import { NotificationModule } from '../src/modules/notification/notification.module';
import { NotificationService } from '../src/modules/notification/notification.service';
import {
  createRlsTestContext,
  seedAppUser,
  seedMember,
  seedOrg,
  type RlsTestContext,
} from './rls/rls-test-utils';

const JWT_SECRET = 'test-e2e-jwt-secret';
const BASE_PATH = '/api/v1/platform-api-tokens';
const RAW_TOKEN_PREFIX = 'al_';
const TOKEN_PREFIX_LENGTH = RAW_TOKEN_PREFIX.length + 8;

type TestUser = {
  id: string;
  email: string;
};

type SeededPlatformToken = {
  tokenId: string;
  rawToken: string;
  tokenPrefix: string;
};

type HeaderMap = Record<string, string>;

type ProblemDetailsBody = {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance: string;
  errors?: Array<{
    field: string;
    message: string;
  }>;
};

function signToken(payload: Record<string, unknown>) {
  return jwt.sign(payload, JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: '1h',
  });
}

function authHeaders(
  userId: string,
  email: string,
  tenantId?: string,
): HeaderMap {
  return {
    authorization: `Bearer ${signToken({
      sub: userId,
      email,
      aud: 'authenticated',
      jti: crypto.randomUUID(),
      ...(tenantId ? { tenantId } : {}),
    })}`,
  };
}

function apiKeyHeaders(token: string): HeaderMap {
  return {
    'x-api-key': token,
  };
}

function createTestAuthGuard(getCtx: () => RlsTestContext) {
  return {
    canActivate: async (context: {
      switchToHttp(): {
        getRequest<T>(): T;
      };
    }) => {
      const request = context.switchToHttp().getRequest<{
        headers: Record<string, string | string[] | undefined>;
        user?: Record<string, unknown>;
        tenantId?: string;
        authMethod?: 'jwt' | 'api_key';
        apiKeyPrefix?: string;
      }>();

      const authorization = request.headers.authorization;
      const bearerToken =
        typeof authorization === 'string' && authorization.startsWith('Bearer ')
          ? authorization.slice('Bearer '.length)
          : undefined;

      if (bearerToken) {
        try {
          const verified = jwt.verify(bearerToken, JWT_SECRET, {
            algorithms: ['HS256'],
            audience: 'authenticated',
          });

          if (
            typeof verified === 'string' ||
            typeof verified.sub !== 'string' ||
            typeof verified.email !== 'string' ||
            (typeof verified.aud !== 'string' &&
              !Array.isArray(verified.aud)) ||
            typeof verified.exp !== 'number' ||
            typeof verified.iat !== 'number'
          ) {
            throw new DomainException({
              type: 'https://agentloom.dev/errors/token-invalid',
              title: 'Unauthorized',
              status: 401,
              detail: 'Token payload is malformed',
            });
          }

          request.user = {
            ...verified,
            sub: verified.sub,
            email: verified.email,
            aud: verified.aud,
            exp: verified.exp,
            iat: verified.iat,
            tenantId:
              typeof verified.tenantId === 'string'
                ? verified.tenantId
                : typeof verified.tenant_id === 'string'
                  ? verified.tenant_id
                  : undefined,
            tenantRole:
              typeof verified.tenantRole === 'string'
                ? verified.tenantRole
                : typeof verified.tenant_role === 'string'
                  ? verified.tenant_role
                  : undefined,
          };
          request.authMethod = 'jwt';
          return true;
        } catch (error) {
          if (error instanceof DomainException) {
            throw error;
          }

          if (error instanceof jwt.TokenExpiredError) {
            throw new DomainException({
              type: 'https://agentloom.dev/errors/token-expired',
              title: 'Unauthorized',
              status: 401,
              detail: 'Token has expired',
            });
          }

          throw new DomainException({
            type: 'https://agentloom.dev/errors/token-invalid',
            title: 'Unauthorized',
            status: 401,
            detail: 'Token signature is invalid or token is malformed',
          });
        }
      }

      const apiKeyHeader = request.headers['x-api-key'];
      const apiKey =
        typeof apiKeyHeader === 'string' ? apiKeyHeader : undefined;

      if (apiKey) {
        if (!apiKey.startsWith(RAW_TOKEN_PREFIX)) {
          throw new DomainException({
            type: 'https://agentloom.dev/errors/platform-api-token-invalid',
            title: 'Unauthorized',
            status: 401,
            detail: 'Platform API token is invalid',
          });
        }

        const [record] = await getCtx().adminSql`
          SELECT id, user_id, tenant_id, token_prefix, is_revoked, expires_at
          FROM "platform_api_tokens"
          WHERE token_hash = ${hashPlatformToken(apiKey)}
        `;

        if (!record || record.is_revoked) {
          throw new DomainException({
            type: 'https://agentloom.dev/errors/platform-api-token-invalid',
            title: 'Unauthorized',
            status: 401,
            detail: 'Platform API token is invalid',
          });
        }

        if (record.expires_at && record.expires_at.getTime() <= Date.now()) {
          throw new DomainException({
            type: 'https://agentloom.dev/errors/platform-api-token-expired',
            title: 'Unauthorized',
            status: 401,
            detail: 'Platform API token has expired',
          });
        }

        request.user = {
          sub: record.user_id,
          email: '',
          aud: 'authenticated',
          exp: 0,
          iat: 0,
          tenantId: record.tenant_id,
        };
        request.tenantId = record.tenant_id;
        request.authMethod = 'api_key';
        request.apiKeyPrefix = record.token_prefix;

        void getCtx().adminSql`
          UPDATE "platform_api_tokens"
          SET last_used_at = NOW(), updated_at = NOW()
          WHERE id = ${record.id}::uuid
        `;

        return true;
      }

      throw new DomainException({
        type: 'https://agentloom.dev/errors/token-missing',
        title: 'Unauthorized',
        status: 401,
        detail:
          'Authorization header or X-Api-Key header is missing or malformed',
      });
    },
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

function createMockNotificationService() {
  return {
    create: vi.fn().mockResolvedValue(undefined),
    findAll: vi.fn().mockResolvedValue({
      data: [],
      meta: { page: 1, pageSize: 10, total: 0, totalPages: 0 },
    }),
    markAsRead: vi.fn().mockResolvedValue(null),
    markAllAsRead: vi.fn().mockResolvedValue({ updatedCount: 0 }),
    getUnreadCount: vi.fn().mockResolvedValue({ count: 0 }),
    upsertPreference: vi.fn().mockResolvedValue(undefined),
    getPreference: vi.fn().mockResolvedValue(null),
    getPreferenceForChannel: vi.fn().mockResolvedValue(null),
  };
}

function createTestUser(prefix: string): TestUser {
  return {
    id: crypto.randomUUID(),
    email: `${prefix}-${crypto.randomUUID().slice(0, 8)}@example.com`,
  };
}

function createRawPlatformToken() {
  return `${RAW_TOKEN_PREFIX}${crypto.randomBytes(32).toString('hex')}`;
}

function hashPlatformToken(rawToken: string) {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

@Module({
  providers: [
    {
      provide: NotificationService,
      useValue: createMockNotificationService(),
    },
  ],
  exports: [NotificationService],
})
class NotificationModuleStub {}

describe('PlatformApiToken E2E', () => {
  let ctx: RlsTestContext;
  let app: NestFastifyApplication;
  let redisClientMock: ReturnType<typeof createMockRedisClient>;
  let redisCacheMock: ReturnType<typeof createMockRedisCacheService>;
  let redisPubSubMock: ReturnType<typeof createMockRedisPubSubService>;

  let tenantId: string;
  let orgId: string;
  let creatorUser: TestUser;
  let viewerUser: TestUser;

  function creatorHeaders(): HeaderMap {
    return authHeaders(creatorUser.id, creatorUser.email, tenantId);
  }

  function viewerHeaders(): HeaderMap {
    return authHeaders(viewerUser.id, viewerUser.email, tenantId);
  }

  async function createTokenRequest(
    body: Record<string, unknown> = {},
    headers: HeaderMap = creatorHeaders(),
  ) {
    return request(app.getHttpServer())
      .post(BASE_PATH)
      .set(headers)
      .send({
        name: `平台令牌-${crypto.randomUUID().slice(0, 8)}`,
        ...body,
      });
  }

  async function createToken(
    body: Record<string, unknown> = {},
    headers: HeaderMap = creatorHeaders(),
  ) {
    const res = await createTokenRequest(body, headers);
    expect(res.status).toBe(201);

    return res.body.data as {
      id: string;
      name: string;
      tokenPrefix: string;
      token: string;
      expiresAt: string | null;
      isRevoked: boolean;
      scopes: string | null;
      lastUsedAt: string | null;
      createdAt: string;
    };
  }

  async function listTokens(
    query: Record<string, string | number> = {},
    headers: HeaderMap = creatorHeaders(),
  ) {
    return request(app.getHttpServer())
      .get(BASE_PATH)
      .set(headers)
      .query(query);
  }

  async function revokeToken(
    tokenId: string,
    headers: HeaderMap = creatorHeaders(),
  ) {
    return request(app.getHttpServer())
      .delete(`${BASE_PATH}/${tokenId}`)
      .set(headers);
  }

  async function seedPlatformToken(
    options: {
      userId?: string;
      tenantId?: string;
      name?: string;
      scopes?: string | null;
      expiresAt?: Date | null;
      lastUsedAt?: Date | null;
      isRevoked?: boolean;
    } = {},
  ): Promise<SeededPlatformToken> {
    const rawToken = createRawPlatformToken();
    const tokenId = crypto.randomUUID();
    const tokenPrefix = rawToken.slice(0, TOKEN_PREFIX_LENGTH);

    await ctx.adminSql`
      INSERT INTO "platform_api_tokens" (
        id,
        user_id,
        tenant_id,
        name,
        token_hash,
        token_prefix,
        scopes,
        last_used_at,
        expires_at,
        is_revoked
      )
      VALUES (
        ${tokenId}::uuid,
        ${options.userId ?? creatorUser.id}::uuid,
        ${options.tenantId ?? tenantId}::uuid,
        ${options.name ?? 'Seeded Platform Token'},
        ${hashPlatformToken(rawToken)},
        ${tokenPrefix},
        ${options.scopes ?? null},
        ${options.lastUsedAt ?? null},
        ${options.expiresAt ?? null},
        ${options.isRevoked ?? false}
      )
    `;

    return {
      tokenId,
      rawToken,
      tokenPrefix,
    };
  }

  beforeAll(async () => {
    process.env.APP_JWT_SECRET = JWT_SECRET;

    ctx = await createRlsTestContext();
    redisClientMock = createMockRedisClient();
    redisCacheMock = createMockRedisCacheService();
    redisPubSubMock = createMockRedisPubSubService();

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideModule(NotificationModule)
      .useModule(NotificationModuleStub)
      .overrideProvider(AuthGuard)
      .useValue(createTestAuthGuard(() => ctx))
      .overrideProvider(SupabaseService)
      .useValue(createMockSupabaseService())
      .overrideProvider(DRIZZLE)
      .useValue(ctx.db)
      .overrideProvider(REDIS_CLIENT)
      .useValue(redisClientMock)
      .overrideProvider(RedisCacheService)
      .useValue(redisCacheMock)
      .overrideProvider(RedisPubSubService)
      .useValue(redisPubSubMock)
      .compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalPipes(new ZodValidationPipe());

    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  }, 60_000);

  afterAll(async () => {
    await app?.close();
    await ctx?.close();
  });

  beforeEach(async () => {
    await ctx.adminSql`DELETE FROM "platform_api_tokens"`;
    await ctx.reset();
    vi.clearAllMocks();

    redisClientMock.get.mockResolvedValue(null);
    redisClientMock.set.mockResolvedValue('OK');
    redisCacheMock.get.mockResolvedValue(null);
    redisCacheMock.set.mockResolvedValue(undefined);
    redisPubSubMock.publish.mockResolvedValue(undefined);

    tenantId = crypto.randomUUID();
    orgId = crypto.randomUUID();
    creatorUser = createTestUser('pat-creator');
    viewerUser = createTestUser('pat-viewer');

    await seedAppUser(ctx.adminSql, creatorUser.id, creatorUser.email);
    await seedOrg(
      ctx.adminSql,
      orgId,
      'Platform Token Test Org',
      `platform-token-org-${crypto.randomUUID().slice(0, 8)}`,
      creatorUser.id,
      tenantId,
    );
    await seedMember(
      ctx.adminSql,
      orgId,
      creatorUser.id,
      'creator',
      creatorUser.id,
    );

    await seedAppUser(ctx.adminSql, viewerUser.id, viewerUser.email);
    await seedMember(
      ctx.adminSql,
      orgId,
      viewerUser.id,
      'viewer',
      creatorUser.id,
    );
  });

  describe('token lifecycle', () => {
    it('创建 token 时应返回一次性明文 token 与基础字段', async () => {
      const res = await createTokenRequest({
        name: 'CI 访问令牌',
        scopes: 'workflow:read',
      });

      expect(res.status).toBe(201);
      expect(res.body.data.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
      expect(res.body.data.name).toBe('CI 访问令牌');
      expect(res.body.data.token).toMatch(/^al_/);
      expect(res.body.data.tokenPrefix).toBe(
        res.body.data.token.slice(0, TOKEN_PREFIX_LENGTH),
      );
      expect(res.body.data.scopes).toBe('workflow:read');
      expect(res.body.data.isRevoked).toBe(false);
      expect(res.body.data.lastUsedAt).toBeNull();
      expect(typeof res.body.data.createdAt).toBe('string');

      const [record] = await ctx.adminSql`
        SELECT token_hash, token_prefix
        FROM "platform_api_tokens"
        WHERE id = ${res.body.data.id}::uuid
      `;

      expect(record).toBeDefined();
      expect(record.token_prefix).toBe(res.body.data.tokenPrefix);
      expect(record.token_hash).toBe(
        hashPlatformToken(res.body.data.token as string),
      );
    });

    it('应返回分页 token 列表与 meta 信息', async () => {
      const first = await createToken({ name: 'Alpha Token' });
      const second = await createToken({ name: 'Beta Token' });

      const res = await listTokens({ page: 1, page_size: 10, status: 'all' });

      expect(res.status).toBe(200);
      expect(res.body.meta).toEqual({
        page: 1,
        pageSize: 10,
        total: 2,
      });
      expect(res.body.data).toHaveLength(2);
      expect(
        (res.body.data as Array<{ id: string; name: string }>).map(
          (item) => item.id,
        ),
      ).toEqual(expect.arrayContaining([first.id, second.id]));
      expect(
        (res.body.data as Array<{ name: string }>).map((item) => item.name),
      ).toEqual(expect.arrayContaining(['Alpha Token', 'Beta Token']));
      expect(res.body.data[0]?.token).toBeUndefined();
    });

    it('应支持 active、revoked 与 all 三种状态过滤', async () => {
      const revoked = await createToken({ name: '待撤销 Token' });
      const active = await createToken({ name: '保持激活 Token' });
      await revokeToken(revoked.id);

      const activeRes = await listTokens({ status: 'active' });
      const revokedRes = await listTokens({ status: 'revoked' });
      const allRes = await listTokens({ status: 'all' });

      expect(activeRes.status).toBe(200);
      expect(activeRes.body.meta.total).toBe(1);
      expect(activeRes.body.data).toHaveLength(1);
      expect(activeRes.body.data[0].id).toBe(active.id);
      expect(activeRes.body.data[0].isRevoked).toBe(false);

      expect(revokedRes.status).toBe(200);
      expect(revokedRes.body.meta.total).toBe(1);
      expect(revokedRes.body.data).toHaveLength(1);
      expect(revokedRes.body.data[0].id).toBe(revoked.id);
      expect(revokedRes.body.data[0].isRevoked).toBe(true);

      expect(allRes.status).toBe(200);
      expect(allRes.body.meta.total).toBe(2);
      expect(allRes.body.data).toHaveLength(2);
    });

    it('撤销 token 应返回 204 并更新数据库状态', async () => {
      const created = await createToken({ name: '待撤销令牌' });

      const res = await revokeToken(created.id);

      expect(res.status).toBe(204);
      expect(res.text).toBe('');

      const [record] = await ctx.adminSql`
        SELECT is_revoked
        FROM "platform_api_tokens"
        WHERE id = ${created.id}::uuid
      `;

      expect(record.is_revoked).toBe(true);
    });

    it('撤销不存在的 token 应返回 404', async () => {
      const missingTokenId = crypto.randomUUID();

      const res = await revokeToken(missingTokenId);

      expect(res.status).toBe(404);
      expect((res.body as ProblemDetailsBody).type).toBe(
        'https://agentloom.dev/errors/platform-api-token-not-found',
      );
    });

    it('重复撤销已撤销 token 应返回 409', async () => {
      const created = await createToken({ name: '重复撤销令牌' });
      await revokeToken(created.id);

      const res = await revokeToken(created.id);

      expect(res.status).toBe(409);
      expect((res.body as ProblemDetailsBody).type).toBe(
        'https://agentloom.dev/errors/platform-api-token-already-revoked',
      );
    });
  });

  describe('API key authentication', () => {
    it('应允许使用 X-Api-Key 访问 token 列表接口', async () => {
      const created = await createToken({ name: 'API Key Auth Token' });

      const res = await listTokens(
        { status: 'all' },
        apiKeyHeaders(created.token),
      );

      expect(res.status).toBe(200);
      expect(res.body.meta.total).toBe(1);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].id).toBe(created.id);
      expect(res.body.data[0].tokenPrefix).toBe(created.tokenPrefix);
    });

    it('已撤销 API key 再次访问应返回 401', async () => {
      const created = await createToken({ name: 'Will Be Revoked' });
      await revokeToken(created.id);

      const res = await listTokens(
        { status: 'all' },
        apiKeyHeaders(created.token),
      );

      expect(res.status).toBe(401);
      expect((res.body as ProblemDetailsBody).type).toBe(
        'https://agentloom.dev/errors/platform-api-token-invalid',
      );
    });

    it('无效 API key 访问应返回 401', async () => {
      const res = await listTokens(
        { status: 'all' },
        apiKeyHeaders('garbage-token'),
      );

      expect(res.status).toBe(401);
      expect((res.body as ProblemDetailsBody).type).toBe(
        'https://agentloom.dev/errors/platform-api-token-invalid',
      );
    });

    it('已过期 API key 访问应返回 401', async () => {
      const expired = await seedPlatformToken({
        name: 'Expired Token',
        expiresAt: new Date(Date.now() - 60_000),
      });

      const res = await listTokens(
        { status: 'all' },
        apiKeyHeaders(expired.rawToken),
      );

      expect(res.status).toBe(401);
      expect((res.body as ProblemDetailsBody).type).toBe(
        'https://agentloom.dev/errors/platform-api-token-expired',
      );
    });
  });

  describe('rate limiting', () => {
    it('列表响应在测试环境支持时应携带限流响应头', async () => {
      await createToken({ name: 'Rate Limit Header Token' });

      const res = await listTokens({ status: 'all' });
      const headerNames = Object.keys(res.headers).filter((name) =>
        name.toLowerCase().includes('ratelimit'),
      );

      expect(res.status).toBe(200);

      if (headerNames.length > 0) {
        for (const headerName of headerNames) {
          expect(String(res.headers[headerName]).length).toBeGreaterThan(0);
        }
      }
    });

    it('同一 API key 超过 100 次请求时应返回 429，并带 Retry-After 与限流头', async () => {
      const primaryToken = await createToken({
        name: 'Primary Rate Limit Token',
      });
      const secondaryToken = await createToken({
        name: 'Secondary Rate Limit Token',
      });

      for (let index = 0; index < 100; index += 1) {
        const res = await listTokens(
          { status: 'all' },
          apiKeyHeaders(primaryToken.token),
        );

        expect(res.status).toBe(200);
      }

      const limited = await listTokens(
        { status: 'all' },
        apiKeyHeaders(primaryToken.token),
      );

      expect(limited.status).toBe(429);
      expect(String(limited.headers['retry-after'] ?? '')).toMatch(/^\d+$/);
      expect(String(limited.headers['x-ratelimit-limit'] ?? '')).toBe('100');
      expect(limited.headers['x-ratelimit-remaining']).toBeDefined();
      expect(limited.headers['x-ratelimit-reset']).toBeDefined();

      const secondaryRes = await listTokens(
        { status: 'all' },
        apiKeyHeaders(secondaryToken.token),
      );

      expect(secondaryRes.status).toBe(200);
    });
  });

  describe('RBAC', () => {
    it('viewer 角色应可以访问 token 列表', async () => {
      const viewerToken = await seedPlatformToken({
        userId: viewerUser.id,
        name: 'Viewer Seeded Token',
      });

      const res = await listTokens({ status: 'all' }, viewerHeaders());

      expect(res.status).toBe(200);
      expect(res.body.meta.total).toBe(1);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].id).toBe(viewerToken.tokenId);
    });

    it('viewer 角色不应可以创建 token', async () => {
      const res = await createTokenRequest(
        { name: 'viewer-create-should-fail' },
        viewerHeaders(),
      );

      expect(res.status).toBe(403);
      expect((res.body as ProblemDetailsBody).type).toBe(
        'https://agentloom.dev/errors/insufficient-permissions',
      );
    });

    it('viewer 角色不应可以撤销 token', async () => {
      const created = await createToken({ name: 'viewer-delete-should-fail' });

      const res = await revokeToken(created.id, viewerHeaders());

      expect(res.status).toBe(403);
      expect((res.body as ProblemDetailsBody).type).toBe(
        'https://agentloom.dev/errors/insufficient-permissions',
      );
    });
  });

  describe('edge cases', () => {
    it('创建 token 时应支持 expires_at 过期时间', async () => {
      const expiresAt = new Date(
        Date.now() + 24 * 60 * 60 * 1000,
      ).toISOString();

      const res = await createTokenRequest({
        name: 'Expiring Token',
        expires_at: expiresAt,
      });

      expect(res.status).toBe(201);
      expect(new Date(res.body.data.expiresAt).toISOString()).toBe(expiresAt);

      const [record] = await ctx.adminSql`
        SELECT expires_at
        FROM "platform_api_tokens"
        WHERE id = ${res.body.data.id}::uuid
      `;

      expect(new Date(record.expires_at).toISOString()).toBe(expiresAt);
    });

    it('单用户单租户超过 20 个活跃 token 时应返回 409', async () => {
      for (let index = 1; index <= 20; index += 1) {
        const res = await createTokenRequest({ name: `Token ${index}` });
        expect(res.status).toBe(201);
      }

      const overflow = await createTokenRequest({ name: 'Overflow Token' });

      expect(overflow.status).toBe(409);
      expect((overflow.body as ProblemDetailsBody).type).toBe(
        'https://agentloom.dev/errors/platform-api-token-limit-exceeded',
      );
    });

    it('缺少 name 时应返回 422', async () => {
      const res = await request(app.getHttpServer())
        .post(BASE_PATH)
        .set(creatorHeaders())
        .send({ scopes: 'workflow:read' });

      expect(res.status).toBe(422);
      expect((res.body as ProblemDetailsBody).type).toBe(
        'https://agentloom.dev/errors/validation-error',
      );
      expect((res.body as ProblemDetailsBody).errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'name',
          }),
        ]),
      );
    });
  });
});
