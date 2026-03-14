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
import { getQueueToken } from '@nestjs/bullmq';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import * as crypto from 'node:crypto';
import * as jwt from 'jsonwebtoken';
import type { JSONValue } from 'postgres';
import request from 'supertest';
import { eq } from 'drizzle-orm';

import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { RedisCacheService } from '../src/common/redis/redis-cache.service';
import { REDIS_CLIENT } from '../src/common/redis/redis.constants';
import { RedisPubSubService } from '../src/common/redis/redis-pubsub.service';
import { ZodValidationPipe } from '../src/common/pipes/zod-validation.pipe';
import { DRIZZLE, type DrizzleDB } from '../src/database/database.module';
import * as schema from '../src/database/schema';
import { EXECUTION_QUEUE } from '../src/modules/execution/execution.constants';
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

const VALID_DEFINITION = {
  nodes: [
    {
      id: 'node-1',
      type: 'agent',
      position: { x: 0, y: 0 },
      data: { label: '开始' },
    },
  ],
  edges: [],
  inputPorts: [
    {
      id: 'input-topic',
      label: '主题',
      dataType: 'text',
    },
  ],
  outputPorts: [
    {
      id: 'output-result',
      label: '结果',
      dataType: 'json',
      sourceNodeId: 'node-1',
      sourcePortId: 'result',
    },
  ],
  viewport: { x: 0, y: 0, zoom: 1 },
} satisfies JSONValue;

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

