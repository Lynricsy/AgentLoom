vi.mock('@anatine/zod-nestjs', async () => {
  const { createZodDto } = await import('nestjs-zod');
  return { createZodDto };
});

declare const vi: typeof import('vitest').vi;

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
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
import { ZodValidationPipe } from '../src/common/pipes/zod-validation.pipe';
import { RedisCacheService } from '../src/common/redis/redis-cache.service';
import { REDIS_CLIENT } from '../src/common/redis/redis.constants';
import { RedisPubSubService } from '../src/common/redis/redis-pubsub.service';
import { DRIZZLE, type DrizzleDB } from '../src/database/database.module';
import {
  marketplaceListings,
  marketplaceReviews,
  workflowDefinitions,
  workflowExecutions,
  workflowVersions,
  type MarketplaceReviewCode,
  type MarketplaceReviewResult,
  type WorkflowVersionSnapshot,
} from '../src/database/schema';
import { SupabaseService } from '../src/modules/auth/supabase/supabase.service';
import { EXECUTION_QUEUE } from '../src/modules/execution/execution.constants';
import {
  createRlsTestContext,
  seedAppUser,
  seedMember,
  seedOrg,
  type OrganizationRole,
  type RlsTestContext,
} from './rls/rls-test-utils';

const JWT_SECRET = 'test-e2e-jwt-secret';
const MARKETPLACE_BASE_PATH = '/api/v1/marketplace';
const DEFAULT_VIEWPORT = { x: 0, y: 0, zoom: 1 };
// marketplace-review.service.ts:219-235 与 workflow-version.exceptions.ts:50-64 规定：
// `agent` 节点必须绑定已发布的 Agent Definition；Marketplace 的通用 fixture 不测试 Agent 绑定，
// 因此使用无需绑定的 manual-trigger，避免用旧版未绑定 Agent 快照伪造“可发布且可上架”的工作流。
const DEFAULT_WORKFLOW_SNAPSHOT = {
  nodes: [
    {
      id: 'manual-trigger-node-1',
      type: 'manual-trigger',
      position: { x: 0, y: 0 },
      data: {
        label: '手动触发',
      },
    },
  ],
  edges: [],
  viewport: DEFAULT_VIEWPORT,
  metadata: {
    nodeCount: 1,
    edgeCount: 0,
    createdFromVersion: 1,
  },
} satisfies WorkflowVersionSnapshot;

type TestUser = {
  id: string;
  email: string;
};

type AuthenticatedTestUser = TestUser & {
  tenantId?: string;
  tenantRole?: OrganizationRole;
};

type SeededTenant = {
  user: TestUser;
  tenantId: string;
  organizationId: string;
  headers: { authorization: string };
};

type SeededWorkflow = {
  workflowId: string;
  versionId: string;
  workflowName: string;
  versionNumber: number;
  snapshot: WorkflowVersionSnapshot;
  executionId?: string;
  executionCompletedAt?: Date;
};

type SubmitListingPayload = {
  workflowVersionId: string;
  title: string;
  summary: string;
  tags: string[];
  coverImageUrl?: string;
};

