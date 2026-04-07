import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
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
import { ZodValidationPipe } from '../src/common/pipes/zod-validation.pipe';
import { RedisCacheService } from '../src/common/redis/redis-cache.service';
import { REDIS_CLIENT } from '../src/common/redis/redis.constants';
import { RedisPubSubService } from '../src/common/redis/redis-pubsub.service';
import { DRIZZLE, type DrizzleDB } from '../src/database/database.module';
import { SupabaseService } from '../src/modules/auth/supabase/supabase.service';
import {
  createRlsTestContext,
  seedAppUser,
  seedMember,
  seedOrg,
  type OrganizationRole,
  type RlsTestContext,
} from './rls/rls-test-utils';

const JWT_SECRET = 'test-e2e-jwt-secret';

type TestUser = {
  id: string;
  email: string;
};

type AuthenticatedTestUser = TestUser & {
  tenantId?: string;
  tenantRole?: OrganizationRole;
};

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

function createModelPayload(overrides?: Record<string, unknown>) {
  return {
    name: `model-${crypto.randomUUID().slice(0, 8)}`,
    providerId: crypto.randomUUID(),
    modelId: `model-${crypto.randomUUID().slice(0, 8)}`,
    parameters: {
      temperature: 0.4,
    },
    isDefault: false,
    modelType: 'chat',
    ...overrides,
  };
}

function createProviderPayload(overrides?: Record<string, unknown>) {
  const suffix = crypto.randomUUID().slice(0, 8);
  return {
    name: `Provider ${suffix}`,
    slug: `provider-${suffix}`,
    baseUrl: `https://provider-${suffix}.example.com/v1`,
    apiProtocol: 'openai_chat',
    isEnabled: true,
    ...overrides,
  };
}

