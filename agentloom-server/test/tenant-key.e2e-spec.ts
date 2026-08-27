import type { vi as ViGlobal } from 'vitest';

// vitest 会把 vi.mock 提升到文件顶部，因此这里必须先声明 vi 才能通过类型检查。
declare const vi: typeof ViGlobal;

// vi.mock 工厂被提升到所有 import 之上，无法改用静态 import，只能用动态 import。
vi.mock('@anatine/zod-nestjs', async () => {
  const { createZodDto } = await import('nestjs-zod');
  return { createZodDto };
});

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
const BASE_PATH = '/api/v1/tenant-keys';

type TestUser = {
  id: string;
  email: string;
};

type HeaderMap = Record<string, string>;

/**
 * 4096 位 RSA 生成很慢（单次可达数秒），而主链需要多把互不相同的公钥。
 * 因此在 beforeAll 里一次性预生成并轮转取用，避免每个用例各自生成拖垮套件。
 */
const publicKeyPool: string[] = [];
let publicKeyCursor = 0;

function nextPublicKey(): string {
  const key = publicKeyPool[publicKeyCursor % publicKeyPool.length];
  publicKeyCursor += 1;
  return key;
}

function generateRsaPublicKeyPem(modulusLength: number): string {
  return crypto
    .generateKeyPairSync('rsa', { modulusLength })
    .publicKey.export({ type: 'spki', format: 'pem' })
    .toString();
}

function signToken(payload: Record<string, unknown>) {
  return jwt.sign(payload, JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: '1h',
  });
}

/**
 * 关键：**不注入任何 org claim**。D-16 的触发条件正是验收环境的 JWT 只带
 * tenant_id 而无 org_id —— 旧实现把 undefined 直接塞进 Drizzle 的
 * eq(organizationId, …) 条件里，导致 DrizzleQueryError 冒泡成 500。
 */
function authHeaders(
  userId: string,
  email: string,
  tenantId: string,
  tenantRole: string,
): HeaderMap {
  return {
    authorization: `Bearer ${signToken({
      sub: userId,
      email,
      aud: 'authenticated',
      jti: crypto.randomUUID(),
      tenantId,
      tenantRole,
    })}`,
  };
}

function createTestAuthGuard() {
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
      }>();

      const authorization = request.headers.authorization;
      const bearerToken =
        typeof authorization === 'string' && authorization.startsWith('Bearer ')
          ? authorization.slice('Bearer '.length)
          : undefined;

      if (!bearerToken) {
        throw new DomainException({
          type: 'https://agentloom.dev/errors/token-missing',
          title: 'Unauthorized',
          status: 401,
          detail: 'Authorization header is missing or malformed',
        });
      }

      try {
        const verified = jwt.verify(bearerToken, JWT_SECRET, {
          algorithms: ['HS256'],
          audience: 'authenticated',
        });

        if (typeof verified === 'string') {
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
          tenantId:
            typeof verified.tenantId === 'string'
              ? verified.tenantId
              : undefined,
          tenantRole:
            typeof verified.tenantRole === 'string'
              ? verified.tenantRole
              : undefined,
        };
        request.authMethod = 'jwt';
        return true;
      } catch (error) {
        if (error instanceof DomainException) {
          throw error;
        }

        throw new DomainException({
          type: 'https://agentloom.dev/errors/token-invalid',
          title: 'Unauthorized',
          status: 401,
          detail: 'Token signature is invalid or token is malformed',
        });
      }
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

