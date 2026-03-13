import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

vi.mock('@anatine/zod-nestjs', async () => {
  const { createZodDto } = await import('nestjs-zod');
  return { createZodDto };
});

import { Test } from '@nestjs/testing';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import * as crypto from 'node:crypto';
import * as jwt from 'jsonwebtoken';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { RedisCacheService } from '../src/common/redis/redis-cache.service';
import { REDIS_CLIENT } from '../src/common/redis/redis.constants';
import { RedisPubSubService } from '../src/common/redis/redis-pubsub.service';
import { ZodValidationPipe } from '../src/common/pipes/zod-validation.pipe';
import { DRIZZLE } from '../src/database/database.module';
import { SupabaseService } from '../src/modules/auth/supabase/supabase.service';
import {
  createRlsTestContext,
  seedAppUser,
  type RlsTestContext,
} from './rls/rls-test-utils';

const JWT_SECRET = 'test-e2e-jwt-secret';

function signToken(payload: Record<string, unknown>) {
  return jwt.sign(payload, JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: '1h',
  });
}

function authHeaders(userId: string, email: string) {
  return {
    authorization: `Bearer ${signToken({
      sub: userId,
      email,
      aud: 'authenticated',
      jti: crypto.randomUUID(),
    })}`,
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

describe('DeviceToken E2E', () => {
  let ctx: RlsTestContext;
  let app: NestFastifyApplication;
  let redisClientMock: ReturnType<typeof createMockRedisClient>;
  let redisCacheMock: ReturnType<typeof createMockRedisCacheService>;
  let redisPubSubMock: ReturnType<typeof createMockRedisPubSubService>;

  const testUserId = crypto.randomUUID();
  const testUserEmail = `device-e2e-${crypto.randomUUID().slice(0, 8)}@example.com`;

  beforeAll(async () => {
    process.env.APP_JWT_SECRET = JWT_SECRET;

    ctx = await createRlsTestContext();
    redisClientMock = createMockRedisClient();
    redisCacheMock = createMockRedisCacheService();
    redisPubSubMock = createMockRedisPubSubService();

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
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
    // device_tokens 不在 cleanupTables() 中，需手动清理
    await ctx.adminSql`DELETE FROM "device_tokens"`;
    await ctx.reset();
    vi.clearAllMocks();
    redisClientMock.get.mockResolvedValue(null);

    // 每次 reset 后重新创建测试用户（reset 会删除 users 表）
    await seedAppUser(ctx.adminSql, testUserId, testUserEmail);
  });

  describe('POST /api/v1/devices/register', () => {
    it('应成功注册设备 token', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/devices/register')
        .set(authHeaders(testUserId, testUserEmail))
        .send({
          deviceToken: 'fcm-token-abc-123',
          platform: 'android',
        });

      expect(res.status).toBe(201);
      expect(res.body).toEqual({ status: 'ok' });

      // 验证数据库记录
      const [record] = await ctx.adminSql`
        SELECT user_id, device_token, platform, is_active
        FROM device_tokens
        WHERE user_id = ${testUserId}::uuid
      `;
      expect(record).toBeDefined();
      expect(record.device_token).toBe('fcm-token-abc-123');
      expect(record.platform).toBe('android');
      expect(record.is_active).toBe(true);
    });

    it('应支持 iOS 平台', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/devices/register')
        .set(authHeaders(testUserId, testUserEmail))
        .send({
          deviceToken: 'apns-token-xyz-789',
          platform: 'ios',
        });

      expect(res.status).toBe(201);
      expect(res.body).toEqual({ status: 'ok' });
    });

    it('重复注册应 upsert 更新（幂等）', async () => {
      const token = 'fcm-token-duplicate';

      // 首次注册
      await request(app.getHttpServer())
        .post('/api/v1/devices/register')
        .set(authHeaders(testUserId, testUserEmail))
        .send({ deviceToken: token, platform: 'android' });

      // 同一 token 再次注册（更新平台）
      const res = await request(app.getHttpServer())
        .post('/api/v1/devices/register')
        .set(authHeaders(testUserId, testUserEmail))
        .send({ deviceToken: token, platform: 'ios' });

      expect(res.status).toBe(201);

      // 应只有一条记录，且 platform 已更新
      const records = await ctx.adminSql`
        SELECT * FROM device_tokens
        WHERE user_id = ${testUserId}::uuid AND device_token = ${token}
      `;
      expect(records).toHaveLength(1);
      expect(records[0].platform).toBe('ios');
      expect(records[0].is_active).toBe(true);
    });

    it('注销后重新注册应恢复 is_active', async () => {
      const token = 'fcm-token-reactivate';

      // 注册
      await request(app.getHttpServer())
        .post('/api/v1/devices/register')
        .set(authHeaders(testUserId, testUserEmail))
        .send({ deviceToken: token, platform: 'android' });

      // 注销
      await request(app.getHttpServer())
        .delete('/api/v1/devices/unregister')
        .set(authHeaders(testUserId, testUserEmail))
        .send({ deviceToken: token });

      // 确认已注销
      const [deactivated] = await ctx.adminSql`
        SELECT is_active FROM device_tokens
        WHERE user_id = ${testUserId}::uuid AND device_token = ${token}
      `;
      expect(deactivated.is_active).toBe(false);

      // 重新注册
      const res = await request(app.getHttpServer())
        .post('/api/v1/devices/register')
        .set(authHeaders(testUserId, testUserEmail))
        .send({ deviceToken: token, platform: 'android' });

      expect(res.status).toBe(201);

      // 确认已恢复
      const [reactivated] = await ctx.adminSql`
        SELECT is_active FROM device_tokens
        WHERE user_id = ${testUserId}::uuid AND device_token = ${token}
      `;
      expect(reactivated.is_active).toBe(true);
    });

    it('缺少 deviceToken 应返回 422', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/devices/register')
        .set(authHeaders(testUserId, testUserEmail))
        .send({ platform: 'android' });

      expect(res.status).toBe(422);
    });

    it('无效 platform 应返回 422', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/devices/register')
        .set(authHeaders(testUserId, testUserEmail))
        .send({ deviceToken: 'abc', platform: 'windows' });

      expect(res.status).toBe(422);
    });

    it('未认证应返回 401', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/devices/register')
        .send({ deviceToken: 'abc', platform: 'android' });

      expect(res.status).toBe(401);
    });
  });

  describe('DELETE /api/v1/devices/unregister', () => {
    it('应成功注销设备 token（软删除）', async () => {
      // 先注册
      await request(app.getHttpServer())
        .post('/api/v1/devices/register')
        .set(authHeaders(testUserId, testUserEmail))
        .send({ deviceToken: 'fcm-token-to-remove', platform: 'android' });

      // 注销
      const res = await request(app.getHttpServer())
        .delete('/api/v1/devices/unregister')
        .set(authHeaders(testUserId, testUserEmail))
        .send({ deviceToken: 'fcm-token-to-remove' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: 'ok' });

      // 验证软删除：记录存在但 is_active 为 false
      const [record] = await ctx.adminSql`
        SELECT is_active FROM device_tokens
        WHERE user_id = ${testUserId}::uuid AND device_token = ${'fcm-token-to-remove'}
      `;
      expect(record).toBeDefined();
      expect(record.is_active).toBe(false);
    });

    it('注销不存在的 token 应静默成功', async () => {
      const res = await request(app.getHttpServer())
        .delete('/api/v1/devices/unregister')
        .set(authHeaders(testUserId, testUserEmail))
        .send({ deviceToken: 'non-existent-token' });

      // unregister 是 UPDATE WHERE，不存在时也不报错
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: 'ok' });
    });

    it('缺少 deviceToken 应返回 422', async () => {
      const res = await request(app.getHttpServer())
        .delete('/api/v1/devices/unregister')
        .set(authHeaders(testUserId, testUserEmail))
        .send({});

      expect(res.status).toBe(422);
    });

    it('未认证应返回 401', async () => {
      const res = await request(app.getHttpServer())
        .delete('/api/v1/devices/unregister')
        .send({ deviceToken: 'abc' });

      expect(res.status).toBe(401);
    });

    it('用户只能注销自己的 token', async () => {
      // 用户 A 注册 token
      await request(app.getHttpServer())
        .post('/api/v1/devices/register')
        .set(authHeaders(testUserId, testUserEmail))
        .send({ deviceToken: 'user-a-token', platform: 'android' });

      // 用户 B 尝试注销用户 A 的 token
      const otherUserId = crypto.randomUUID();
      const otherEmail = `other-${crypto.randomUUID().slice(0, 8)}@example.com`;
      await seedAppUser(ctx.adminSql, otherUserId, otherEmail);

      await request(app.getHttpServer())
        .delete('/api/v1/devices/unregister')
        .set(authHeaders(otherUserId, otherEmail))
        .send({ deviceToken: 'user-a-token' });

      // 用户 A 的 token 应仍然活跃（因为 unregister WHERE userId=B）
      const [record] = await ctx.adminSql`
        SELECT is_active FROM device_tokens
        WHERE user_id = ${testUserId}::uuid AND device_token = ${'user-a-token'}
      `;
      expect(record.is_active).toBe(true);
    });
  });
});
