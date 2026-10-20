import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

// vi.mock 工厂会被提升到 import 之前执行，只能在工厂内动态加载替身模块
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
import {
  createMockRedisClient,
  type MockRedisClient,
} from './support/redis-client.mock';
import { RedisPubSubService } from '../src/common/redis/redis-pubsub.service';
import { ZodValidationPipe } from '../src/common/pipes/zod-validation.pipe';
import { DRIZZLE } from '../src/database/database.module';
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

/**
 * 子集合端点的父资源归属（D-217 / D-218）：子表受 RLS 过滤，他租户或不存在的父 id
 * 曾得到 200 空集合 / 409「沙箱不可用」。父资源必须先在租户内断言存在，否则 404。
 */

const JWT_SECRET = 'test-e2e-jwt-secret';
const ERRORS = 'https://agentloom.dev/errors';

type TestUser = { id: string; email: string };

type SeededTenant = {
  user: TestUser;
  tenantId: string;
  headers: { authorization: string };
};

function authHeaders(user: TestUser, tenantId: string, role: OrganizationRole) {
  const token = jwt.sign(
    {
      sub: user.id,
      email: user.email,
      aud: 'authenticated',
      jti: crypto.randomUUID(),
      tenant_id: tenantId,
      tenant_role: role,
    },
    JWT_SECRET,
    { algorithm: 'HS256', expiresIn: '1h' },
  );
  return { authorization: `Bearer ${token}` };
}

function createTestUser(prefix: string): TestUser {
  return {
    id: crypto.randomUUID(),
    email: `${prefix}-${crypto.randomUUID().slice(0, 8)}@example.com`,
  };
}

type SubcollectionRoute = {
  name: string;
  method: 'get' | 'post';
  path: (ids: ParentIds) => string;
  body?: Record<string, unknown>;
  notFoundType: string;
  /** 本租户访问自己的父资源时的状态码 */
  ownerStatus: number;
};

type ParentIds = {
  workflowId: string;
  executionId: string;
  appId: string;
  runId: string;
  conversationId: string;
};

const ROUTES: SubcollectionRoute[] = [
  {
    name: 'workflow-definitions executions',
    method: 'get',
    path: (ids) => `/api/v1/workflow-definitions/${ids.workflowId}/executions`,
    notFoundType: `${ERRORS}/workflow-not-found`,
    ownerStatus: 200,
  },
  {
    name: 'workflows executions',
    method: 'get',
    path: (ids) => `/api/v1/workflows/${ids.workflowId}/executions`,
    notFoundType: `${ERRORS}/workflow-not-found`,
    ownerStatus: 200,
  },
  {
    name: 'triggers',
    method: 'get',
    path: (ids) => `/api/v1/workflow-definitions/${ids.workflowId}/triggers`,
    notFoundType: `${ERRORS}/workflow-not-found`,
    ownerStatus: 200,
  },
  {
    name: 'intervention-policies',
    method: 'get',
    path: (ids) =>
      `/api/v1/workflow-definitions/${ids.workflowId}/intervention-policies`,
    notFoundType: `${ERRORS}/workflow-not-found`,
    ownerStatus: 200,
  },
  {
    name: 'intervention-policies resolve',
    method: 'get',
    path: (ids) =>
      `/api/v1/workflow-definitions/${ids.workflowId}/intervention-policies/resolve?nodeId=out`,
    notFoundType: `${ERRORS}/workflow-not-found`,
    ownerStatus: 200,
  },
  {
    name: 'evidence',
    method: 'get',
    path: (ids) => `/api/v1/executions/${ids.executionId}/evidence`,
    notFoundType: `${ERRORS}/execution-not-found`,
    ownerStatus: 200,
  },
  {
    name: 'evidence chain',
    method: 'get',
    path: (ids) => `/api/v1/executions/${ids.executionId}/evidence/chain`,
    notFoundType: `${ERRORS}/execution-not-found`,
    ownerStatus: 200,
  },
  {
    name: 'evidence graph',
    method: 'get',
    path: (ids) => `/api/v1/executions/${ids.executionId}/evidence/graph`,
    notFoundType: `${ERRORS}/execution-not-found`,
    ownerStatus: 200,
  },
  {
    name: 'pty sessions',
    method: 'get',
    path: (ids) => `/api/v1/executions/${ids.executionId}/pty/sessions`,
    notFoundType: `${ERRORS}/execution-not-found`,
    ownerStatus: 200,
  },
  {
    name: 'gate-runs',
    method: 'get',
    path: (ids) => `/api/v1/generated-apps/${ids.appId}/gate-runs`,
    notFoundType: `${ERRORS}/generated-app-not-found`,
    ownerStatus: 200,
  },
  {
    name: 'generation-runs',
    method: 'get',
    path: (ids) => `/api/v1/generated-apps/${ids.appId}/generation-runs`,
    notFoundType: `${ERRORS}/generated-app-not-found`,
    ownerStatus: 200,
  },
  {
    name: 'repair-attempts',
    method: 'get',
    path: (ids) =>
      `/api/v1/generated-apps/${ids.appId}/generation-runs/${ids.runId}/repair-attempts`,
    notFoundType: `${ERRORS}/generated-app-not-found`,
    ownerStatus: 200,
  },
  {
    name: 'submissions',
    method: 'get',
    path: (ids) => `/api/v1/generated-apps/${ids.appId}/submissions`,
    notFoundType: `${ERRORS}/generated-app-not-found`,
    ownerStatus: 200,
  },
  {
    name: 'submissions batch delete',
    method: 'post',
    path: (ids) => `/api/v1/generated-apps/${ids.appId}/submissions/delete`,
    body: { ids: [crypto.randomUUID()] },
    notFoundType: `${ERRORS}/generated-app-not-found`,
    ownerStatus: 200,
  },
  {
    name: 'conversation sandbox stats',
    method: 'get',
    path: (ids) =>
      `/api/v1/agent-conversations/${ids.conversationId}/sandbox/stats`,
    notFoundType: `${ERRORS}/conversation-not-found`,
    // 对话存在但没有运行中的沙箱：仍是 409
    ownerStatus: 409,
  },
  {
    name: 'conversation sandbox processes',
    method: 'get',
    path: (ids) =>
      `/api/v1/agent-conversations/${ids.conversationId}/sandbox/processes`,
    notFoundType: `${ERRORS}/conversation-not-found`,
    ownerStatus: 409,
  },
];