describe('TenantKey E2E', () => {
  let ctx: RlsTestContext;
  let app: NestFastifyApplication;

  let tenantId: string;
  let orgId: string;
  let ownerUser: TestUser;
  let viewerUser: TestUser;

  function ownerHeaders(): HeaderMap {
    return authHeaders(ownerUser.id, ownerUser.email, tenantId, 'owner');
  }

  function viewerHeaders(): HeaderMap {
    return authHeaders(viewerUser.id, viewerUser.email, tenantId, 'viewer');
  }

  async function uploadKey(
    publicKey: string = nextPublicKey(),
    headers: HeaderMap = ownerHeaders(),
  ) {
    return request(app.getHttpServer())
      .post(BASE_PATH)
      .set(headers)
      .send({ publicKey });
  }

  async function listKeys(headers: HeaderMap = ownerHeaders()) {
    return request(app.getHttpServer()).get(BASE_PATH).set(headers);
  }

  async function rotateKey(
    keyId: string,
    publicKey: string = nextPublicKey(),
    headers: HeaderMap = ownerHeaders(),
  ) {
    return request(app.getHttpServer())
      .post(`${BASE_PATH}/${keyId}/rotate`)
      .set(headers)
      .send({ publicKey });
  }

  async function revokeKey(keyId: string, headers: HeaderMap = ownerHeaders()) {
    return request(app.getHttpServer())
      .delete(`${BASE_PATH}/${keyId}`)
      .set(headers);
  }

  beforeAll(async () => {
    process.env.APP_JWT_SECRET = JWT_SECRET;

    for (let i = 0; i < 4; i += 1) {
      publicKeyPool.push(generateRsaPublicKeyPem(4096));
    }

    ctx = await createRlsTestContext();

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideModule(NotificationModule)
      .useModule(NotificationModuleStub)
      .overrideProvider(AuthGuard)
      .useValue(createTestAuthGuard())
      .overrideProvider(SupabaseService)
      .useValue(createMockSupabaseService())
      .overrideProvider(DRIZZLE)
      .useValue(ctx.db)
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
  }, 180_000);

  afterAll(async () => {
    await app?.close();
    await ctx?.close();
  });

  beforeEach(async () => {
    await ctx.adminSql`DELETE FROM "tenant_encryption_keys"`;
    await ctx.reset();
    vi.clearAllMocks();

    tenantId = crypto.randomUUID();
    orgId = crypto.randomUUID();
    ownerUser = createTestUser('tenant-key-owner');
    viewerUser = createTestUser('tenant-key-viewer');

    await seedAppUser(ctx.adminSql, ownerUser.id, ownerUser.email);
    await seedOrg(
      ctx.adminSql,
      orgId,
      'Tenant Key Test Org',
      `tenant-key-org-${crypto.randomUUID().slice(0, 8)}`,
      ownerUser.id,
      tenantId,
    );
    await seedMember(ctx.adminSql, orgId, ownerUser.id, 'owner', ownerUser.id);

    await seedAppUser(ctx.adminSql, viewerUser.id, viewerUser.email);
    await seedMember(
      ctx.adminSql,
      orgId,
      viewerUser.id,
      'viewer',
      ownerUser.id,
    );
  });

  describe('无 org claim 的 JWT（D-16 回归）', () => {
    it('列表端点应解析出组织并返回 200，而不是 DrizzleQueryError 500', async () => {
      const res = await listKeys();

      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it('上传端点应把密钥落到解析出的组织下，而不是 500', async () => {
      const res = await uploadKey();

      expect(res.status).toBe(201);
      expect(res.body.orgId).toBe(orgId);

      const [record] = await ctx.adminSql`
        SELECT organization_id, tenant_id, status
        FROM "tenant_encryption_keys"
        WHERE id = ${res.body.id}::uuid
      `;

      expect(record.organization_id).toBe(orgId);
      expect(record.tenant_id).toBe(tenantId);
      expect(record.status).toBe('active');
    });

    it('租户未关联任何组织时应在 guard 链上被 403 拦下，且不再退化为 500', async () => {
      // 说明：TenantOrganizationNotFoundException（404）是 controller 层的兜底，
      // 但 HTTP 边界上到不了它——角色来自 organization_members，孤儿租户查不到成员
      // 记录，RolesGuard 先返回 403。这里锁住的是"孤儿租户不会再 500"这个真实契约；
      // 404 分支由 tenant-key.controller.spec.ts / tenant-key.service.spec.ts 覆盖。
      const orphanTenantId = crypto.randomUUID();
      const res = await listKeys(
        authHeaders(ownerUser.id, ownerUser.email, orphanTenantId, 'owner'),
      );

      expect(res.status).toBe(403);
      expect(res.body.type).toBe(
        'https://agentloom.dev/errors/insufficient-permissions',
      );
    });
  });

  describe('主链 upload → list → detail → rotate → revoke', () => {
    it('应串起完整生命周期并在每一步反映正确状态', async () => {
      const uploaded = await uploadKey();
      expect(uploaded.status).toBe(201);
      const keyId = uploaded.body.id as string;
      const originalFingerprint = uploaded.body.keyFingerprint as string;
      expect(uploaded.body.status).toBe('active');
      expect(uploaded.body.publicKey).toContain('BEGIN PUBLIC KEY');

      const listed = await listKeys();
      expect(listed.status).toBe(200);
      expect(listed.body).toHaveLength(1);
      expect(listed.body[0].id).toBe(keyId);
      // 列表投影不得泄漏公钥正文，详情端点才返回。
      expect(listed.body[0].publicKey).toBeUndefined();

      const detail = await request(app.getHttpServer())
        .get(`${BASE_PATH}/${keyId}`)
        .set(ownerHeaders());
      expect(detail.status).toBe(200);
      expect(detail.body.id).toBe(keyId);
      expect(detail.body.publicKey).toContain('BEGIN PUBLIC KEY');

      const rotated = await rotateKey(keyId);
      expect(rotated.status).toBe(200);
      expect(rotated.body.keyFingerprint).not.toBe(originalFingerprint);

      const afterRotate = await listKeys();
      expect(afterRotate.status).toBe(200);
      // 轮换会把旧密钥置为 rotating 并新建 active，二者都应留痕。
      const statusesAfterRotate = afterRotate.body
        .map((k: { status: string }) => k.status)
        .sort();
      expect(statusesAfterRotate).toContain('active');

      const revoked = await revokeKey(rotated.body.id as string);
      expect(revoked.status).toBe(200);
      expect(revoked.body.status).toBe('revoked');
      expect(revoked.body.revokedAt).not.toBeNull();

      const [revokedRecord] = await ctx.adminSql`
        SELECT status, revoked_at
        FROM "tenant_encryption_keys"
        WHERE id = ${rotated.body.id}::uuid
      `;
      expect(revokedRecord.status).toBe('revoked');
      expect(revokedRecord.revoked_at).not.toBeNull();
    });

    it('已存在活跃密钥时重复上传应返回 409', async () => {
      const first = await uploadKey();
      expect(first.status).toBe(201);

      const duplicate = await uploadKey();

      expect(duplicate.status).toBe(409);
      expect(duplicate.body.type).toBe(
        'https://agentloom.dev/errors/tenant-key-already-exists',
      );
    });

    it('撤销后再次撤销应返回 409 而不是重复成功', async () => {
      const uploaded = await uploadKey();
      const keyId = uploaded.body.id as string;

      expect((await revokeKey(keyId)).status).toBe(200);

      const second = await revokeKey(keyId);
      expect(second.status).toBe(409);
      expect(second.body.type).toBe(
        'https://agentloom.dev/errors/tenant-key-revoked',
      );
    });

    it('轮换已撤销的密钥应返回 409', async () => {
      const uploaded = await uploadKey();
      const keyId = uploaded.body.id as string;
      await revokeKey(keyId);

      const res = await rotateKey(keyId);

      expect(res.status).toBe(409);
      expect(res.body.type).toBe(
        'https://agentloom.dev/errors/tenant-key-revoked',
      );
    });
  });

  describe('隔离与校验', () => {
    it('不应读取到其他租户的密钥', async () => {
      const uploaded = await uploadKey();
      const keyId = uploaded.body.id as string;

      const otherTenantId = crypto.randomUUID();
      const otherOrgId = crypto.randomUUID();
      const otherUser = createTestUser('tenant-key-other');
      await seedAppUser(ctx.adminSql, otherUser.id, otherUser.email);
      await seedOrg(
        ctx.adminSql,
        otherOrgId,
        'Other Org',
        `other-org-${crypto.randomUUID().slice(0, 8)}`,
        otherUser.id,
        otherTenantId,
      );
      await seedMember(
        ctx.adminSql,
        otherOrgId,
        otherUser.id,
        'owner',
        otherUser.id,
      );

      const otherHeaders = authHeaders(
        otherUser.id,
        otherUser.email,
        otherTenantId,
        'owner',
      );

      const crossList = await listKeys(otherHeaders);
      expect(crossList.status).toBe(200);
      expect(crossList.body).toEqual([]);

      const crossDetail = await request(app.getHttpServer())
        .get(`${BASE_PATH}/${keyId}`)
        .set(otherHeaders);
      expect(crossDetail.status).toBe(404);
    });

    it('弱于 4096 位的 RSA 公钥应被拒绝为 400', async () => {
      const res = await uploadKey(generateRsaPublicKeyPem(2048));

      expect(res.status).toBe(400);
      expect(res.body.type).toBe(
        'https://agentloom.dev/errors/tenant-key-invalid',
      );
    });

    it('viewer 角色不得上传密钥', async () => {
      const res = await uploadKey(nextPublicKey(), viewerHeaders());

      expect(res.status).toBe(403);
    });
  });
});
