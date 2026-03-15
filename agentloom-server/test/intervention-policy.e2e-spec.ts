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
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { RedisCacheService } from '../src/common/redis/redis-cache.service';
import { REDIS_CLIENT } from '../src/common/redis/redis.constants';
import { RedisPubSubService } from '../src/common/redis/redis-pubsub.service';
import { ZodValidationPipe } from '../src/common/pipes/zod-validation.pipe';
import { DRIZZLE, type DrizzleDB } from '../src/database/database.module';
import { EXECUTION_QUEUE } from '../src/modules/execution/execution.constants';
import { SupabaseService } from '../src/modules/auth/supabase/supabase.service';
import {
  createRlsTestContext,
  seedAppUser,
  seedMember,
  seedOrg,
  seedWorkflowDefinition,
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

describe('InterventionPolicy E2E', () => {
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
      SET "current_organization_id" = ${organizationId}
      WHERE "id" = ${user.id}
    `;

    return {
      user,
      tenantId,
      organizationId,
      headers: authHeaders(withTenantContext(user, tenantId, role)),
    };
  }

  it('GET /resolve 应返回扁平系统默认策略，而不是 policy:null', async () => {
    const tenant = await seedTenant('intervention-policy');
    const workflowId = crypto.randomUUID();

    await seedWorkflowDefinition(ctx.adminSql, {
      id: workflowId,
      tenantId: tenant.tenantId,
      name: 'Intervention Workflow',
      slug: `intervention-workflow-${crypto.randomUUID().slice(0, 8)}`,
      createdBy: tenant.user.id,
      updatedBy: tenant.user.id,
      status: 'draft',
    });

    const response = await request(app.getHttpServer())
      .get(
        `/api/v1/workflow-definitions/${workflowId}/intervention-policies/resolve`,
      )
      .set(tenant.headers);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      data: {
        allowedRoles: ['owner', 'admin'],
        timeoutSeconds: 86400,
        timeoutAction: 'reject',
        escalateToRole: null,
        notifyChannels: ['in_app'],
        source: 'system_default',
      },
    });
  });
});
