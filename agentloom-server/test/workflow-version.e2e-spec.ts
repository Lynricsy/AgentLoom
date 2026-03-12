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

  async function setWorkflowUpdatedAt(workflowId: string, updatedAt: Date) {
    await ctx.adminSql`
      UPDATE "workflow_definitions"
      SET updated_at = ${updatedAt}
      WHERE id = ${workflowId}::uuid
    `;
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

  describe('GET /api/v1/workflow-definitions', () => {
    it('应返回分页工作流定义列表且排除画布大字段', async () => {
      const owner = await seedTenant('definitions-list');

      const firstWorkflow = await seedDraftWorkflow({
        tenantId: owner.tenantId,
        createdBy: owner.user.id,
        name: '列表工作流 A',
        slug: 'list-workflow-a',
      });
      const secondWorkflow = await seedDraftWorkflow({
        tenantId: owner.tenantId,
        createdBy: owner.user.id,
        name: '列表工作流 B',
        slug: 'list-workflow-b',
        status: 'published',
      });

      const response = await request(app.getHttpServer())
        .get('/api/v1/workflow-definitions')
        .set(owner.headers);

      expect(response.status).toBe(200);
      expect(response.body.meta).toEqual({
        total: 2,
        page: 1,
        pageSize: 20,
        totalPages: 1,
      });
      expect(response.body.data).toHaveLength(2);
      expect(response.body.data).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: firstWorkflow.id,
            name: '列表工作流 A',
            slug: 'list-workflow-a',
            status: 'draft',
          }),
          expect.objectContaining({
            id: secondWorkflow.id,
            name: '列表工作流 B',
            slug: 'list-workflow-b',
            status: 'published',
          }),
        ]),
      );
      expect(response.body.data[0]).not.toHaveProperty('nodes');
      expect(response.body.data[0]).not.toHaveProperty('edges');
      expect(response.body.data[0]).not.toHaveProperty('viewport');
    });

    it('应支持 search 查询参数', async () => {
      const owner = await seedTenant('definitions-search');

      await seedDraftWorkflow({
        tenantId: owner.tenantId,
        createdBy: owner.user.id,
        name: 'Alpha 审批流',
        slug: 'alpha-approval-workflow',
      });
      await seedDraftWorkflow({
        tenantId: owner.tenantId,
        createdBy: owner.user.id,
        name: 'Beta 数据流',
        slug: 'beta-data-workflow',
      });

      const response = await request(app.getHttpServer())
        .get('/api/v1/workflow-definitions?search=Alpha')
        .set(owner.headers);

      expect(response.status).toBe(200);
      expect(response.body.meta).toEqual({
        total: 1,
        page: 1,
        pageSize: 20,
        totalPages: 1,
      });
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0]).toMatchObject({
        name: 'Alpha 审批流',
        slug: 'alpha-approval-workflow',
      });
    });

    it('应支持 status 查询参数', async () => {
      const owner = await seedTenant('definitions-status');

      await seedDraftWorkflow({
        tenantId: owner.tenantId,
        createdBy: owner.user.id,
        name: '草稿工作流',
        slug: 'draft-workflow',
        status: 'draft',
      });
      await seedDraftWorkflow({
        tenantId: owner.tenantId,
        createdBy: owner.user.id,
        name: '已归档工作流',
        slug: 'archived-workflow',
        status: 'archived',
      });

      const response = await request(app.getHttpServer())
        .get('/api/v1/workflow-definitions?status=archived')
        .set(owner.headers);

      expect(response.status).toBe(200);
      expect(response.body.meta.total).toBe(1);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0]).toMatchObject({
        name: '已归档工作流',
        slug: 'archived-workflow',
        status: 'archived',
      });
    });

    it('应支持按名称升序排序', async () => {
      const owner = await seedTenant('definitions-sort-name');

      await seedDraftWorkflow({
        tenantId: owner.tenantId,
        createdBy: owner.user.id,
        name: 'Charlie 工作流',
        slug: 'charlie-workflow',
      });
      await seedDraftWorkflow({
        tenantId: owner.tenantId,
        createdBy: owner.user.id,
        name: 'Alpha 工作流',
        slug: 'alpha-workflow',
      });
      await seedDraftWorkflow({
        tenantId: owner.tenantId,
        createdBy: owner.user.id,
        name: 'Bravo 工作流',
        slug: 'bravo-workflow',
      });

      const response = await request(app.getHttpServer())
        .get('/api/v1/workflow-definitions?sort=name&order=asc')
        .set(owner.headers);

      expect(response.status).toBe(200);
      expect(
        response.body.data.map((item: { name: string }) => item.name),
      ).toEqual(['Alpha 工作流', 'Bravo 工作流', 'Charlie 工作流']);
    });

    it('应兼容 snake_case 排序字段', async () => {
      const owner = await seedTenant('definitions-sort-snake');

      const newestWorkflow = await seedDraftWorkflow({
        tenantId: owner.tenantId,
        createdBy: owner.user.id,
        name: '最新工作流',
        slug: 'snake-newest-workflow',
      });
      const oldestWorkflow = await seedDraftWorkflow({
        tenantId: owner.tenantId,
        createdBy: owner.user.id,
        name: '最早工作流',
        slug: 'snake-oldest-workflow',
      });

      await setWorkflowUpdatedAt(newestWorkflow.id, new Date('2025-01-03T00:00:00Z'));
      await setWorkflowUpdatedAt(oldestWorkflow.id, new Date('2025-01-01T00:00:00Z'));

      const response = await request(app.getHttpServer())
        .get('/api/v1/workflow-definitions?sort=updated_at&order=asc')
        .set(owner.headers);

      expect(response.status).toBe(200);
      expect(response.body.data[0]).toMatchObject({
        id: oldestWorkflow.id,
        name: '最早工作流',
      });
      expect(response.body.data[1]).toMatchObject({
        id: newestWorkflow.id,
        name: '最新工作流',
      });
    });

    it('应支持分页参数', async () => {
      const owner = await seedTenant('definitions-pagination');

      const newestWorkflow = await seedDraftWorkflow({
        tenantId: owner.tenantId,
        createdBy: owner.user.id,
        name: '最新工作流',
        slug: 'newest-workflow',
      });
      const middleWorkflow = await seedDraftWorkflow({
        tenantId: owner.tenantId,
        createdBy: owner.user.id,
        name: '中间工作流',
        slug: 'middle-workflow',
      });
      const oldestWorkflow = await seedDraftWorkflow({
        tenantId: owner.tenantId,
        createdBy: owner.user.id,
        name: '最早工作流',
        slug: 'oldest-workflow',
      });

      await setWorkflowUpdatedAt(newestWorkflow.id, new Date('2025-01-03T00:00:00Z'));
      await setWorkflowUpdatedAt(middleWorkflow.id, new Date('2025-01-02T00:00:00Z'));
      await setWorkflowUpdatedAt(oldestWorkflow.id, new Date('2025-01-01T00:00:00Z'));

      const response = await request(app.getHttpServer())
        .get('/api/v1/workflow-definitions?page=2&pageSize=1')
        .set(owner.headers);

      expect(response.status).toBe(200);
      expect(response.body.meta).toEqual({
        total: 3,
        page: 2,
        pageSize: 1,
        totalPages: 3,
      });
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0]).toMatchObject({
        id: middleWorkflow.id,
        name: '中间工作流',
        slug: 'middle-workflow',
      });
    });

    it('应只返回当前租户的工作流定义', async () => {
      const owner = await seedTenant('definitions-list-tenant-a');
      const outsider = await seedTenant('definitions-list-tenant-b');

      const ownerWorkflow = await seedDraftWorkflow({
        tenantId: owner.tenantId,
        createdBy: owner.user.id,
        name: '租户 A 工作流',
        slug: 'tenant-a-workflow',
      });
      const outsiderWorkflow = await seedDraftWorkflow({
        tenantId: outsider.tenantId,
        createdBy: outsider.user.id,
        name: '租户 B 工作流',
        slug: 'tenant-b-workflow',
      });

      const ownerResponse = await request(app.getHttpServer())
        .get('/api/v1/workflow-definitions')
        .set(owner.headers);
      const outsiderResponse = await request(app.getHttpServer())
        .get('/api/v1/workflow-definitions')
        .set(outsider.headers);

      expect(ownerResponse.status).toBe(200);
      expect(ownerResponse.body.meta.total).toBe(1);
      expect(ownerResponse.body.data).toHaveLength(1);
      expect(ownerResponse.body.data[0]).toMatchObject({
        id: ownerWorkflow.id,
        name: '租户 A 工作流',
      });

      expect(outsiderResponse.status).toBe(200);
      expect(outsiderResponse.body.meta.total).toBe(1);
      expect(outsiderResponse.body.data).toHaveLength(1);
      expect(outsiderResponse.body.data[0]).toMatchObject({
        id: outsiderWorkflow.id,
        name: '租户 B 工作流',
      });
    });

    it('viewer 角色应允许查询列表', async () => {
      const viewer = await seedTenant('definitions-list-viewer', 'viewer');

      await seedDraftWorkflow({
        tenantId: viewer.tenantId,
        createdBy: viewer.user.id,
        name: 'viewer 可见工作流',
        slug: 'viewer-visible-workflow',
      });

      const response = await request(app.getHttpServer())
        .get('/api/v1/workflow-definitions')
        .set(viewer.headers);

      expect(response.status).toBe(200);
      expect(response.body.meta.total).toBe(1);
      expect(response.body.data[0]).toMatchObject({
        name: 'viewer 可见工作流',
      });
    });

    it('未认证请求应返回 401', async () => {
      const response = await request(app.getHttpServer()).get(
        '/api/v1/workflow-definitions',
      );

      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/v1/workflow-definitions/:id', () => {
    it('应返回工作流定义详情（含画布大字段）', async () => {
      const owner = await seedTenant('definitions-detail');
      const workflow = await seedDraftWorkflow({
        tenantId: owner.tenantId,
        createdBy: owner.user.id,
        name: '详情工作流',
        slug: 'detail-workflow',
        status: 'published',
      });

      const response = await request(app.getHttpServer())
        .get(`/api/v1/workflow-definitions/${workflow.id}`)
        .set(owner.headers);

      expect(response.status).toBe(200);
      expect(response.body.data).toMatchObject({
        id: workflow.id,
        name: '详情工作流',
        slug: 'detail-workflow',
        status: 'published',
        version: 1,
        metadata: null,
        createdBy: owner.user.id,
        updatedBy: owner.user.id,
      });
      expect(response.body.data.createdAt).toEqual(expect.any(String));
      expect(response.body.data.updatedAt).toEqual(expect.any(String));
      expect(response.body.data).toHaveProperty('nodes');
      expect(response.body.data).toHaveProperty('edges');
      expect(response.body.data).toHaveProperty('viewport');
      expect(response.body.data.nodes).toEqual(expect.any(Array));
      expect(response.body.data.edges).toEqual(expect.any(Array));
    });

    it('不存在的工作流应返回 RFC7807 404', async () => {
      const owner = await seedTenant('definitions-detail-missing');
      const missingId = crypto.randomUUID();

      const response = await request(app.getHttpServer())
        .get(`/api/v1/workflow-definitions/${missingId}`)
        .set(owner.headers);

      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({
        type: 'https://agentloom.dev/errors/workflow-not-found',
        title: '工作流不存在',
        status: 404,
      });
      expect(response.body.detail).toContain(missingId);
    });

    it('跨租户访问详情应返回 404', async () => {
      const owner = await seedTenant('definitions-detail-tenant-a');
      const outsider = await seedTenant('definitions-detail-tenant-b');
      const workflow = await seedDraftWorkflow({
        tenantId: owner.tenantId,
        createdBy: owner.user.id,
        name: '租户隔离详情工作流',
        slug: 'tenant-isolated-detail-workflow',
      });

      const response = await request(app.getHttpServer())
        .get(`/api/v1/workflow-definitions/${workflow.id}`)
        .set(outsider.headers);

      expect(response.status).toBe(404);
      expect(response.body.type).toBe(
        'https://agentloom.dev/errors/workflow-not-found',
      );
    });

    it('非法 UUID 应返回 400', async () => {
      const owner = await seedTenant('definitions-detail-invalid-id');

      const response = await request(app.getHttpServer())
        .get('/api/v1/workflow-definitions/not-a-uuid')
        .set(owner.headers);

      expect(response.status).toBe(400);
    });

    it('未认证请求应返回 401', async () => {
      const workflowId = crypto.randomUUID();

      const response = await request(app.getHttpServer()).get(
        `/api/v1/workflow-definitions/${workflowId}`,
      );

      expect(response.status).toBe(401);
    });
  });

  describe('POST /api/v1/workflow-definitions', () => {
    it('应创建空白工作流并返回 201', async () => {
      const { headers } = await seedTenant('create-blank');

      const response = await request(app.getHttpServer())
        .post('/api/v1/workflow-definitions')
        .set(headers)
        .send({ name: '新建工作流' });

      expect(response.status).toBe(201);
      expect(response.body.data).toMatchObject({
        name: '新建工作流',
        status: 'draft',
        nodes: [],
        edges: [],
      });
      expect(response.body.data.id).toBeDefined();
      expect(response.body.data.slug).toBeDefined();
    });

    it('应从模板克隆工作流', async () => {
      const { headers } = await seedTenant('create-tmpl');

      const templateNodes = [
        { id: 'tpl-n1', type: 'agent', position: { x: 0, y: 0 }, data: {} },
        { id: 'tpl-n2', type: 'output', position: { x: 200, y: 0 }, data: {} },
      ];
      const templateEdges = [
        {
          id: 'tpl-e1',
          source: 'tpl-n1',
          target: 'tpl-n2',
          sourceHandle: 'tpl-n1-out',
          targetHandle: 'tpl-n2-in',
        },
      ];

      await drizzleDb
        .insert(schema.workflowTemplates)
        .values({
          slug: 'e2e-clone-template',
          name: 'E2E测试模板',
          description: 'e2e test',
          category: 'development',
          definition: {
            nodes: templateNodes,
            edges: templateEdges,
            viewport: { x: 50, y: 50, zoom: 1.2 },
          },
          metadata: { complexity: 'beginner', nodeCount: 2, estimatedTime: '5min' },
        })
        .returning();

      const response = await request(app.getHttpServer())
        .post('/api/v1/workflow-definitions')
        .set(headers)
        .send({
          name: 'E2E测试模板的副本',
          description: '从模板创建',
          template_slug: 'e2e-clone-template',
        });

      expect(response.status).toBe(201);
      const data = response.body.data;
      expect(data.name).toBe('E2E测试模板的副本');
      expect(data.description).toBe('从模板创建');
      expect(data.nodes).toHaveLength(2);
      expect(data.edges).toHaveLength(1);

      expect(data.nodes[0].id).not.toBe('tpl-n1');
      expect(data.nodes[1].id).not.toBe('tpl-n2');

      expect(data.edges[0].source).toBe(data.nodes[0].id);
      expect(data.edges[0].target).toBe(data.nodes[1].id);

      expect(data.metadata).toMatchObject({
        cloned_from_template: {
          templateSlug: 'e2e-clone-template',
          templateName: 'E2E测试模板',
        },
      });
    });

    it('应拒绝空名称（422）', async () => {
      const { headers } = await seedTenant('create-invalid');

      const response = await request(app.getHttpServer())
        .post('/api/v1/workflow-definitions')
        .set(headers)
        .send({ name: '' });

      expect(response.status).toBe(422);
    });

    it('模板不存在时应返回 RFC7807 格式的 404', async () => {
      const { headers } = await seedTenant('create-missing-template');

      const response = await request(app.getHttpServer())
        .post('/api/v1/workflow-definitions')
        .set(headers)
        .send({
          name: '缺失模板副本',
          template_slug: 'nonexistent-template',
        });

      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({
        type: 'https://agentloom.dev/errors/template-not-found',
        title: 'Template Not Found',
        status: 404,
      });
      expect(response.body.detail).toContain('nonexistent-template');
    });

    it('未认证请求应返回 401', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/workflow-definitions')
        .send({ name: '未认证工作流' });

      expect(response.status).toBe(401);
    });

    it('viewer 角色应被拒绝（403）', async () => {
      const { headers } = await seedTenant('create-viewer', 'viewer');

      const response = await request(app.getHttpServer())
        .post('/api/v1/workflow-definitions')
        .set(headers)
        .send({ name: '不应创建' });

      expect(response.status).toBe(403);
    });
  });

  describe('PATCH /api/v1/workflow-definitions/:id', () => {
    it('应更新工作流定义并返回递增后的 version', async () => {
      const owner = await seedTenant('patch-success');
      const workflow = await seedDraftWorkflow({
        tenantId: owner.tenantId,
        createdBy: owner.user.id,
        name: '待更新工作流',
        slug: 'patch-wf',
      });

      const newNodes = [
        { id: 'n-new', type: 'agent', position: { x: 100, y: 200 }, data: { label: 'New' } },
      ];
      const response = await request(app.getHttpServer())
        .patch(`/api/v1/workflow-definitions/${workflow.id}`)
        .set(owner.headers)
        .send({
          version: workflow.version,
          name: '已更新工作流',
          nodes: newNodes,
        });

      expect(response.status).toBe(200);
      expect(response.body.data).toMatchObject({
        id: workflow.id,
        name: '已更新工作流',
        slug: 'patch-wf',
        status: 'draft',
        version: workflow.version + 1,
      });
      expect(response.body.data.nodes).toEqual(newNodes);
      expect(response.body.data).toHaveProperty('edges');
      expect(response.body.data).toHaveProperty('viewport');
      expect(response.body.data.updatedBy).toBe(owner.user.id);
    });

    it('版本冲突应返回 409 并携带当前版本号', async () => {
      const owner = await seedTenant('patch-conflict');
      const workflow = await seedDraftWorkflow({
        tenantId: owner.tenantId,
        createdBy: owner.user.id,
        slug: 'conflict-wf',
      });

      const staleVersion = workflow.version + 999;
      const response = await request(app.getHttpServer())
        .patch(`/api/v1/workflow-definitions/${workflow.id}`)
        .set(owner.headers)
        .send({
          version: staleVersion,
          name: '不应更新',
        });

      expect(response.status).toBe(409);
      expect(response.body).toMatchObject({
        type: 'https://agentloom.dev/errors/version-conflict',
        title: '版本冲突',
        status: 409,
        currentVersion: workflow.version,
        instance: `/api/v1/workflow-definitions/${workflow.id}`,
      });
      expect(response.headers['content-type']).toContain('application/problem+json');
      expect(response.body.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'version',
            message: expect.stringContaining('当前版本为'),
          }),
        ]),
      );
    });

    it('已归档工作流应返回 409', async () => {
      const owner = await seedTenant('patch-archived');
      const workflow = await seedDraftWorkflow({
        tenantId: owner.tenantId,
        createdBy: owner.user.id,
        slug: 'archived-patch-wf',
        status: 'archived',
      });

      const response = await request(app.getHttpServer())
        .patch(`/api/v1/workflow-definitions/${workflow.id}`)
        .set(owner.headers)
        .send({ version: workflow.version, name: '不应更新' });

      expect(response.status).toBe(409);
    });

    it('不存在的工作流应返回 404', async () => {
      const owner = await seedTenant('patch-notfound');
      const missingId = crypto.randomUUID();

      const response = await request(app.getHttpServer())
        .patch(`/api/v1/workflow-definitions/${missingId}`)
        .set(owner.headers)
        .send({ version: 1 });

      expect(response.status).toBe(404);
    });

    it('缺少 version 字段应返回 422', async () => {
      const owner = await seedTenant('patch-no-version');
      const workflow = await seedDraftWorkflow({
        tenantId: owner.tenantId,
        createdBy: owner.user.id,
        slug: 'no-version-wf',
      });

      const response = await request(app.getHttpServer())
        .patch(`/api/v1/workflow-definitions/${workflow.id}`)
        .set(owner.headers)
        .send({ name: '无版本号' });

      expect(response.status).toBe(422);
    });

    it('strict 模式应拒绝未知字段（422）', async () => {
      const owner = await seedTenant('patch-strict');
      const workflow = await seedDraftWorkflow({
        tenantId: owner.tenantId,
        createdBy: owner.user.id,
        slug: 'strict-wf',
      });

      const response = await request(app.getHttpServer())
        .patch(`/api/v1/workflow-definitions/${workflow.id}`)
        .set(owner.headers)
        .send({ version: workflow.version, unknownField: true });

      expect(response.status).toBe(422);
    });

    it('viewer 角色应被拒绝（403）', async () => {
      const viewer = await seedTenant('patch-viewer', 'viewer');
      const workflowId = crypto.randomUUID();

      const response = await request(app.getHttpServer())
        .patch(`/api/v1/workflow-definitions/${workflowId}`)
        .set(viewer.headers)
        .send({ version: 1 });

      expect(response.status).toBe(403);
    });

    it('operator 角色应被拒绝（403）', async () => {
      const operator = await seedTenant('patch-operator', 'operator');
      const workflowId = crypto.randomUUID();

      const response = await request(app.getHttpServer())
        .patch(`/api/v1/workflow-definitions/${workflowId}`)
        .set(operator.headers)
        .send({ version: 1 });

      expect(response.status).toBe(403);
    });

    it('跨租户更新应返回 404', async () => {
      const owner = await seedTenant('patch-tenant-a');
      const outsider = await seedTenant('patch-tenant-b');
      const workflow = await seedDraftWorkflow({
        tenantId: owner.tenantId,
        createdBy: owner.user.id,
        slug: 'patch-tenant-isolated-workflow',
      });

      const response = await request(app.getHttpServer())
        .patch(`/api/v1/workflow-definitions/${workflow.id}`)
        .set(outsider.headers)
        .send({
          version: workflow.version,
          name: '不应跨租户更新',
        });

      expect(response.status).toBe(404);
      expect(response.body.type).toBe(
        'https://agentloom.dev/errors/workflow-not-found',
      );
    });

    it('未认证请求应返回 401', async () => {
      const workflowId = crypto.randomUUID();

      const response = await request(app.getHttpServer())
        .patch(`/api/v1/workflow-definitions/${workflowId}`)
        .send({ version: 1 });

      expect(response.status).toBe(401);
    });

    it('连续 PATCH 应正确递增 version', async () => {
      const owner = await seedTenant('patch-sequential');
      const workflow = await seedDraftWorkflow({
        tenantId: owner.tenantId,
        createdBy: owner.user.id,
        slug: 'sequential-wf',
      });

      const first = await request(app.getHttpServer())
        .patch(`/api/v1/workflow-definitions/${workflow.id}`)
        .set(owner.headers)
        .send({ version: workflow.version, name: '第一次更新' });

      expect(first.status).toBe(200);
      const v2 = first.body.data.version;

      const second = await request(app.getHttpServer())
        .patch(`/api/v1/workflow-definitions/${workflow.id}`)
        .set(owner.headers)
        .send({ version: v2, description: '第二次更新' });

      expect(second.status).toBe(200);
      expect(second.body.data.version).toBe(v2 + 1);
      expect(second.body.data.name).toBe('第一次更新');
      expect(second.body.data.description).toBe('第二次更新');
    });
  });

  describe('DELETE /api/v1/workflow-definitions/:id', () => {
    it('应归档工作流并返回 204', async () => {
      const owner = await seedTenant('delete-success');
      const workflow = await seedDraftWorkflow({
        tenantId: owner.tenantId,
        createdBy: owner.user.id,
        slug: 'delete-wf',
      });

      const response = await request(app.getHttpServer())
        .delete(`/api/v1/workflow-definitions/${workflow.id}`)
        .set(owner.headers);

      expect(response.status).toBe(204);

      const verify = await request(app.getHttpServer())
        .get(`/api/v1/workflow-definitions/${workflow.id}`)
        .set(owner.headers);

      expect(verify.status).toBe(200);
      expect(verify.body.data.status).toBe('archived');
    });

    it('已归档工作流再次删除应返回 409', async () => {
      const owner = await seedTenant('delete-archived');
      const workflow = await seedDraftWorkflow({
        tenantId: owner.tenantId,
        createdBy: owner.user.id,
        slug: 'delete-archived-wf',
        status: 'archived',
      });

      const response = await request(app.getHttpServer())
        .delete(`/api/v1/workflow-definitions/${workflow.id}`)
        .set(owner.headers);

      expect(response.status).toBe(409);
    });

    it('creator 角色应被拒绝（403）', async () => {
      const creator = await seedTenant('delete-creator', 'creator');
      const workflowId = crypto.randomUUID();

      const response = await request(app.getHttpServer())
        .delete(`/api/v1/workflow-definitions/${workflowId}`)
        .set(creator.headers);

      expect(response.status).toBe(403);
    });

    it('跨租户删除应返回 404', async () => {
      const owner = await seedTenant('delete-tenant-a');
      const outsider = await seedTenant('delete-tenant-b');
      const workflow = await seedDraftWorkflow({
        tenantId: owner.tenantId,
        createdBy: owner.user.id,
        slug: 'delete-tenant-isolated-workflow',
      });

      const response = await request(app.getHttpServer())
        .delete(`/api/v1/workflow-definitions/${workflow.id}`)
        .set(outsider.headers);

      expect(response.status).toBe(404);
      expect(response.body.type).toBe(
        'https://agentloom.dev/errors/workflow-not-found',
      );
    });

    it('未认证请求应返回 401', async () => {
      const workflowId = crypto.randomUUID();

      const response = await request(app.getHttpServer()).delete(
        `/api/v1/workflow-definitions/${workflowId}`,
      );

      expect(response.status).toBe(401);
    });
  });
});
