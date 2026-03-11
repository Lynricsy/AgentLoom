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
import type { JSONValue } from 'postgres';
import request from 'supertest';
import { asc, eq } from 'drizzle-orm';

import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { RedisCacheService } from '../src/common/redis/redis-cache.service';
import { REDIS_CLIENT } from '../src/common/redis/redis.constants';
import { RedisPubSubService } from '../src/common/redis/redis-pubsub.service';
import { ZodValidationPipe } from '../src/common/pipes/zod-validation.pipe';
import { DRIZZLE, type DrizzleDB } from '../src/database/database.module';
import * as schema from '../src/database/schema';
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

describe('WorkflowVersion E2E', () => {
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
  }, 30_000);

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

  async function seedDraftWorkflow(options: {
    tenantId: string;
    createdBy: string;
    slug?: string;
    name?: string;
    nodes?: readonly JSONValue[];
    edges?: readonly JSONValue[];
    status?: 'draft' | 'published' | 'archived';
  }) {
    const workflowId = crypto.randomUUID();
    const row = await seedWorkflowDefinition(ctx.adminSql, {
      id: workflowId,
      tenantId: options.tenantId,
      name: options.name ?? 'Versioned workflow',
      slug: options.slug ?? `workflow-${crypto.randomUUID().slice(0, 8)}`,
      createdBy: options.createdBy,
      updatedBy: options.createdBy,
      nodes: options.nodes ?? [
        {
          id: 'node-start',
          type: 'agent',
          position: { x: 0, y: 0 },
          data: { label: 'Start' },
        },
      ],
      edges: options.edges ?? [],
      viewport: { x: 0, y: 0, zoom: 1 },
      status: options.status,
    });

    return row;
  }

  it('应当通过并发请求安全递增版本号并返回 data/meta 列表', async () => {
    const owner = await seedTenant('owner-concurrency');
    const workflow = await seedDraftWorkflow({
      tenantId: owner.tenantId,
      createdBy: owner.user.id,
    });

    const [first, second] = await Promise.all([
      request(app.getHttpServer())
        .post(`/api/v1/workflow-definitions/${workflow.id}/versions`)
        .set(owner.headers)
        .send({ label: 'v1' }),
      request(app.getHttpServer())
        .post(`/api/v1/workflow-definitions/${workflow.id}/versions`)
        .set(owner.headers)
        .send({ label: 'v2' }),
    ]);

    expect([first.status, second.status]).toEqual([201, 201]);
    expect(
      [first.body.data.versionNumber, second.body.data.versionNumber].sort(
        (left: number, right: number) => left - right,
      ),
    ).toEqual([1, 2]);

    const storedVersions = await drizzleDb.query.workflowVersions.findMany({
      where: eq(schema.workflowVersions.workflowDefinitionId, workflow.id),
      orderBy: [asc(schema.workflowVersions.versionNumber)],
    });

    expect(storedVersions).toHaveLength(2);
    expect(storedVersions.map((version) => version.versionNumber)).toEqual([
      1, 2,
    ]);

    const listResponse = await request(app.getHttpServer())
      .get(
        `/api/v1/workflow-definitions/${workflow.id}/versions?page=1&pageSize=10`,
      )
      .set(owner.headers);

    expect(listResponse.status).toBe(200);
    expect(listResponse.body.meta).toEqual({
      page: 1,
      pageSize: 10,
      total: 2,
      totalPages: 1,
    });
    expect(listResponse.body.data).toHaveLength(2);
  });

  it('应当发布工作流并通过 published-version 读穿缓存返回已发布版本', async () => {
    const owner = await seedTenant('owner-publish');
    const workflow = await seedDraftWorkflow({
      tenantId: owner.tenantId,
      createdBy: owner.user.id,
    });

    const publishResponse = await request(app.getHttpServer())
      .post(`/api/v1/workflow-definitions/${workflow.id}/publish`)
      .set(owner.headers)
      .send({
        label: 'release-1',
        releaseNotes: '首次发布',
      });

    expect(publishResponse.status).toBe(200);
    expect(publishResponse.body.data.snapshot.metadata.releaseNotes).toBe(
      '首次发布',
    );

    const cacheKey = `${owner.tenantId}:cache:wf:published:${workflow.id}`;
    expect(
      redisCacheMock.del.mock.calls.some(([key]) => key === cacheKey),
    ).toBe(true);

    const storedWorkflow = await drizzleDb.query.workflowDefinitions.findFirst({
      where: eq(schema.workflowDefinitions.id, workflow.id),
    });
    expect(storedWorkflow?.status).toBe('published');
    expect(storedWorkflow?.publishedVersionId).toBe(
      publishResponse.body.data.id,
    );

    vi.clearAllMocks();
    redisCacheMock.get.mockResolvedValue(null);

    const publishedResponse = await request(app.getHttpServer())
      .get(`/api/v1/workflow-definitions/${workflow.id}/published-version`)
      .set(owner.headers);

    expect(publishedResponse.status).toBe(200);
    expect(publishedResponse.body.data.id).toBe(publishResponse.body.data.id);
    expect(
      redisCacheMock.get.mock.calls.filter(([key]) => key === cacheKey),
    ).toHaveLength(1);
    expect(
      redisCacheMock.set.mock.calls.some(
        ([key, value, ttl]) =>
          key === cacheKey && typeof value === 'string' && ttl === 300,
      ),
    ).toBe(true);
  });

  it('应当在发布存在不兼容端口边的工作流时返回 warnings', async () => {
    const owner = await seedTenant('owner-publish-warning');
    const workflow = await seedDraftWorkflow({
      tenantId: owner.tenantId,
      createdBy: owner.user.id,
      nodes: [
        {
          id: 'node-source',
          type: 'agent',
          position: { x: 0, y: 0 },
          data: {
            label: 'Source',
            portMappingMetadata: {
              outputs: [{ name: 'output-text', dataType: 'text' }],
            },
          },
        },
        {
          id: 'node-target',
          type: 'agent',
          position: { x: 240, y: 0 },
          data: {
            label: 'Target',
            portMappingMetadata: {
              inputs: [{ name: 'input-image', dataType: 'image' }],
            },
          },
        },
      ],
      edges: [
        {
          id: 'edge-typed-1',
          source: 'node-source',
          target: 'node-target',
          sourceHandle: 'output-text',
          targetHandle: 'input-image',
        },
      ],
    });

    const publishResponse = await request(app.getHttpServer())
      .post(`/api/v1/workflow-definitions/${workflow.id}/publish`)
      .set(owner.headers)
      .send({
        label: 'release-with-warning',
      });

    expect(publishResponse.status).toBe(200);
    expect(publishResponse.body.warnings).toEqual([
      {
        code: 'PORT_TYPE_INCOMPATIBLE',
        sourceNodeId: 'node-source',
        targetNodeId: 'node-target',
        sourcePort: {
          name: 'output-text',
          dataType: 'text',
        },
        targetPort: {
          name: 'input-image',
          dataType: 'image',
        },
        message:
          '输出端口 "output-text" (text) 与输入端口 "input-image" (image) 类型不兼容',
      },
    ]);
  });

  it('应当在归档后拒绝新的写操作并同步归档历史版本', async () => {
    const owner = await seedTenant('owner-archive');
    const workflow = await seedDraftWorkflow({
      tenantId: owner.tenantId,
      createdBy: owner.user.id,
    });

    const publishResponse = await request(app.getHttpServer())
      .post(`/api/v1/workflow-definitions/${workflow.id}/publish`)
      .set(owner.headers)
      .send({ label: 'release-before-archive' });
    expect(publishResponse.status).toBe(200);

    const archiveResponse = await request(app.getHttpServer())
      .post(`/api/v1/workflow-definitions/${workflow.id}/archive`)
      .set(owner.headers)
      .send({});

    expect(archiveResponse.status).toBe(204);

    const rejectedCreate = await request(app.getHttpServer())
      .post(`/api/v1/workflow-definitions/${workflow.id}/versions`)
      .set(owner.headers)
      .send({ label: 'blocked-after-archive' });

    expect(rejectedCreate.status).toBe(409);

    const storedWorkflow = await drizzleDb.query.workflowDefinitions.findFirst({
      where: eq(schema.workflowDefinitions.id, workflow.id),
    });
    expect(storedWorkflow?.status).toBe('archived');

    const storedVersions = await drizzleDb.query.workflowVersions.findMany({
      where: eq(schema.workflowVersions.workflowDefinitionId, workflow.id),
    });
    expect(storedVersions).not.toHaveLength(0);
    expect(
      storedVersions.every((version) => version.archivedAt instanceof Date),
    ).toBe(true);
  });

  it('应当通过租户上下文隔离其他组织对版本接口的访问', async () => {
    const owner = await seedTenant('owner-isolation');
    const outsider = await seedTenant('viewer-isolation', 'viewer');
    const workflow = await seedDraftWorkflow({
      tenantId: owner.tenantId,
      createdBy: owner.user.id,
    });

    const createResponse = await request(app.getHttpServer())
      .post(`/api/v1/workflow-definitions/${workflow.id}/versions`)
      .set(owner.headers)
      .send({ label: 'owner-version' });
    expect(createResponse.status).toBe(201);

    const publishResponse = await request(app.getHttpServer())
      .post(`/api/v1/workflow-definitions/${workflow.id}/publish`)
      .set(owner.headers)
      .send({ label: 'owner-release' });
    expect(publishResponse.status).toBe(200);

    const listResponse = await request(app.getHttpServer())
      .get(`/api/v1/workflow-definitions/${workflow.id}/versions`)
      .set(outsider.headers);
    expect(listResponse.status).toBe(404);

    const publishedResponse = await request(app.getHttpServer())
      .get(`/api/v1/workflow-definitions/${workflow.id}/published-version`)
      .set(outsider.headers);
    expect(publishedResponse.status).toBe(404);
  });
});