function createMockExecutionQueue() {
  return {
    add: vi.fn().mockResolvedValue(undefined),
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

describe('ReusableBlock E2E', () => {
  let ctx: RlsTestContext;
  let app: NestFastifyApplication;
  let drizzleDb: DrizzleDB;
  let redisClientMock: ReturnType<typeof createMockRedisClient>;
  let redisCacheMock: ReturnType<typeof createMockRedisCacheService>;
  let redisPubSubMock: ReturnType<typeof createMockRedisPubSubService>;
  let executionQueueMock: ReturnType<typeof createMockExecutionQueue>;

  beforeAll(async () => {
    process.env.APP_JWT_SECRET = JWT_SECRET;

    ctx = await createRlsTestContext();
    drizzleDb = ctx.db;
    redisClientMock = createMockRedisClient();
    redisCacheMock = createMockRedisCacheService();
    redisPubSubMock = createMockRedisPubSubService();
    executionQueueMock = createMockExecutionQueue();

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

    const executionQueue = app.get<Record<string, unknown>>(
      getQueueToken(EXECUTION_QUEUE),
    );
    Reflect.set(executionQueue, 'add', executionQueueMock.add);
  }, 60_000);

  afterAll(async () => {
    await app?.close();
    await ctx?.close();
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
    executionQueueMock.add.mockResolvedValue(undefined);
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

  async function seedReusableBlock(options: {
    tenantId: string;
    organizationId: string;
    createdBy: string;
    name?: string;
    description?: string | null;
    category?: string | null;
    tags?: string[];
    definition?: JSONValue;
    metadata?: JSONValue | null;
    version?: number;
    isPublished?: boolean;
  }) {
    const blockId = crypto.randomUUID();
    const [row] = await ctx.adminSql`
      INSERT INTO reusable_blocks (
        id,
        org_id,
        tenant_id,
        name,
        description,
        category,
        tags,
        definition,
        metadata,
        version,
        is_published,
        created_by
      )
      VALUES (
        ${blockId}::uuid,
        ${options.organizationId}::uuid,
        ${options.tenantId}::uuid,
        ${options.name ?? '已保存可复用块'},
        ${options.description ?? null},
        ${options.category ?? 'analysis'},
        ${options.tags ?? ['analysis']},
        ${ctx.adminSql.json(options.definition ?? VALID_DEFINITION)},
        ${options.metadata ? ctx.adminSql.json(options.metadata) : null},
        ${options.version ?? 1},
        ${options.isPublished ?? false},
        ${options.createdBy}::uuid
      )
      RETURNING *
    `;

    return row;
  }

  it('应当完成 create → list → get → update → delete 的完整 CRUD 生命周期', async () => {
    const owner = await seedTenant('reusable-block-owner');

    const createResponse = await request(app.getHttpServer())
      .post('/api/v1/reusable-blocks')
      .set(owner.headers)
      .send({
        name: '市场分析块',
        description: '用于市场情报汇总',
        category: 'analysis',
        tags: ['market', 'analysis'],
        definition: VALID_DEFINITION,
        metadata: {
          nodeCount: 1,
          author: '狐娘',
          version: 1,
        },
      });

    expect(createResponse.status).toBe(201);
    expect(createResponse.body.data.name).toBe('市场分析块');
    expect(createResponse.body.data.orgId).toBe(owner.organizationId);

    const createdId = createResponse.body.data.id as string;
    const storedAfterCreate = await drizzleDb.query.reusableBlocks.findFirst({
      where: eq(schema.reusableBlocks.id, createdId),
    });

    expect(storedAfterCreate?.tenantId).toBe(owner.tenantId);
    expect(storedAfterCreate?.orgId).toBe(owner.organizationId);

    const listResponse = await request(app.getHttpServer())
      .get('/api/v1/reusable-blocks?page=1&pageSize=10&search=市场')
      .set(owner.headers);

    expect(listResponse.status).toBe(200);
    expect(listResponse.body.meta).toEqual({
      page: 1,
      pageSize: 10,
      total: 1,
      totalPages: 1,
    });
    expect(listResponse.body.data[0].id).toBe(createdId);
    expect(listResponse.body.data[0]).not.toHaveProperty('definition');

    const getResponse = await request(app.getHttpServer())
      .get(`/api/v1/reusable-blocks/${createdId}`)
      .set(owner.headers);

    expect(getResponse.status).toBe(200);
    expect(getResponse.body.data.definition.inputPorts[0].dataType).toBe('text');

    const updatedDefinition = {
      ...VALID_DEFINITION,
      nodes: [
        ...VALID_DEFINITION.nodes,
        {
          id: 'node-2',
          type: 'agent',
          position: { x: 220, y: 0 },
          data: { label: '总结' },
        },
      ],
    };

    const updateResponse = await request(app.getHttpServer())
      .patch(`/api/v1/reusable-blocks/${createdId}`)
      .set(owner.headers)
      .send({
        name: '市场分析块 V2',
        description: null,
        category: 'reporting',
        tags: ['reporting'],
        definition: updatedDefinition,
        metadata: {
          nodeCount: 2,
          author: '狐娘',
          version: 2,
        },
        isPublished: true,
        version: createResponse.body.data.version,
      });

    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body.data.version).toBe(2);
    expect(updateResponse.body.data.isPublished).toBe(true);
    expect(updateResponse.body.data.description).toBeNull();

    const deleteResponse = await request(app.getHttpServer())
      .delete(`/api/v1/reusable-blocks/${createdId}`)
      .set(owner.headers);

    expect(deleteResponse.status).toBe(204);

    const storedAfterDelete = await drizzleDb.query.reusableBlocks.findFirst({
      where: eq(schema.reusableBlocks.id, createdId),
    });
    expect(storedAfterDelete).toBeUndefined();
  });

  it('访问不存在或跨租户资源时应返回 404', async () => {
    const owner = await seedTenant('reusable-block-not-found');
    const outsider = await seedTenant('reusable-block-outsider');
    const block = await seedReusableBlock({
      tenantId: owner.tenantId,
      organizationId: owner.organizationId,
      createdBy: owner.user.id,
    });

    const missingResponse = await request(app.getHttpServer())
      .get(`/api/v1/reusable-blocks/${crypto.randomUUID()}`)
      .set(owner.headers);

    expect(missingResponse.status).toBe(404);
    expect(missingResponse.body).toMatchObject({
      type: 'https://agentloom.dev/errors/reusable-block-not-found',
      title: '可复用块不存在',
      status: 404,
    });

    const crossTenantResponse = await request(app.getHttpServer())
      .get(`/api/v1/reusable-blocks/${block.id}`)
      .set(outsider.headers);

    expect(crossTenantResponse.status).toBe(404);
    expect(crossTenantResponse.body.type).toBe(
      'https://agentloom.dev/errors/reusable-block-not-found',
    );
  });

  it('OCC 版本冲突时应返回 409 与 currentVersion', async () => {
    const owner = await seedTenant('reusable-block-conflict');
    const block = await seedReusableBlock({
      tenantId: owner.tenantId,
      organizationId: owner.organizationId,
      createdBy: owner.user.id,
      version: 3,
    });

    const response = await request(app.getHttpServer())
      .patch(`/api/v1/reusable-blocks/${block.id}`)
      .set(owner.headers)
      .send({
        name: '冲突更新',
        version: 1,
      });

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({
      type: 'https://agentloom.dev/errors/reusable-block-conflict',
      title: '可复用块版本冲突',
      status: 409,
      currentVersion: 3,
    });
  });

  it('viewer 可以读取但不能写入', async () => {
    const viewer = await seedTenant('reusable-block-viewer', 'viewer');

    const listResponse = await request(app.getHttpServer())
      .get('/api/v1/reusable-blocks')
      .set(viewer.headers);

    expect(listResponse.status).toBe(200);

    const createResponse = await request(app.getHttpServer())
      .post('/api/v1/reusable-blocks')
      .set(viewer.headers)
      .send({
        name: 'viewer 块',
        definition: VALID_DEFINITION,
      });

    expect(createResponse.status).toBe(403);
  });

  it('定义校验失败时应返回 422', async () => {
    const owner = await seedTenant('reusable-block-invalid');

    const response = await request(app.getHttpServer())
      .post('/api/v1/reusable-blocks')
      .set(owner.headers)
      .send({
        name: '非法块',
        definition: {
          ...VALID_DEFINITION,
          edges: [
            {
              id: 'edge-1',
              source: 'node-1',
              target: 'missing-node',
            },
          ],
        },
      });

    expect(response.status).toBe(422);
    expect(response.body.type).toBe(
      'https://agentloom.dev/errors/validation-error',
    );
  });
});