describe('LLM Model E2E', () => {
  let ctx: RlsTestContext;
  let app: NestFastifyApplication;
  let drizzleDb: DrizzleDB;
  let redisClientMock: ReturnType<typeof createMockRedisClient>;
  let redisCacheMock: ReturnType<typeof createMockRedisCacheService>;
  let redisPubSubMock: ReturnType<typeof createMockRedisPubSubService>;

  beforeAll(async () => {
    process.env.APP_JWT_SECRET = JWT_SECRET;

    ctx = await createRlsTestContext();
    drizzleDb = ctx.db;
    redisClientMock = createMockRedisClient();
    redisCacheMock = createMockRedisCacheService();
    redisPubSubMock = createMockRedisPubSubService();

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(SupabaseService)
      .useValue(createMockSupabaseService())
      .overrideProvider(DRIZZLE)
      .useValue(drizzleDb)
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
  }, 120_000);

  afterAll(async () => {
    await app.close();
    await ctx.close();
  });

  beforeEach(async () => {
    await ctx.reset();
    vi.clearAllMocks();
    redisCacheMock.get.mockResolvedValue(null);
    redisCacheMock.set.mockResolvedValue(undefined);
    redisCacheMock.del.mockResolvedValue(undefined);
    redisCacheMock.delByPattern.mockResolvedValue(undefined);
    redisClientMock.get.mockResolvedValue(null);
    redisClientMock.set.mockResolvedValue('OK');
    redisClientMock.del.mockResolvedValue(0);
    redisClientMock.keys.mockResolvedValue([]);
    redisClientMock.publish.mockResolvedValue(1);
  });

  async function seedTenant(prefix: string, role: OrganizationRole = 'owner') {
    const user = createTestUser(prefix);
    const tenantId = crypto.randomUUID();
    const organizationId = crypto.randomUUID();

    await seedAppUser(ctx.adminSql, user.id, user.email);
    await seedOrg(
      ctx.adminSql,
      organizationId,
      `${prefix} org`,
      `org-${prefix}-${crypto.randomUUID().slice(0, 8)}`,
      user.id,
      tenantId,
    );
    await seedMember(ctx.adminSql, organizationId, user.id, role, user.id);
    await ctx.adminSql`
      UPDATE "users"
      SET current_organization_id = ${organizationId}::uuid
      WHERE id = ${user.id}::uuid
    `;

    return {
      user,
      tenantId,
      organizationId,
      headers: authHeaders(withTenantContext(user, tenantId, role)),
    };
  }

  async function createModel(
    headers: Record<string, string>,
    overrides?: Record<string, unknown>,
  ) {
    const provider =
      overrides?.providerId && typeof overrides.providerId === 'string'
        ? ({ id: overrides.providerId } as const)
        : await createProvider(headers);
    const response = await request(app.getHttpServer())
      .post('/api/v1/llm-models')
      .set(headers)
      .send(
        createModelPayload({
          ...overrides,
          providerId: provider.id,
        }),
      );

    expect(response.status).toBe(201);
    return response.body.data as {
      id: string;
      name: string;
      providerId: string;
      modelId: string;
      parameters: Record<string, unknown>;
      isDefault: boolean;
    };
  }

  async function createProvider(
    headers: Record<string, string>,
    overrides?: Record<string, unknown>,
  ) {
    const response = await request(app.getHttpServer())
      .post('/api/v1/llm-providers')
      .set(headers)
      .send(createProviderPayload(overrides));

    expect(response.status).toBe(201);
    return response.body.data as {
      id: string;
      slug: string;
      name: string;
      baseUrl: string;
      isBuiltin: boolean;
    };
  }

  it('应当创建模型配置并返回 UUIDv7 与 data 包装', async () => {
    const owner = await seedTenant('llm-create-owner');
    const provider = await createProvider(owner.headers, {
      name: 'Primary OpenAI Proxy',
      slug: 'primary-openai-proxy',
    });

    const response = await request(app.getHttpServer())
      .post('/api/v1/llm-models')
      .set(owner.headers)
      .send(
        createModelPayload({
          name: 'primary-openai',
          providerId: provider.id,
          modelId: 'gpt-4o-mini-proxy',
          parameters: { temperature: 0.2, topP: 0.9 },
          isDefault: true,
        }),
      );

    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({
      name: 'primary-openai',
      providerId: provider.id,
      modelId: 'gpt-4o-mini-proxy',
      parameters: { temperature: 0.2, topP: 0.9 },
      isDefault: true,
      modelType: 'chat',
    });
    expect(response.body.data.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it('应当拒绝同组织内重复的模型配置名称', async () => {
    const owner = await seedTenant('llm-conflict-owner');
    const provider = await createProvider(owner.headers, {
      name: 'Conflict Provider',
      slug: 'conflict-provider',
    });
    const payload = createModelPayload({
      name: 'duplicate-name',
      providerId: provider.id,
      modelId: 'conflict-model',
    });

    await request(app.getHttpServer())
      .post('/api/v1/llm-models')
      .set(owner.headers)
      .send(payload)
      .expect(201);

    const response = await request(app.getHttpServer())
      .post('/api/v1/llm-models')
      .set(owner.headers)
      .send(payload);

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({
      type: 'https://agentloom.dev/errors/llm/config-name-conflict',
      status: 409,
    });
  });

  it('应当通过 RLS 仅列出当前租户可见的模型配置', async () => {
    const owner = await seedTenant('llm-list-owner');
    const otherTenantOwner = await seedTenant('llm-list-other-owner');

    const ownerModel = await createModel(owner.headers, {
      name: 'owner-model',
      modelId: 'owner-model-v1',
    });
    const otherTenantModel = await createModel(otherTenantOwner.headers, {
      name: 'other-tenant-model',
      modelId: 'other-tenant-model-v1',
    });

    const ownerResponse = await request(app.getHttpServer())
      .get('/api/v1/llm-models')
      .set(owner.headers);

    expect(ownerResponse.status).toBe(200);
    expect(ownerResponse.body.data).toHaveLength(1);
    expect(ownerResponse.body.data[0]).toMatchObject({
      id: ownerModel.id,
      name: 'owner-model',
      modelId: 'owner-model-v1',
      provider: expect.objectContaining({
        id: ownerModel.providerId,
      }),
    });

    const otherTenantResponse = await request(app.getHttpServer())
      .get('/api/v1/llm-models')
      .set(otherTenantOwner.headers);

    expect(otherTenantResponse.status).toBe(200);
    expect(otherTenantResponse.body.data).toHaveLength(1);
    expect(otherTenantResponse.body.data[0]).toMatchObject({
      id: otherTenantModel.id,
      name: 'other-tenant-model',
      modelId: 'other-tenant-model-v1',
      provider: expect.objectContaining({
        id: otherTenantModel.providerId,
      }),
    });
  });

  it('应当按 ID 读取当前租户的模型配置，并对跨租户访问返回 404', async () => {
    const owner = await seedTenant('llm-find-owner');
    const otherTenant = await seedTenant('llm-find-other', 'viewer');
    const model = await createModel(owner.headers, {
      name: 'owner-find-model',
      modelId: 'owner-find-model-v1',
    });

    const response = await request(app.getHttpServer())
      .get(`/api/v1/llm-models/${model.id}`)
      .set(owner.headers);

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      id: model.id,
      name: 'owner-find-model',
      modelId: 'owner-find-model-v1',
      provider: expect.objectContaining({
        id: model.providerId,
      }),
    });

    const crossTenantResponse = await request(app.getHttpServer())
      .get(`/api/v1/llm-models/${model.id}`)
      .set(otherTenant.headers);

    expect(crossTenantResponse.status).toBe(404);
    expect(crossTenantResponse.body).toMatchObject({
      type: 'https://agentloom.dev/errors/llm/config-not-found',
      status: 404,
    });
  });

  it('应当在模型配置不存在时返回 RFC7807 404', async () => {
    const owner = await seedTenant('llm-not-found-owner', 'viewer');

    const response = await request(app.getHttpServer())
      .get(`/api/v1/llm-models/${crypto.randomUUID()}`)
      .set(owner.headers);

    expect(response.status).toBe(404);
    expect(response.headers['content-type']).toContain(
      'application/problem+json',
    );
    expect(response.body).toMatchObject({
      type: 'https://agentloom.dev/errors/llm/config-not-found',
      title: 'LLM 模型配置未找到',
      status: 404,
    });
  });

  it('应当更新模型配置', async () => {
    const owner = await seedTenant('llm-update-owner');
    const model = await createModel(owner.headers, {
      name: 'before-update',
      modelId: 'before-update-v1',
      parameters: { temperature: 0.1 },
    });
    const updatedProvider = await createProvider(owner.headers, {
      name: 'Anthropic Proxy',
      slug: 'anthropic-proxy',
    });

    const response = await request(app.getHttpServer())
      .patch(`/api/v1/llm-models/${model.id}`)
      .set(owner.headers)
      .send({
        name: 'after-update',
        providerId: updatedProvider.id,
        modelId: 'claude-3-5-haiku-proxy',
        parameters: { temperature: 0.8 },
        isDefault: true,
      });

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      id: model.id,
      name: 'after-update',
      providerId: updatedProvider.id,
      modelId: 'claude-3-5-haiku-proxy',
      parameters: { temperature: 0.8 },
      isDefault: true,
    });
  });

  it('应当删除模型配置并在后续查询中返回 404', async () => {
    const owner = await seedTenant('llm-delete-owner');
    const model = await createModel(owner.headers, { name: 'to-delete' });

    const deleteResponse = await request(app.getHttpServer())
      .delete(`/api/v1/llm-models/${model.id}`)
      .set(owner.headers);

    expect(deleteResponse.status).toBe(204);
    expect(deleteResponse.text).toBe('');

    const getResponse = await request(app.getHttpServer())
      .get(`/api/v1/llm-models/${model.id}`)
      .set(owner.headers);

    expect(getResponse.status).toBe(404);
  });

  it('应当在请求体非法时返回 422 validation-error', async () => {
    const owner = await seedTenant('llm-invalid-owner');

    const response = await request(app.getHttpServer())
      .post('/api/v1/llm-models')
      .set(owner.headers)
      .send({
        name: '',
        providerId: 'unsupported-provider',
        modelId: '',
      });

    expect(response.status).toBe(422);
    expect(response.body).toMatchObject({
      type: 'https://agentloom.dev/errors/validation-error',
      title: 'Validation Error',
      status: 422,
    });
    expect(response.body.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'name' }),
        expect.objectContaining({ field: 'providerId' }),
        expect.objectContaining({ field: 'modelId' }),
      ]),
    );
  });

  it('应当返回组织范围内的 LLM provider 列表', async () => {
    const owner = await seedTenant('llm-provider-owner');
    const customProvider = await createProvider(owner.headers, {
      name: 'Tenant Custom Provider',
      slug: 'tenant-custom-provider',
      baseUrl: 'https://tenant-custom-provider.example.com/v1',
    });

    const response = await request(app.getHttpServer())
      .get('/api/v1/llm-providers')
      .set(owner.headers);

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: customProvider.id,
          slug: 'tenant-custom-provider',
          name: 'Tenant Custom Provider',
          baseUrl: 'https://tenant-custom-provider.example.com/v1',
          isBuiltin: false,
        }),
      ]),
    );
  });
});