type ProblemDetailsBody = {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance: string;
  currentStatus?: string;
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

function toJsonValue(value: unknown): JSONValue {
  return value as JSONValue;
}

function createSubmitPayload(
  workflowVersionId: string,
  overrides: Partial<Omit<SubmitListingPayload, 'workflowVersionId'>> = {},
): SubmitListingPayload {
  return {
    workflowVersionId,
    title: 'AI Market Analyst Pro',
    summary:
      '这是一个经过真实执行验证的工作流，可自动采集市场信号、归纳趋势并输出可执行摘要。',
    tags: ['ai', 'automation', 'analysis'],
    coverImageUrl: 'https://example.com/cover.png',
    ...overrides,
  };
}

function findReviewCheck(
  reviewResult: MarketplaceReviewResult,
  code: MarketplaceReviewCode,
) {
  return reviewResult.checks.find((check) => check.code === code);
}

describe('Marketplace E2E', () => {
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

  async function seedTenant(
    prefix: string,
    role: OrganizationRole = 'owner',
  ): Promise<SeededTenant> {
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

  async function seedTenantMember(options: {
    prefix: string;
    tenantId: string;
    organizationId: string;
    invitedBy: string;
    role: OrganizationRole;
  }): Promise<SeededTenant> {
    const user = createTestUser(options.prefix);

    await seedAppUser(ctx.adminSql, user.id, user.email);
    await seedMember(
      ctx.adminSql,
      options.organizationId,
      user.id,
      options.role,
      options.invitedBy,
    );
    await ctx.adminSql`
      UPDATE "users"
      SET current_organization_id = ${options.organizationId}::uuid
      WHERE id = ${user.id}::uuid
    `;

    return {
      user,
      tenantId: options.tenantId,
      organizationId: options.organizationId,
      headers: authHeaders(
        withTenantContext(user, options.tenantId, options.role),
      ),
    };
  }

  async function seedRecentSuccessfulExecution(options: {
    workflowId: string;
    workflowVersionId: string;
    tenantId: string;
    createdBy: string;
    snapshot: WorkflowVersionSnapshot;
    completedAt?: Date;
  }) {
    const executionId = crypto.randomUUID();
    const completedAt = options.completedAt ?? new Date();
    const startedAt = new Date(completedAt.getTime() - 60_000);

    await ctx.adminSql`
      INSERT INTO workflow_executions (
        id,
        workflow_definition_id,
        workflow_version_id,
        tenant_id,
        status,
        trigger_type,
        input_params,
        definition_snapshot,
        started_at,
        completed_at,
        total_steps,
        completed_steps,
        created_by
      ) VALUES (
        ${executionId}::uuid,
        ${options.workflowId}::uuid,
        ${options.workflowVersionId}::uuid,
        ${options.tenantId}::uuid,
        ${'completed'}::execution_status_enum,
        ${'manual'}::execution_trigger_type_enum,
        ${ctx.adminSql.json(toJsonValue({}))},
        ${ctx.adminSql.json(toJsonValue(options.snapshot))},
        ${startedAt},
        ${completedAt},
        1,
        1,
        ${options.createdBy}::uuid
      )
    `;

    return {
      executionId,
      completedAt,
    };
  }

  async function seedWorkflowForMarketplace(
    tenantId: string,
    userId: string,
    options: {
      withRecentExecution?: boolean;
      name?: string;
      versionNumber?: number;
      snapshot?: WorkflowVersionSnapshot;
      publishedAt?: Date;
      executionCompletedAt?: Date;
    } = {},
  ): Promise<SeededWorkflow> {
    const workflowId = crypto.randomUUID();
    const versionId = crypto.randomUUID();
    const workflowName =
      options.name ?? `Marketplace Workflow ${crypto.randomUUID().slice(0, 8)}`;
    const versionNumber = options.versionNumber ?? 1;
    const snapshot = options.snapshot ?? DEFAULT_WORKFLOW_SNAPSHOT;
    const publishedAt = options.publishedAt ?? new Date();

    await ctx.adminSql`
      INSERT INTO workflow_definitions (
        id,
        tenant_id,
        name,
        slug,
        status,
        nodes,
        edges,
        viewport,
        metadata,
        version,
        created_by,
        updated_by
      ) VALUES (
        ${workflowId}::uuid,
        ${tenantId}::uuid,
        ${workflowName},
        ${`marketplace-${crypto.randomUUID().slice(0, 8)}`},
        ${'published'}::workflow_status_enum,
        ${ctx.adminSql.json(toJsonValue(snapshot.nodes))},
        ${ctx.adminSql.json(toJsonValue(snapshot.edges))},
        ${ctx.adminSql.json(toJsonValue(snapshot.viewport))},
        ${ctx.adminSql.json(toJsonValue({ source: 'marketplace-e2e' }))},
        1,
        ${userId}::uuid,
        ${userId}::uuid
      )
    `;

    await ctx.adminSql`
      INSERT INTO workflow_versions (
        id,
        workflow_definition_id,
        tenant_id,
        version_number,
        label,
        snapshot,
        published_at,
        created_by
      ) VALUES (
        ${versionId}::uuid,
        ${workflowId}::uuid,
        ${tenantId}::uuid,
        ${versionNumber},
        ${`v${versionNumber}`},
        ${ctx.adminSql.json(toJsonValue(snapshot))},
        ${publishedAt},
        ${userId}::uuid
      )
    `;

    await ctx.adminSql`
      UPDATE workflow_definitions
      SET published_version_id = ${versionId}::uuid
      WHERE id = ${workflowId}::uuid
    `;

    let executionId: string | undefined;
    let executionCompletedAt: Date | undefined;

    if (options.withRecentExecution !== false) {
      const seededExecution = await seedRecentSuccessfulExecution({
        workflowId,
        workflowVersionId: versionId,
        tenantId,
        createdBy: userId,
        snapshot,
        completedAt: options.executionCompletedAt,
      });
      executionId = seededExecution.executionId;
      executionCompletedAt = seededExecution.completedAt;
    }

    return {
      workflowId,
      versionId,
      workflowName,
      versionNumber,
      snapshot,
      executionId,
      executionCompletedAt,
    };
  }

  async function seedListedMarketplaceListing(options: {
    owner: SeededTenant;
    workflow?: SeededWorkflow;
    title?: string;
    summary?: string;
    tags?: string[];
    coverImageUrl?: string | null;
    category?:
      | 'analysis'
      | 'content'
      | 'development'
      | 'automation'
      | 'reporting'
      | null;
    useCount?: number;
    avgRating?: string | null;
    reviewCount?: number;
    publishedAt?: Date;
    snapshot?: WorkflowVersionSnapshot;
  }) {
    const workflow =
      options.workflow ??
      (await seedWorkflowForMarketplace(
        options.owner.tenantId,
        options.owner.user.id,
        {
          snapshot: options.snapshot,
        },
      ));
    const listingId = crypto.randomUUID();
    const publishedAt = options.publishedAt ?? new Date();

    await drizzleDb.insert(marketplaceListings).values({
      id: listingId,
      workflowVersionId: workflow.versionId,
      tenantId: options.owner.tenantId,
      title:
        options.title ??
        `Marketplace Listing ${crypto.randomUUID().slice(0, 8)}`,
      summary:
        options.summary ??
        '这是一个用于 Marketplace 浏览与安装测试的公开工作流摘要，包含足够长的描述内容。',
      tags: options.tags ?? ['analysis', 'marketplace'],
      coverImageUrl: options.coverImageUrl ?? null,
      category: options.category ?? 'analysis',
      useCount: options.useCount ?? 0,
      avgRating: options.avgRating ?? null,
      reviewCount: options.reviewCount ?? 0,
      status: 'listed',
      reviewResult: null,
      submittedBy: options.owner.user.id,
      submittedAt: publishedAt,
      publishedAt,
      unlistedAt: null,
      createdAt: publishedAt,
      updatedAt: publishedAt,
    });

    return { listingId, workflow };
  }

  async function seedMarketplaceReview(options: {
    listingId: string;
    userId: string;
    rating: number;
    content?: string;
    createdAt?: Date;
  }) {
    const reviewId = crypto.randomUUID();
    const createdAt = options.createdAt ?? new Date();

    await drizzleDb.insert(marketplaceReviews).values({
      id: reviewId,
      listingId: options.listingId,
      userId: options.userId,
      rating: options.rating,
      content: options.content ?? null,
      createdAt,
      updatedAt: createdAt,
    });

    return { reviewId, createdAt };
  }

  it('allows anonymous users to browse listed marketplace listings', async () => {
    const owner = await seedTenant('marketplace-browse-public');
    const seeded = await seedListedMarketplaceListing({
      owner,
      title: 'Public Market Signals',
      category: 'analysis',
      useCount: 7,
      avgRating: '4.70',
      reviewCount: 3,
    });

    const response = await request(app.getHttpServer()).get(
      `${MARKETPLACE_BASE_PATH}/browse`,
    );

    expect(response.status).toBe(200);
    expect(response.body.meta).toMatchObject({
      page: 1,
      pageSize: 20,
      total: 1,
      totalPages: 1,
    });
    expect(response.body.data).toEqual([
      expect.objectContaining({
        id: seeded.listingId,
        title: 'Public Market Signals',
        category: 'analysis',
        useCount: 7,
        avgRating: '4.70',
        reviewCount: 3,
        author: {
          displayName: owner.user.email,
        },
      }),
    ]);
    expect(response.body.data[0].author).not.toHaveProperty('id');
  });

  it('supports public browse filters for category, search, and sort', async () => {
    const owner = await seedTenant('marketplace-browse-filters');

    const first = await seedListedMarketplaceListing({
      owner,
      title: 'AI insights alpha',
      summary: 'insights summary alpha',
      category: 'analysis',
      avgRating: '4.80',
      reviewCount: 11,
      useCount: 9,
    });
    const second = await seedListedMarketplaceListing({
      owner,
      title: 'Market watcher beta',
      summary: 'deep insights for operations teams',
      category: 'analysis',
      avgRating: '4.20',
      reviewCount: 5,
      useCount: 20,
    });
    await seedListedMarketplaceListing({
      owner,
      title: 'Reporting assistant gamma',
      summary: 'insights for reporting only',
      category: 'reporting',
      avgRating: '5.00',
      reviewCount: 2,
      useCount: 30,
    });

    const response = await request(app.getHttpServer()).get(
      `${MARKETPLACE_BASE_PATH}/browse?category=analysis&search=insights&sort=rating`,
    );

    expect(response.status).toBe(200);
    expect(response.body.meta).toMatchObject({
      page: 1,
      pageSize: 20,
      total: 2,
      totalPages: 1,
    });
    expect(response.body.data.map((item: { id: string }) => item.id)).toEqual([
      first.listingId,
      second.listingId,
    ]);
  });

  it('returns public listing detail with definition and reviews', async () => {
    const owner = await seedTenant('marketplace-browse-detail-owner');
    const reviewer = await seedTenant('marketplace-browse-detail-reviewer');
    const snapshot = {
      nodes: [
        {
          id: 'detail-node-1',
          type: 'agent',
          position: { x: 0, y: 0 },
          data: { label: 'Detail Agent' },
        },
      ],
      edges: [],
      viewport: DEFAULT_VIEWPORT,
      inputSchema: {
        version: 1,
        collectionMode: 'form' as const,
        fields: [],
      },
      metadata: {
        nodeCount: 1,
        edgeCount: 0,
        createdFromVersion: 1,
      },
    } satisfies WorkflowVersionSnapshot;
    const seeded = await seedListedMarketplaceListing({
      owner,
      title: 'Detail Listing',
      category: 'automation',
      avgRating: '5.00',
      reviewCount: 1,
      snapshot,
    });

    await seedMarketplaceReview({
      listingId: seeded.listingId,
      userId: reviewer.user.id,
      rating: 5,
      content: '公开详情查看正常',
    });

    const response = await request(app.getHttpServer()).get(
      `${MARKETPLACE_BASE_PATH}/browse/${seeded.listingId}`,
    );

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      id: seeded.listingId,
      title: 'Detail Listing',
      category: 'automation',
      definition: {
        nodes: snapshot.nodes,
        edges: snapshot.edges,
        viewport: DEFAULT_VIEWPORT,
      },
      reviews: [
        expect.objectContaining({
          rating: 5,
          content: '公开详情查看正常',
          author: expect.objectContaining({
            displayName: reviewer.user.email,
          }),
        }),
      ],
    });
    expect(response.body).not.toHaveProperty('workflowVersionId');
    expect(response.body.definition).not.toHaveProperty('inputSchema');
    expect(response.body.reviews[0]?.author).not.toHaveProperty('id');
  });

  it('returns paginated public listing reviews', async () => {
    const owner = await seedTenant('marketplace-public-reviews-owner');
    const reviewerA = await seedTenant('marketplace-public-reviews-a');
    const reviewerB = await seedTenant('marketplace-public-reviews-b');
    const seeded = await seedListedMarketplaceListing({
      owner,
      title: 'Review Listing',
      avgRating: '4.50',
      reviewCount: 2,
    });

    await seedMarketplaceReview({
      listingId: seeded.listingId,
      userId: reviewerA.user.id,
      rating: 5,
      content: '最新评论',
      createdAt: new Date('2025-01-02T00:00:00.000Z'),
    });
    const olderReview = await seedMarketplaceReview({
      listingId: seeded.listingId,
      userId: reviewerB.user.id,
      rating: 4,
      content: '较早评论',
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
    });

    const response = await request(app.getHttpServer()).get(
      `${MARKETPLACE_BASE_PATH}/browse/${seeded.listingId}/reviews?page=2&pageSize=1`,
    );

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      data: [
        expect.objectContaining({
          id: olderReview.reviewId,
          rating: 4,
          content: '较早评论',
        }),
      ],
      meta: {
        page: 2,
        pageSize: 1,
        total: 2,
        totalPages: 2,
      },
    });
  });

  it('allows operator installation but blocks viewer installation', async () => {
    const sourceOwner = await seedTenant('marketplace-install-source');
    const seeded = await seedListedMarketplaceListing({
      owner: sourceOwner,
      title: 'Installable Listing',
      summary: '用于验证一键安装的公开摘要。',
      useCount: 2,
    });
    const targetOwner = await seedTenant('marketplace-install-target-owner');
    const operator = await seedTenantMember({
      prefix: 'marketplace-install-operator',
      tenantId: targetOwner.tenantId,
      organizationId: targetOwner.organizationId,
      invitedBy: targetOwner.user.id,
      role: 'operator',
    });
    const viewer = await seedTenantMember({
      prefix: 'marketplace-install-viewer',
      tenantId: targetOwner.tenantId,
      organizationId: targetOwner.organizationId,
      invitedBy: targetOwner.user.id,
      role: 'viewer',
    });

    const installResponse = await request(app.getHttpServer())
      .post(`${MARKETPLACE_BASE_PATH}/listings/${seeded.listingId}/install`)
      .set(operator.headers)
      .send({});

    expect(installResponse.status).toBe(201);
    expect(installResponse.body).toMatchObject({
      workflowDefinitionId: expect.any(String),
      name: 'Installable Listing',
      message: 'Workflow installed successfully',
    });

    const installedWorkflowId = installResponse.body
      .workflowDefinitionId as string;
    const [installedWorkflow] = await drizzleDb
      .select()
      .from(workflowDefinitions)
      .where(eq(workflowDefinitions.id, installedWorkflowId));

    expect(installedWorkflow).toMatchObject({
      id: installedWorkflowId,
      tenantId: targetOwner.tenantId,
      name: 'Installable Listing',
      description: '用于验证一键安装的公开摘要。',
      createdBy: operator.user.id,
    });
    expect(
      (
        installedWorkflow?.metadata as {
          cloned_from_marketplace?: { listingId: string };
        }
      )?.cloned_from_marketplace?.listingId,
    ).toBe(seeded.listingId);

    const [updatedListing] = await drizzleDb
      .select()
      .from(marketplaceListings)
      .where(eq(marketplaceListings.id, seeded.listingId));

    expect(updatedListing?.useCount).toBe(3);

    const viewerResponse = await request(app.getHttpServer())
      .post(`${MARKETPLACE_BASE_PATH}/listings/${seeded.listingId}/install`)
      .set(viewer.headers)
      .send({});

    expect(viewerResponse.status).toBe(403);
    expect(viewerResponse.body).toMatchObject({
      type: 'https://agentloom.dev/errors/insufficient-permissions',
      status: 403,
    });
  });

  it('allows authenticated users to submit marketplace reviews and updates aggregates', async () => {
    const owner = await seedTenant('marketplace-review-submit-owner');
    const reviewer = await seedTenant('marketplace-review-submit-reviewer');
    const seeded = await seedListedMarketplaceListing({
      owner,
      title: 'Reviewable Listing',
      useCount: 1,
    });

    const response = await request(app.getHttpServer())
      .post(`${MARKETPLACE_BASE_PATH}/listings/${seeded.listingId}/reviews`)
      .set(reviewer.headers)
      .send({ rating: 5, content: '值得推荐' });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      id: expect.any(String),
      rating: 5,
      content: '值得推荐',
      createdAt: expect.any(String),
    });
    expect(response.body).not.toHaveProperty('listingId');
    expect(response.body).not.toHaveProperty('author');

    const [listing] = await drizzleDb
      .select()
      .from(marketplaceListings)
      .where(eq(marketplaceListings.id, seeded.listingId));
    const reviews = await drizzleDb
      .select()
      .from(marketplaceReviews)
      .where(eq(marketplaceReviews.listingId, seeded.listingId));

    expect(listing).toMatchObject({
      avgRating: '5.00',
      reviewCount: 1,
    });
    expect(reviews).toHaveLength(1);
  });

  it('returns 409 when the same user submits a duplicate marketplace review', async () => {
    const owner = await seedTenant('marketplace-review-duplicate-owner');
    const reviewer = await seedTenant('marketplace-review-duplicate-reviewer');
    const seeded = await seedListedMarketplaceListing({ owner });

    const firstResponse = await request(app.getHttpServer())
      .post(`${MARKETPLACE_BASE_PATH}/listings/${seeded.listingId}/reviews`)
      .set(reviewer.headers)
      .send({ rating: 4, content: '第一次评论' });

    expect(firstResponse.status).toBe(201);

    const secondResponse = await request(app.getHttpServer())
      .post(`${MARKETPLACE_BASE_PATH}/listings/${seeded.listingId}/reviews`)
      .set(reviewer.headers)
      .send({ rating: 5, content: '重复评论' });

    expect(secondResponse.status).toBe(409);
    expect(secondResponse.body).toMatchObject({
      type: 'https://agentloom.dev/errors/marketplace-review-conflict',
      title: 'Review Already Exists',
      status: 409,
    });
  });

  it('covers submit → list → get → unlist → relist lifecycle', async () => {
    const owner = await seedTenant('marketplace-lifecycle');
    const workflow = await seedWorkflowForMarketplace(
      owner.tenantId,
      owner.user.id,
      { name: 'Lifecycle Workflow' },
    );

    const [definition] = await drizzleDb
      .select()
      .from(workflowDefinitions)
      .where(eq(workflowDefinitions.id, workflow.workflowId));
    const [version] = await drizzleDb
      .select()
      .from(workflowVersions)
      .where(eq(workflowVersions.id, workflow.versionId));
    const [execution] = await drizzleDb
      .select()
      .from(workflowExecutions)
      .where(eq(workflowExecutions.workflowVersionId, workflow.versionId));

    expect(definition?.publishedVersionId).toBe(workflow.versionId);
    expect(version?.versionNumber).toBe(1);
    expect(execution?.status).toBe('completed');

    const submitPayload = createSubmitPayload(workflow.versionId);
    const submitResponse = await request(app.getHttpServer())
      .post(`${MARKETPLACE_BASE_PATH}/listings`)
      .set(owner.headers)
      .send(submitPayload);

    expect(submitResponse.status).toBe(201);
    expect(submitResponse.body.data).toMatchObject({
      workflowVersionId: workflow.versionId,
      title: submitPayload.title,
      status: 'listed',
    });

    const submitReview = submitResponse.body
      .reviewResult as MarketplaceReviewResult;
    expect(submitReview.outcome).toBe('passed');
    expect(submitReview.recentSuccessfulExecutionId).toBe(workflow.executionId);

    const listingId = submitResponse.body.data.id as string;
    const firstPublishedAt = submitResponse.body.data.publishedAt as string;

    const myListingsResponse = await request(app.getHttpServer())
      .get(`${MARKETPLACE_BASE_PATH}/my-listings`)
      .set(owner.headers);

    expect(myListingsResponse.status).toBe(200);
    expect(myListingsResponse.body.meta).toMatchObject({
      page: 1,
      pageSize: 20,
      total: 1,
      totalPages: 1,
    });
    expect(myListingsResponse.body.data).toEqual([
      expect.objectContaining({
        id: listingId,
        workflowVersionId: workflow.versionId,
        workflowDefinitionId: workflow.workflowId,
        workflowName: workflow.workflowName,
        versionNumber: workflow.versionNumber,
        status: 'listed',
        reviewResult: expect.objectContaining({ outcome: 'passed' }),
      }),
    ]);

    const getResponse = await request(app.getHttpServer())
      .get(`${MARKETPLACE_BASE_PATH}/listings/${listingId}`)
      .set(owner.headers);

    expect(getResponse.status).toBe(200);
    expect(getResponse.body.data).toMatchObject({
      id: listingId,
      workflowVersionId: workflow.versionId,
      title: submitPayload.title,
      status: 'listed',
    });

    const unlistResponse = await request(app.getHttpServer())
      .post(`${MARKETPLACE_BASE_PATH}/listings/${listingId}/unlist`)
      .set(owner.headers);

    expect(unlistResponse.status).toBe(200);
    expect(unlistResponse.body.data).toMatchObject({
      id: listingId,
      status: 'unlisted',
    });
    expect(unlistResponse.body.data.unlistedAt).toBeTruthy();

    const relistResponse = await request(app.getHttpServer())
      .post(`${MARKETPLACE_BASE_PATH}/listings/${listingId}/relist`)
      .set(owner.headers);

    expect(relistResponse.status).toBe(200);
    expect(relistResponse.body.data).toMatchObject({
      id: listingId,
      status: 'listed',
    });

    const relistReview = relistResponse.body
      .reviewResult as MarketplaceReviewResult;
    expect(relistReview.outcome).toBe('passed');
    expect(
      new Date(relistResponse.body.data.publishedAt as string).getTime(),
    ).toBeGreaterThanOrEqual(new Date(firstPublishedAt).getTime());

    const [storedListing] = await drizzleDb
      .select()
      .from(marketplaceListings)
      .where(eq(marketplaceListings.id, listingId));

    expect(storedListing?.status).toBe('listed');
    expect(storedListing?.publishedAt).not.toBeNull();
  });

  it('marks listing as review_failed when no recent execution exists', async () => {
    const owner = await seedTenant('marketplace-review-failed');
    const workflow = await seedWorkflowForMarketplace(
      owner.tenantId,
      owner.user.id,
      { withRecentExecution: false },
    );

    const response = await request(app.getHttpServer())
      .post(`${MARKETPLACE_BASE_PATH}/listings`)
      .set(owner.headers)
      .send(createSubmitPayload(workflow.versionId));

    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({
      workflowVersionId: workflow.versionId,
      status: 'review_failed',
      publishedAt: null,
    });

    const reviewResult = response.body.reviewResult as MarketplaceReviewResult;
    expect(reviewResult.outcome).toBe('failed');
    expect(
      findReviewCheck(reviewResult, 'RECENT_SUCCESSFUL_EXECUTION_MISSING'),
    ).toMatchObject({
      status: 'failed',
    });
  });

  it('marks listing as review_failed when the workflow no longer has a current published version', async () => {
    const owner = await seedTenant('marketplace-no-current-published-version');
    const workflow = await seedWorkflowForMarketplace(
      owner.tenantId,
      owner.user.id,
    );

    await drizzleDb
      .update(workflowDefinitions)
      .set({ publishedVersionId: null })
      .where(eq(workflowDefinitions.id, workflow.workflowId));

    const response = await request(app.getHttpServer())
      .post(`${MARKETPLACE_BASE_PATH}/listings`)
      .set(owner.headers)
      .send(createSubmitPayload(workflow.versionId));

    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({
      workflowVersionId: workflow.versionId,
      status: 'review_failed',
      publishedAt: null,
    });

    const reviewResult = response.body.reviewResult as MarketplaceReviewResult;
    expect(reviewResult.outcome).toBe('failed');
    expect(
      findReviewCheck(reviewResult, 'WORKFLOW_VERSION_NOT_PUBLISHED'),
    ).toMatchObject({
      status: 'failed',
    });
  });

  it('marks listing as review_failed when the workflow definition is archived', async () => {
    const owner = await seedTenant('marketplace-archived-definition');
    const workflow = await seedWorkflowForMarketplace(
      owner.tenantId,
      owner.user.id,
    );

    await drizzleDb
      .update(workflowDefinitions)
      .set({ status: 'archived' })
      .where(eq(workflowDefinitions.id, workflow.workflowId));

    const response = await request(app.getHttpServer())
      .post(`${MARKETPLACE_BASE_PATH}/listings`)
      .set(owner.headers)
      .send(createSubmitPayload(workflow.versionId));

    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({
      workflowVersionId: workflow.versionId,
      status: 'review_failed',
      publishedAt: null,
    });

    const reviewResult = response.body.reviewResult as MarketplaceReviewResult;
    expect(reviewResult.outcome).toBe('failed');
    expect(
      findReviewCheck(reviewResult, 'WORKFLOW_VERSION_ARCHIVED'),
    ).toMatchObject({
      status: 'failed',
    });
  });

  it('resubmits an existing review_failed listing after a successful execution is seeded', async () => {
    const owner = await seedTenant('marketplace-resubmit');
    const workflow = await seedWorkflowForMarketplace(
      owner.tenantId,
      owner.user.id,
      { withRecentExecution: false },
    );

    const firstResponse = await request(app.getHttpServer())
      .post(`${MARKETPLACE_BASE_PATH}/listings`)
      .set(owner.headers)
      .send(createSubmitPayload(workflow.versionId));

    expect(firstResponse.status).toBe(201);
    expect(firstResponse.body.data.status).toBe('review_failed');

    const firstListingId = firstResponse.body.data.id as string;

    await seedRecentSuccessfulExecution({
      workflowId: workflow.workflowId,
      workflowVersionId: workflow.versionId,
      tenantId: owner.tenantId,
      createdBy: owner.user.id,
      snapshot: workflow.snapshot,
    });

    const resubmitPayload = createSubmitPayload(workflow.versionId, {
      title: 'AI Market Analyst Pro Resubmitted',
      summary:
        '重新提交后的版本补充了成功执行证据，可继续自动采集信号并输出稳定的市场分析结论。',
      tags: ['ai', 'marketplace', 'resubmitted'],
    });

    const secondResponse = await request(app.getHttpServer())
      .post(`${MARKETPLACE_BASE_PATH}/listings`)
      .set(owner.headers)
      .send(resubmitPayload);

    expect(secondResponse.status).toBe(201);
    expect(secondResponse.body.data).toMatchObject({
      id: firstListingId,
      title: resubmitPayload.title,
      status: 'listed',
    });

    const reviewResult = secondResponse.body
      .reviewResult as MarketplaceReviewResult;
    expect(reviewResult.outcome).toBe('passed');

    const listings = await drizzleDb
      .select()
      .from(marketplaceListings)
      .where(eq(marketplaceListings.workflowVersionId, workflow.versionId));

    expect(listings).toHaveLength(1);
    expect(listings[0]).toMatchObject({
      id: firstListingId,
      title: resubmitPayload.title,
      status: 'listed',
    });
  });

  it('rejects submit when the workflow version is already listed', async () => {
    const owner = await seedTenant('marketplace-submit-conflict');
    const workflow = await seedWorkflowForMarketplace(
      owner.tenantId,
      owner.user.id,
    );

    const payload = createSubmitPayload(workflow.versionId);
    const firstResponse = await request(app.getHttpServer())
      .post(`${MARKETPLACE_BASE_PATH}/listings`)
      .set(owner.headers)
      .send(payload);

    expect(firstResponse.status).toBe(201);
    expect(firstResponse.body.data.status).toBe('listed');

    const secondResponse = await request(app.getHttpServer())
      .post(`${MARKETPLACE_BASE_PATH}/listings`)
      .set(owner.headers)
      .send(
        createSubmitPayload(workflow.versionId, { title: 'Another title' }),
      );

    expect(secondResponse.status).toBe(409);

    const problem = secondResponse.body as ProblemDetailsBody;
    expect(problem).toMatchObject({
      type: 'https://agentloom.dev/errors/marketplace-listing-conflict',
      title: 'Marketplace listing 状态冲突',
      status: 409,
      currentStatus: 'listed',
    });
  });

  it('returns 404 when submitting an unknown workflow version id', async () => {
    const owner = await seedTenant('marketplace-unknown-version-submit');

    const response = await request(app.getHttpServer())
      .post(`${MARKETPLACE_BASE_PATH}/listings`)
      .set(owner.headers)
      .send(createSubmitPayload(crypto.randomUUID()));

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({
      type: 'https://agentloom.dev/errors/marketplace-workflow-version-not-found',
      title: '工作流版本不存在',
      status: 404,
    });
  });

  it('returns 404 for an unknown marketplace listing id', async () => {
    const owner = await seedTenant('marketplace-missing');
    const missingId = crypto.randomUUID();

    const response = await request(app.getHttpServer())
      .get(`${MARKETPLACE_BASE_PATH}/listings/${missingId}`)
      .set(owner.headers);

    expect(response.status).toBe(404);

    const problem = response.body as ProblemDetailsBody;
    expect(problem).toMatchObject({
      type: 'https://agentloom.dev/errors/marketplace-listing-not-found',
      title: 'Marketplace listing 不存在',
      status: 404,
    });
  });

  it('enforces cross-tenant isolation for listings', async () => {
    const tenantA = await seedTenant('marketplace-tenant-a');
    const workflow = await seedWorkflowForMarketplace(
      tenantA.tenantId,
      tenantA.user.id,
    );
    const createResponse = await request(app.getHttpServer())
      .post(`${MARKETPLACE_BASE_PATH}/listings`)
      .set(tenantA.headers)
      .send(createSubmitPayload(workflow.versionId));

    expect(createResponse.status).toBe(201);
    const listingId = createResponse.body.data.id as string;

    const tenantB = await seedTenant('marketplace-tenant-b');

    const tenantBListingsResponse = await request(app.getHttpServer())
      .get(`${MARKETPLACE_BASE_PATH}/my-listings`)
      .set(tenantB.headers);

    expect(tenantBListingsResponse.status).toBe(200);
    expect(tenantBListingsResponse.body.data).toEqual([]);
    expect(tenantBListingsResponse.body.meta).toMatchObject({
      total: 0,
      totalPages: 0,
    });

    const tenantBGetResponse = await request(app.getHttpServer())
      .get(`${MARKETPLACE_BASE_PATH}/listings/${listingId}`)
      .set(tenantB.headers);

    expect(tenantBGetResponse.status).toBe(404);
    expect(tenantBGetResponse.body).toMatchObject({
      type: 'https://agentloom.dev/errors/marketplace-listing-not-found',
      status: 404,
    });
  });

  it('returns 404 when submitting a workflow version from another tenant', async () => {
    const tenantA = await seedTenant('marketplace-submit-tenant-a');
    const workflow = await seedWorkflowForMarketplace(
      tenantA.tenantId,
      tenantA.user.id,
    );
    const tenantB = await seedTenant('marketplace-submit-tenant-b');

    const response = await request(app.getHttpServer())
      .post(`${MARKETPLACE_BASE_PATH}/listings`)
      .set(tenantB.headers)
      .send(createSubmitPayload(workflow.versionId));

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({
      type: 'https://agentloom.dev/errors/marketplace-workflow-version-not-found',
      status: 404,
    });
  });

  it('returns conflict when unlisting a non-listed listing', async () => {
    const owner = await seedTenant('marketplace-unlist-conflict');
    const workflow = await seedWorkflowForMarketplace(
      owner.tenantId,
      owner.user.id,
      { withRecentExecution: false },
    );

    const createResponse = await request(app.getHttpServer())
      .post(`${MARKETPLACE_BASE_PATH}/listings`)
      .set(owner.headers)
      .send(createSubmitPayload(workflow.versionId));

    expect(createResponse.status).toBe(201);
    expect(createResponse.body.data.status).toBe('review_failed');

    const listingId = createResponse.body.data.id as string;
    const unlistResponse = await request(app.getHttpServer())
      .post(`${MARKETPLACE_BASE_PATH}/listings/${listingId}/unlist`)
      .set(owner.headers);

    expect(unlistResponse.status).toBe(409);

    const problem = unlistResponse.body as ProblemDetailsBody;
    expect(problem).toMatchObject({
      type: 'https://agentloom.dev/errors/marketplace-listing-conflict',
      status: 409,
      currentStatus: 'review_failed',
    });
  });

  it('returns conflict when relisting a listing that is not unlisted', async () => {
    const owner = await seedTenant('marketplace-relist-conflict');
    const workflow = await seedWorkflowForMarketplace(
      owner.tenantId,
      owner.user.id,
    );

    const createResponse = await request(app.getHttpServer())
      .post(`${MARKETPLACE_BASE_PATH}/listings`)
      .set(owner.headers)
      .send(createSubmitPayload(workflow.versionId));

    expect(createResponse.status).toBe(201);

    const listingId = createResponse.body.data.id as string;
    const relistResponse = await request(app.getHttpServer())
      .post(`${MARKETPLACE_BASE_PATH}/listings/${listingId}/relist`)
      .set(owner.headers);

    expect(relistResponse.status).toBe(409);

    const problem = relistResponse.body as ProblemDetailsBody;
    expect(problem).toMatchObject({
      type: 'https://agentloom.dev/errors/marketplace-listing-conflict',
      status: 409,
      currentStatus: 'listed',
    });
  });

  it('clears publishedAt when relist review fails after a listing was previously listed', async () => {
    const owner = await seedTenant('marketplace-relist-failed-published-at');
    const workflow = await seedWorkflowForMarketplace(
      owner.tenantId,
      owner.user.id,
    );

    const createResponse = await request(app.getHttpServer())
      .post(`${MARKETPLACE_BASE_PATH}/listings`)
      .set(owner.headers)
      .send(createSubmitPayload(workflow.versionId));

    expect(createResponse.status).toBe(201);
    expect(createResponse.body.data.status).toBe('listed');

    const listingId = createResponse.body.data.id as string;

    const unlistResponse = await request(app.getHttpServer())
      .post(`${MARKETPLACE_BASE_PATH}/listings/${listingId}/unlist`)
      .set(owner.headers);

    expect(unlistResponse.status).toBe(200);

    await drizzleDb
      .update(workflowExecutions)
      .set({ completedAt: new Date('2024-11-30T00:00:00.000Z') })
      .where(eq(workflowExecutions.workflowVersionId, workflow.versionId));

    const relistResponse = await request(app.getHttpServer())
      .post(`${MARKETPLACE_BASE_PATH}/listings/${listingId}/relist`)
      .set(owner.headers);

    expect(relistResponse.status).toBe(200);
    expect(relistResponse.body.data).toMatchObject({
      id: listingId,
      status: 'review_failed',
      publishedAt: null,
    });

    const reviewResult = relistResponse.body
      .reviewResult as MarketplaceReviewResult;
    expect(reviewResult.outcome).toBe('failed');
    expect(
      findReviewCheck(reviewResult, 'RECENT_SUCCESSFUL_EXECUTION_MISSING'),
    ).toMatchObject({
      status: 'failed',
    });
  });

  it('allows viewer reads but blocks viewer submit, unlist, and relist actions', async () => {
    const owner = await seedTenant('marketplace-viewer-owner');
    const workflow = await seedWorkflowForMarketplace(
      owner.tenantId,
      owner.user.id,
      { name: 'Viewer Shared Workflow' },
    );
    const createResponse = await request(app.getHttpServer())
      .post(`${MARKETPLACE_BASE_PATH}/listings`)
      .set(owner.headers)
      .send(createSubmitPayload(workflow.versionId));

    expect(createResponse.status).toBe(201);

    const listingId = createResponse.body.data.id as string;
    const viewer = await seedTenantMember({
      prefix: 'marketplace-viewer-member',
      tenantId: owner.tenantId,
      organizationId: owner.organizationId,
      invitedBy: owner.user.id,
      role: 'viewer',
    });

    const viewerListingsResponse = await request(app.getHttpServer())
      .get(`${MARKETPLACE_BASE_PATH}/my-listings`)
      .set(viewer.headers);

    expect(viewerListingsResponse.status).toBe(200);
    expect(viewerListingsResponse.body.data).toEqual([
      expect.objectContaining({
        id: listingId,
        workflowVersionId: workflow.versionId,
        workflowDefinitionId: workflow.workflowId,
        workflowName: workflow.workflowName,
      }),
    ]);

    const viewerGetResponse = await request(app.getHttpServer())
      .get(`${MARKETPLACE_BASE_PATH}/listings/${listingId}`)
      .set(viewer.headers);

    expect(viewerGetResponse.status).toBe(200);
    expect(viewerGetResponse.body.data).toMatchObject({
      id: listingId,
      status: 'listed',
    });

    const viewerSubmitResponse = await request(app.getHttpServer())
      .post(`${MARKETPLACE_BASE_PATH}/listings`)
      .set(viewer.headers)
      .send(
        createSubmitPayload(workflow.versionId, { title: 'Viewer submit' }),
      );

    expect(viewerSubmitResponse.status).toBe(403);
    expect(viewerSubmitResponse.body).toMatchObject({
      type: 'https://agentloom.dev/errors/insufficient-permissions',
      title: '权限不足',
      status: 403,
    });

    const viewerUnlistResponse = await request(app.getHttpServer())
      .post(`${MARKETPLACE_BASE_PATH}/listings/${listingId}/unlist`)
      .set(viewer.headers);

    expect(viewerUnlistResponse.status).toBe(403);
    expect(viewerUnlistResponse.body).toMatchObject({
      type: 'https://agentloom.dev/errors/insufficient-permissions',
      status: 403,
    });

    const viewerRelistResponse = await request(app.getHttpServer())
      .post(`${MARKETPLACE_BASE_PATH}/listings/${listingId}/relist`)
      .set(viewer.headers);

    expect(viewerRelistResponse.status).toBe(403);
    expect(viewerRelistResponse.body).toMatchObject({
      type: 'https://agentloom.dev/errors/insufficient-permissions',
      status: 403,
    });
  });

  it('returns validation errors for missing title, short summary, and too many tags', async () => {
    const owner = await seedTenant('marketplace-validation');
    const workflow = await seedWorkflowForMarketplace(
      owner.tenantId,
      owner.user.id,
    );

    const missingTitleResponse = await request(app.getHttpServer())
      .post(`${MARKETPLACE_BASE_PATH}/listings`)
      .set(owner.headers)
      .send({
        workflowVersionId: workflow.versionId,
        summary:
          '这是一个合法长度的摘要，用于验证缺少标题时返回的 Zod 校验错误。',
        tags: ['ai'],
      });

    expect(missingTitleResponse.status).toBe(422);
    expect(missingTitleResponse.headers['content-type']).toContain(
      'application/problem+json',
    );

    const missingTitleProblem = missingTitleResponse.body as ProblemDetailsBody;
    expect(missingTitleProblem).toMatchObject({
      type: 'https://agentloom.dev/errors/validation-error',
      title: 'Validation Error',
      status: 422,
      detail: 'Request validation failed',
    });
    expect(
      missingTitleProblem.errors?.some((error) => error.field === 'title'),
    ).toBe(true);

    const shortSummaryResponse = await request(app.getHttpServer())
      .post(`${MARKETPLACE_BASE_PATH}/listings`)
      .set(owner.headers)
      .send(
        createSubmitPayload(workflow.versionId, {
          summary: '太短了',
        }),
      );

    expect(shortSummaryResponse.status).toBe(422);
    const shortSummaryProblem = shortSummaryResponse.body as ProblemDetailsBody;
    expect(shortSummaryProblem).toMatchObject({
      type: 'https://agentloom.dev/errors/validation-error',
      status: 422,
    });
    expect(
      shortSummaryProblem.errors?.some((error) => error.field === 'summary'),
    ).toBe(true);

    const tooManyTagsResponse = await request(app.getHttpServer())
      .post(`${MARKETPLACE_BASE_PATH}/listings`)
      .set(owner.headers)
      .send(
        createSubmitPayload(workflow.versionId, {
          tags: [
            'one',
            'two',
            'three',
            'four',
            'five',
            'six',
            'seven',
            'eight',
            'nine',
          ],
        }),
      );

    expect(tooManyTagsResponse.status).toBe(422);
    const tooManyTagsProblem = tooManyTagsResponse.body as ProblemDetailsBody;
    expect(tooManyTagsProblem).toMatchObject({
      type: 'https://agentloom.dev/errors/validation-error',
      status: 422,
    });
    expect(
      tooManyTagsProblem.errors?.some((error) => error.field === 'tags'),
    ).toBe(true);
  });
});