describe('子集合端点父资源归属 E2E', () => {
  let ctx: RlsTestContext;
  let app: NestFastifyApplication;
  let redisClientMock: MockRedisClient;

  beforeAll(async () => {
    process.env.APP_JWT_SECRET = JWT_SECRET;

    ctx = await createRlsTestContext();
    redisClientMock = createMockRedisClient();

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(SupabaseService)
      .useValue({
        signUp: vi.fn(),
        signIn: vi.fn(),
        refreshToken: vi.fn(),
        signOut: vi.fn(),
        getUser: vi.fn(),
      })
      .overrideProvider(DRIZZLE)
      .useValue(ctx.db)
      .overrideProvider(REDIS_CLIENT)
      .useValue(redisClientMock)
      .overrideProvider(RedisCacheService)
      .useValue({
        get: vi.fn().mockResolvedValue(null),
        set: vi.fn().mockResolvedValue(undefined),
        del: vi.fn().mockResolvedValue(undefined),
        delByPattern: vi.fn().mockResolvedValue(undefined),
        onModuleDestroy: vi.fn().mockResolvedValue(undefined),
      })
      .overrideProvider(RedisPubSubService)
      .useValue({
        publish: vi.fn().mockResolvedValue(undefined),
        onModuleInit: vi.fn().mockResolvedValue(undefined),
        onModuleDestroy: vi.fn().mockResolvedValue(undefined),
      })
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
    Reflect.set(executionQueue, 'add', vi.fn().mockResolvedValue(undefined));
  }, 60_000);

  afterAll(async () => {
    await app?.close();
    await ctx?.close();
  });

  beforeEach(async () => {
    await ctx.reset();
    redisClientMock.get.mockResolvedValue(null);
    redisClientMock.set.mockResolvedValue('OK');
    redisClientMock.del.mockResolvedValue(0);
    redisClientMock.keys.mockResolvedValue([]);
    redisClientMock.publish.mockResolvedValue(1);
  });

  async function seedTenant(prefix: string): Promise<SeededTenant> {
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
    await seedMember(ctx.adminSql, organizationId, user.id, 'owner', user.id);
    await ctx.adminSql`
      UPDATE "users"
      SET "current_organization_id" = ${organizationId}
      WHERE "id" = ${user.id}
    `;

    return { user, tenantId, headers: authHeaders(user, tenantId, 'owner') };
  }

  async function seedParents(tenant: SeededTenant): Promise<ParentIds> {
    const ids: ParentIds = {
      workflowId: crypto.randomUUID(),
      executionId: crypto.randomUUID(),
      appId: crypto.randomUUID(),
      runId: crypto.randomUUID(),
      conversationId: crypto.randomUUID(),
    };
    const userId = tenant.user.id;
    const agentId = crypto.randomUUID();

    await seedWorkflowDefinition(ctx.adminSql, {
      id: ids.workflowId,
      tenantId: tenant.tenantId,
      name: 'Parent Scope Workflow',
      slug: `parent-scope-${crypto.randomUUID().slice(0, 8)}`,
      createdBy: userId,
      updatedBy: userId,
      status: 'draft',
    });
    await ctx.adminSql`
      INSERT INTO "workflow_executions"
        ("id", "workflow_definition_id", "tenant_id", "definition_snapshot",
         "definition_source", "created_by")
      VALUES
        (${ids.executionId}, ${ids.workflowId}, ${tenant.tenantId},
         ${ctx.adminSql.json({ nodes: [], edges: [] })}, 'draft', ${userId})
    `;
    await ctx.adminSql`
      INSERT INTO "generated_apps"
        ("id", "tenant_id", "prompt", "app_name", "description", "readiness",
         "preview", "created_by", "updated_by")
      VALUES
        (${ids.appId}, ${tenant.tenantId}, 'prompt', 'Parent Scope App', 'desc',
         ${ctx.adminSql.json({})}, ${ctx.adminSql.json({})}, ${userId}, ${userId})
    `;
    await ctx.adminSql`
      INSERT INTO "generated_app_generation_runs"
        ("id", "tenant_id", "generated_app_id", "summary")
      VALUES (${ids.runId}, ${tenant.tenantId}, ${ids.appId}, 'run')
    `;
    await ctx.adminSql`
      INSERT INTO "agent_definitions"
        ("id", "tenant_id", "name", "slug", "created_by", "updated_by")
      VALUES
        (${agentId}, ${tenant.tenantId}, 'Parent Scope Agent',
         ${`parent-scope-agent-${crypto.randomUUID().slice(0, 8)}`}, ${userId}, ${userId})
    `;
    await ctx.adminSql`
      INSERT INTO "agent_conversations"
        ("id", "agent_definition_id", "tenant_id", "created_by")
      VALUES (${ids.conversationId}, ${agentId}, ${tenant.tenantId}, ${userId})
    `;

    return ids;
  }

  function send(
    route: SubcollectionRoute,
    ids: ParentIds,
    headers: Record<string, string>,
  ) {
    const server = app.getHttpServer();
    const req =
      route.method === 'get'
        ? request(server).get(route.path(ids))
        : request(server).post(route.path(ids)).send(route.body);
    return req.set(headers);
  }

  it('他租户的父资源与随机 id 返回 404，本租户访问自己的父资源不受影响', async () => {
    const owner = await seedTenant('parent-scope-owner');
    const outsider = await seedTenant('parent-scope-outsider');
    const ownerIds = await seedParents(owner);
    const randomIds: ParentIds = {
      workflowId: crypto.randomUUID(),
      executionId: crypto.randomUUID(),
      appId: crypto.randomUUID(),
      runId: crypto.randomUUID(),
      conversationId: crypto.randomUUID(),
    };

    const results: Array<{
      name: string;
      owner: number;
      crossTenant: [number, string];
      random: [number, string];
    }> = [];
    for (const route of ROUTES) {
      const ownerResponse = await send(route, ownerIds, owner.headers);
      const crossTenantResponse = await send(route, ownerIds, outsider.headers);
      const randomResponse = await send(route, randomIds, owner.headers);
      results.push({
        name: route.name,
        owner: ownerResponse.status,
        crossTenant: [
          crossTenantResponse.status,
          crossTenantResponse.body.type,
        ],
        random: [randomResponse.status, randomResponse.body.type],
      });
    }

    expect(results).toEqual(
      ROUTES.map((route) => ({
        name: route.name,
        owner: route.ownerStatus,
        crossTenant: [404, route.notFoundType],
        random: [404, route.notFoundType],
      })),
    );
  });

  it('修复尝试列表：运行不属于路由中的应用时返回 404 run-not-found', async () => {
    const owner = await seedTenant('parent-scope-run');
    const ownerIds = await seedParents(owner);

    const response = await request(app.getHttpServer())
      .get(
        `/api/v1/generated-apps/${ownerIds.appId}/generation-runs/${crypto.randomUUID()}/repair-attempts`,
      )
      .set(owner.headers);

    expect(response.status).toBe(404);
    expect(response.body.type).toBe(
      `${ERRORS}/generated-app-generation-run-not-found`,
    );
  });
});
