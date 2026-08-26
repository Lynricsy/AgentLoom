import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

const { MockRedis } = vi.hoisted(() => {
  class MockRedis {
    status = 'ready';
    options = {};
    call = vi.fn().mockResolvedValue([1, 60_000, 0, 0]);
    connect = vi.fn().mockResolvedValue(undefined);
    disconnect = vi.fn().mockResolvedValue(undefined);
    quit = vi.fn().mockResolvedValue('OK');
    on = vi.fn().mockImplementation(() => this);
    once = vi.fn().mockImplementation(() => this);
    off = vi.fn().mockImplementation(() => this);
    removeListener = vi.fn().mockImplementation(() => this);
    setMaxListeners = vi.fn().mockImplementation(() => this);
    defineCommand = vi.fn();
    get = vi.fn().mockResolvedValue(null);
    set = vi.fn().mockResolvedValue('OK');
    del = vi.fn().mockResolvedValue(0);
    keys = vi.fn().mockResolvedValue([]);
    publish = vi.fn().mockResolvedValue(1);
    subscribe = vi.fn().mockResolvedValue(undefined);
    unsubscribe = vi.fn().mockResolvedValue(undefined);
    ping = vi.fn().mockResolvedValue('PONG');
    duplicate = vi.fn().mockImplementation(() => new MockRedis());
  }

  return { MockRedis };
});

vi.mock('ioredis', () => ({
  default: MockRedis,
  Cluster: MockRedis,
}));

vi.mock('@anatine/zod-nestjs', async () => {
  const { createZodDto } = await import('nestjs-zod');
  return { createZodDto };
});

import { BullRegistrar, getQueueToken } from '@nestjs/bullmq';
import { getOptionsToken } from '@nestjs/throttler';
import { Test } from '@nestjs/testing';
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify';
import * as crypto from 'node:crypto';
import * as jwt from 'jsonwebtoken';
import type { JSONValue } from 'postgres';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { ZodValidationPipe } from '../src/common/pipes/zod-validation.pipe';
import { RedisCacheService } from '../src/common/redis/redis-cache.service';
import { REDIS_CLIENT } from '../src/common/redis/redis.constants';
import { RedisPubSubService } from '../src/common/redis/redis-pubsub.service';
import { DRIZZLE, type DrizzleDB } from '../src/database/database.module';
import { SupabaseService } from '../src/modules/auth/supabase/supabase.service';
import { NodeSchedulerService } from '../src/modules/execution/node-scheduler.service';
import { OPTIMIZATION_ANALYSIS_QUEUE } from '../src/modules/optimization-suggestion/optimization-analysis.constants';
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

const APP_QUEUE_NAMES = [
  'workflow-execution',
  'agent-task',
  'plugin-execution',
  'earnings-settlement',
  'notification',
  'trigger-scheduler',
  'sandbox-lifecycle',
  'optimization-analysis',
  'audit-log-retention',
  'evidence-export',
  'evidence-export-cleanup',
  'document-processing',
  'document-indexing',
] as const;

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
  headers: Record<string, string>;
};

type SeededWorkflow = {
  workflowDefinitionId: string;
  targetNodeId: string;
  siblingNodeId: string;
};

type SuggestionSeedInput = {
  id?: string;
  tenantId: string;
  workflowDefinitionId: string;
  nodeId: string;
  suggestionType:
    | 'model_downgrade'
    | 'timeout_adjustment'
    | 'tool_pruning'
    | 'autonomy_upgrade';
  status?: 'pending' | 'applied' | 'dismissed';
  confidence?: number;
  currentValue: JSONValue;
  suggestedValue: JSONValue;
  rationale?: string;
  impactEstimate?: JSONValue | null;
  analysisMetadata?: JSONValue | null;
  analysisPeriodStart?: Date;
  analysisPeriodEnd?: Date;
  appliedAt?: Date | null;
  appliedByUserId?: string | null;
  dismissedAt?: Date | null;
  dismissedByUserId?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
};

function ensureTestEnvironment() {
  process.env.APP_PORT = '3099';
  process.env.APP_NODE_ENV = 'test';
  process.env.APP_DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
  process.env.APP_SUPABASE_URL = 'https://test.supabase.co';
  process.env.APP_SUPABASE_ANON_KEY = 'test-anon-key';
  process.env.APP_SUPABASE_SERVICE_KEY = 'test-service-key';
  process.env.APP_JWT_SECRET = JWT_SECRET;
  process.env.APP_REDIS_URL = 'redis://127.0.0.1:6379';
  process.env.APP_OAUTH_REDIRECT_URL =
    'https://test.supabase.co/auth/v1/callback';
  process.env.APP_FRONTEND_URL = 'http://localhost:3000';
  process.env.APP_MASTER_ENCRYPTION_KEY =
    '3HiqJr2j48+6csTN+/yp+9FDJeiBpILxtxgYy/w/uFQ=';
  process.env.APP_MINIO_ENDPOINT = 'localhost';
  process.env.APP_MINIO_PORT = '9000';
  process.env.APP_MINIO_ACCESS_KEY = 'test-access-key';
  process.env.APP_MINIO_SECRET_KEY = 'test-secret-key';
  process.env.APP_MINIO_USE_SSL = 'false';
  process.env.APP_MINIO_BUCKET = 'agentloom-documents';
  process.env.APP_QDRANT_URL = 'http://localhost:6333';
}

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
    Authorization: `Bearer ${signToken(claims)}`,
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
  const subscriber = {
    connect: vi.fn().mockResolvedValue(undefined),
    subscribe: vi.fn().mockResolvedValue(undefined),
    unsubscribe: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
    quit: vi.fn().mockResolvedValue('OK'),
  };

  return {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue('OK'),
    del: vi.fn().mockResolvedValue(0),
    keys: vi.fn().mockResolvedValue([]),
    publish: vi.fn().mockResolvedValue(1),
    subscribe: vi.fn().mockResolvedValue(undefined),
    unsubscribe: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    quit: vi.fn().mockResolvedValue('OK'),
    ping: vi.fn().mockResolvedValue('PONG'),
    duplicate: vi.fn().mockReturnValue(subscriber),
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
    subscribe: vi.fn().mockResolvedValue(undefined),
    unsubscribe: vi.fn().mockResolvedValue(undefined),
    onModuleInit: vi.fn().mockResolvedValue(undefined),
    onModuleDestroy: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockNodeSchedulerService() {
  return {
    startExecution: vi.fn(),
    resolveIntervention: vi.fn(),
    resolveToolPermission: vi.fn(),
    resumeScheduling: vi.fn(),
    enqueueInterventionTimeout: vi.fn(),
    removeInterventionTimeout: vi.fn(),
  };
}

function createMockQueue() {
  return {
    add: vi.fn().mockResolvedValue(undefined),
    upsertJobScheduler: vi.fn().mockResolvedValue(undefined),
    removeRepeatableByKey: vi.fn().mockResolvedValue(undefined),
    getRepeatableJobs: vi.fn().mockResolvedValue([]),
    close: vi.fn().mockResolvedValue(undefined),
    on: vi.fn().mockImplementation(() => undefined),
    off: vi.fn().mockImplementation(() => undefined),
  };
}

function createMockOptimizationAnalysisQueue() {
  return createMockQueue();
}

function createMockBullRegistrar() {
  return {
    onModuleInit: vi.fn(),
    register: vi.fn(),
  };
}

function createMockThrottlerOptions() {
  return {
    throttlers: [{ name: 'default', ttl: 60_000, limit: 100 }],
    storage: {
      increment: vi.fn().mockResolvedValue({
        totalHits: 1,
        timeToExpire: 60_000,
        isBlocked: false,
        timeToBlockExpire: 0,
      }),
    },
  };
}

describe('OptimizationSuggestion E2E', () => {
  let ctx: RlsTestContext | undefined;
  let app: NestFastifyApplication | undefined;
  let drizzleDb: DrizzleDB;
  let redisClientMock: ReturnType<typeof createMockRedisClient>;
  let redisCacheMock: ReturnType<typeof createMockRedisCacheService>;
  let redisPubSubMock: ReturnType<typeof createMockRedisPubSubService>;
  let nodeSchedulerMock: ReturnType<typeof createMockNodeSchedulerService>;
  let queueMock: ReturnType<typeof createMockQueue>;
  let optimizationAnalysisQueueMock: ReturnType<
    typeof createMockOptimizationAnalysisQueue
  >;
  let bullRegistrarMock: ReturnType<typeof createMockBullRegistrar>;

  beforeAll(async () => {
    ensureTestEnvironment();

    ctx = await createRlsTestContext();
    drizzleDb = ctx.db;
    redisClientMock = createMockRedisClient();
    redisCacheMock = createMockRedisCacheService();
    redisPubSubMock = createMockRedisPubSubService();
    nodeSchedulerMock = createMockNodeSchedulerService();
    queueMock = createMockQueue();
    optimizationAnalysisQueueMock = createMockOptimizationAnalysisQueue();
    bullRegistrarMock = createMockBullRegistrar();
    const throttlerOptions = createMockThrottlerOptions();

    let moduleBuilder = Test.createTestingModule({
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
      .overrideProvider(NodeSchedulerService)
      .useValue(nodeSchedulerMock)
      .overrideProvider(BullRegistrar)
      .useValue(bullRegistrarMock);

    moduleBuilder = moduleBuilder
      .overrideProvider(getOptionsToken())
      .useValue(throttlerOptions);

    for (const queueName of APP_QUEUE_NAMES) {
      moduleBuilder = moduleBuilder
        .overrideProvider(getQueueToken(queueName))
        .useValue(
          queueName === OPTIMIZATION_ANALYSIS_QUEUE
            ? optimizationAnalysisQueueMock
            : queueMock,
        );
    }

    const moduleRef = await moduleBuilder.compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalPipes(new ZodValidationPipe());

    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  }, 120_000);

  beforeEach(async () => {
    await ctx?.reset();
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
    redisClientMock.subscribe.mockResolvedValue(undefined);
    redisClientMock.unsubscribe.mockResolvedValue(undefined);
    redisClientMock.connect.mockResolvedValue(undefined);
    redisClientMock.disconnect.mockResolvedValue(undefined);
    redisClientMock.quit.mockResolvedValue('OK');

    redisPubSubMock.publish.mockResolvedValue(undefined);
    redisPubSubMock.subscribe.mockResolvedValue(undefined);
    redisPubSubMock.unsubscribe.mockResolvedValue(undefined);

    optimizationAnalysisQueueMock.upsertJobScheduler.mockResolvedValue(
      undefined,
    );
  });

  afterAll(async () => {
    await app?.close();
    await ctx?.close();
  }, 30_000);

  async function seedTenant(
    prefix: string,
    role: OrganizationRole = 'owner',
  ): Promise<SeededTenant> {
    if (!ctx) {
      throw new Error('RLS test context not initialized');
    }

    const user = createTestUser(prefix);
    const organizationId = crypto.randomUUID();
    const tenantId = organizationId;

    await seedAppUser(ctx.adminSql, user.id, user.email);
    await seedOrg(
      ctx.adminSql,
      organizationId,
      `${prefix} org`,
      `${prefix}-${organizationId.slice(0, 8)}`,
      user.id,
      tenantId,
    );
    await seedMember(ctx.adminSql, organizationId, user.id, role, user.id);
    await ctx.adminSql`
      UPDATE users
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

  async function seedWorkflow(options: {
    tenantId: string;
    createdBy: string;
    prefix: string;
  }): Promise<SeededWorkflow> {
    if (!ctx) {
      throw new Error('RLS test context not initialized');
    }

    const workflowDefinitionId = crypto.randomUUID();
    const targetNodeId = 'agent-node-target';
    const siblingNodeId = 'agent-node-sibling';

    await seedWorkflowDefinition(ctx.adminSql, {
      id: workflowDefinitionId,
      tenantId: options.tenantId,
      name: `${options.prefix} workflow`,
      slug: `${options.prefix}-${workflowDefinitionId.slice(0, 8)}`,
      createdBy: options.createdBy,
      updatedBy: options.createdBy,
      nodes: [
        {
          id: targetNodeId,
          type: 'llm-agent',
          position: { x: 0, y: 0 },
          data: {
            label: 'Target Agent',
            autonomyMode: 'MANUAL_CONFIRM',
            autonomyConfig: {
              mode: 'RULE_BASED',
              confirmationThreshold: 0.75,
            },
            settings: {
              autonomyMode: 'RULE_BASED',
              section: 'advanced',
            },
            config: {
              modelId: 'gpt-4o',
              modelName: 'GPT-4o',
              provider: 'openai',
              timeoutMs: 60_000,
              tools: ['web-search', 'code-runner'],
              autonomyMode: 'MANUAL_CONFIRM',
            },
          },
        },
        {
          id: siblingNodeId,
          type: 'llm-agent',
          position: { x: 240, y: 0 },
          data: {
            label: 'Sibling Agent',
            config: {
              modelId: 'claude-3-7-sonnet',
              timeoutMs: 45_000,
              tools: ['browser'],
              autonomyMode: 'RULE_BASED',
            },
          },
        },
      ],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 },
    });

    return {
      workflowDefinitionId,
      targetNodeId,
      siblingNodeId,
    };
  }

  async function seedSuggestion(input: SuggestionSeedInput) {
    if (!ctx) {
      throw new Error('RLS test context not initialized');
    }

    const now = new Date('2026-02-01T00:00:00.000Z');
    const [row] = await ctx.adminSql`
      INSERT INTO optimization_suggestions (
        id,
        tenant_id,
        workflow_definition_id,
        node_id,
        suggestion_type,
        status,
        confidence,
        current_value,
        suggested_value,
        rationale,
        impact_estimate,
        analysis_metadata,
        analysis_period_start,
        analysis_period_end,
        applied_at,
        applied_by_user_id,
        dismissed_at,
        dismissed_by_user_id,
        created_at,
        updated_at
      )
      VALUES (
        ${input.id ?? crypto.randomUUID()}::uuid,
        ${input.tenantId}::uuid,
        ${input.workflowDefinitionId}::uuid,
        ${input.nodeId},
        ${input.suggestionType}::suggestion_type,
        ${input.status ?? 'pending'}::suggestion_status,
        ${input.confidence ?? 0.88},
        ${ctx.adminSql.json(input.currentValue)},
        ${ctx.adminSql.json(input.suggestedValue)},
        ${input.rationale ?? '建议优化 Agent 配置'},
        ${
          input.impactEstimate === undefined
            ? ctx.adminSql.json({ costSavingPct: 0.25 })
            : input.impactEstimate === null
              ? null
              : ctx.adminSql.json(input.impactEstimate)
        },
        ${
          input.analysisMetadata === undefined
            ? ctx.adminSql.json({ totalRecords: 42, analyzerVersion: '1.0.0' })
            : input.analysisMetadata === null
              ? null
              : ctx.adminSql.json(input.analysisMetadata)
        },
        ${input.analysisPeriodStart ?? now},
        ${input.analysisPeriodEnd ?? now},
        ${input.appliedAt ?? null},
        ${input.appliedByUserId ?? null},
        ${input.dismissedAt ?? null},
        ${input.dismissedByUserId ?? null},
        ${input.createdAt ?? now},
        ${input.updatedAt ?? input.createdAt ?? now}
      )
      RETURNING *
    `;

    return row;
  }

  describe('GET /api/v1/optimization-suggestions', () => {
    it('应返回租户内分页建议列表，默认 meta.limit 为 50', async () => {
      const tenant = await seedTenant('optimization-list');
      const workflow = await seedWorkflow({
        tenantId: tenant.tenantId,
        createdBy: tenant.user.id,
        prefix: 'optimization-list',
      });

      await seedSuggestion({
        tenantId: tenant.tenantId,
        workflowDefinitionId: workflow.workflowDefinitionId,
        nodeId: workflow.targetNodeId,
        suggestionType: 'model_downgrade',
        currentValue: {
          modelId: 'gpt-4o',
          modelName: 'GPT-4o',
          provider: 'openai',
        },
        suggestedValue: {
          modelId: 'gpt-4o-mini',
          modelName: 'GPT-4o Mini',
          provider: 'openai',
        },
        createdAt: new Date('2026-02-01T00:00:00.000Z'),
      });
      await seedSuggestion({
        tenantId: tenant.tenantId,
        workflowDefinitionId: workflow.workflowDefinitionId,
        nodeId: workflow.targetNodeId,
        suggestionType: 'timeout_adjustment',
        currentValue: { timeoutMs: 60_000 },
        suggestedValue: { timeoutMs: 45_000 },
        createdAt: new Date('2026-02-01T00:01:00.000Z'),
      });

      const response = await request(app!.getHttpServer())
        .get('/api/v1/optimization-suggestions')
        .set(tenant.headers);

      expect(response.status).toBe(200);
      expect(response.body.data.meta).toEqual({
        total: 2,
        limit: 50,
        offset: 0,
        hasMore: false,
      });
      expect(response.body.data.data).toHaveLength(2);
      expect(response.body.data.data[0]).toMatchObject({
        workflowDefinitionId: workflow.workflowDefinitionId,
        nodeId: workflow.targetNodeId,
        suggestionType: 'timeout_adjustment',
      });
      expect(response.body.data.data[1]).toMatchObject({
        workflowDefinitionId: workflow.workflowDefinitionId,
        nodeId: workflow.targetNodeId,
        suggestionType: 'model_downgrade',
      });
    });

    it('当同时提供 workflowDefinitionId 与 nodeId 时应返回按 createdAt 倒序的节点级数组结果', async () => {
      const tenant = await seedTenant('optimization-node-list');
      const workflow = await seedWorkflow({
        tenantId: tenant.tenantId,
        createdBy: tenant.user.id,
        prefix: 'optimization-node-list',
      });

      const olderSuggestion = await seedSuggestion({
        tenantId: tenant.tenantId,
        workflowDefinitionId: workflow.workflowDefinitionId,
        nodeId: workflow.targetNodeId,
        suggestionType: 'model_downgrade',
        currentValue: {
          modelId: 'gpt-4o',
          modelName: 'GPT-4o',
          provider: 'openai',
        },
        suggestedValue: {
          modelId: 'gpt-4o-mini',
          modelName: 'GPT-4o Mini',
          provider: 'openai',
        },
        createdAt: new Date('2026-02-01T00:00:00.000Z'),
      });
      const newerSuggestion = await seedSuggestion({
        tenantId: tenant.tenantId,
        workflowDefinitionId: workflow.workflowDefinitionId,
        nodeId: workflow.targetNodeId,
        suggestionType: 'timeout_adjustment',
        currentValue: { timeoutMs: 60_000 },
        suggestedValue: { timeoutMs: 45_000 },
        createdAt: new Date('2026-02-01T00:01:00.000Z'),
      });
      await seedSuggestion({
        tenantId: tenant.tenantId,
        workflowDefinitionId: workflow.workflowDefinitionId,
        nodeId: workflow.siblingNodeId,
        suggestionType: 'tool_pruning',
        currentValue: { tools: ['browser', 'search'] },
        suggestedValue: { tools: ['browser'], removedTools: ['search'] },
        createdAt: new Date('2026-02-01T00:02:00.000Z'),
      });

      const response = await request(app!.getHttpServer())
        .get('/api/v1/optimization-suggestions')
        .set(tenant.headers)
        .query({
          workflowDefinitionId: workflow.workflowDefinitionId,
          nodeId: workflow.targetNodeId,
        });

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(2);
      expect(response.body.data.map((item: { id: string }) => item.id)).toEqual(
        [newerSuggestion.id, olderSuggestion.id],
      );
    });
  });

  describe('POST /api/v1/optimization-suggestions/:id/apply', () => {
    it('当前无执行落点时应拒绝采纳且不改目标或非目标节点配置', async () => {
      if (!ctx) {
        throw new Error('RLS test context not initialized');
      }

      const tenant = await seedTenant('optimization-apply');
      const workflow = await seedWorkflow({
        tenantId: tenant.tenantId,
        createdBy: tenant.user.id,
        prefix: 'optimization-apply',
      });

      const suggestion = await seedSuggestion({
        tenantId: tenant.tenantId,
        workflowDefinitionId: workflow.workflowDefinitionId,
        nodeId: workflow.targetNodeId,
        suggestionType: 'autonomy_upgrade',
        currentValue: { autonomyMode: 'MANUAL_CONFIRM' },
        suggestedValue: { autonomyMode: 'LLM_SUGGEST' },
      });

      const response = await request(app!.getHttpServer())
        .post(`/api/v1/optimization-suggestions/${suggestion.id}/apply`)
        .set(tenant.headers);

      // 规则来源：optimization-suggestion.service.ts:28-39、521-532。
      // 工作流 Agent 节点不消费这些配置字段，生产端因此有意拒绝“采纳后无效果”的建议；
      // 旧用例期待 201 并写回画布会制造已生效的假象，409 且不写任何节点才是当前契约。
      expect(response.status).toBe(409);
      expect(response.body).toMatchObject({
        type: 'OPTIMIZATION_SUGGESTION_NOT_APPLICABLE',
        title: '优化建议当前不可采纳',
        status: 409,
      });
      expect(response.body.detail).toContain('采纳后不会产生任何效果');

      const [updatedWorkflow] = await ctx.adminSql`
        SELECT nodes
        FROM workflow_definitions
        WHERE id = ${workflow.workflowDefinitionId}::uuid
      `;
      const nodes = updatedWorkflow.nodes as Array<{
        id: string;
        data?: {
          autonomyMode?: string;
          autonomyConfig?: Record<string, unknown>;
          settings?: Record<string, unknown>;
          config?: Record<string, unknown>;
        };
      }>;
      const targetNode = nodes.find(
        (node) => node.id === workflow.targetNodeId,
      );
      const siblingNode = nodes.find(
        (node) => node.id === workflow.siblingNodeId,
      );

      expect(targetNode?.data?.config).toEqual({
        autonomyMode: 'MANUAL_CONFIRM',
        modelId: 'gpt-4o',
        modelName: 'GPT-4o',
        provider: 'openai',
        timeoutMs: 60_000,
        tools: ['web-search', 'code-runner'],
      });
      expect(targetNode?.data).toMatchObject({
        autonomyMode: 'MANUAL_CONFIRM',
        autonomyConfig: {
          mode: 'RULE_BASED',
          confirmationThreshold: 0.75,
        },
        settings: {
          autonomyMode: 'RULE_BASED',
          section: 'advanced',
        },
      });
      // 即使未来重新开放某类建议，非目标节点也必须保持不变。
      expect(siblingNode?.data?.config).toEqual({
        autonomyMode: 'RULE_BASED',
        modelId: 'claude-3-7-sonnet',
        timeoutMs: 45_000,
        tools: ['browser'],
      });

      const [unchangedSuggestion] = await ctx.adminSql`
        SELECT status, applied_at, applied_by_user_id
        FROM optimization_suggestions
        WHERE id = ${suggestion.id}::uuid
      `;
      expect(unchangedSuggestion).toMatchObject({
        status: 'pending',
        applied_at: null,
        applied_by_user_id: null,
      });
    });

    it('建议已被处理时应返回 409 冲突', async () => {
      const tenant = await seedTenant('optimization-apply-conflict');
      const workflow = await seedWorkflow({
        tenantId: tenant.tenantId,
        createdBy: tenant.user.id,
        prefix: 'optimization-apply-conflict',
      });

      const suggestion = await seedSuggestion({
        tenantId: tenant.tenantId,
        workflowDefinitionId: workflow.workflowDefinitionId,
        nodeId: workflow.targetNodeId,
        suggestionType: 'timeout_adjustment',
        status: 'applied',
        currentValue: { timeoutMs: 60_000 },
        suggestedValue: { timeoutMs: 45_000 },
        appliedAt: new Date('2026-02-01T00:02:00.000Z'),
        appliedByUserId: tenant.user.id,
      });

      const response = await request(app!.getHttpServer())
        .post(`/api/v1/optimization-suggestions/${suggestion.id}/apply`)
        .set(tenant.headers);

      expect(response.status).toBe(409);
      expect(response.body).toMatchObject({
        type: 'OPTIMIZATION_SUGGESTION_STATUS_CONFLICT',
        title: 'Suggestion Status Conflict',
        status: 409,
        detail: `Optimization suggestion ${suggestion.id} is already applied`,
      });
    });
  });

  describe('POST /api/v1/optimization-suggestions/:id/dismiss', () => {
    it('应忽略建议并写入审计字段', async () => {
      const tenant = await seedTenant('optimization-dismiss');
      const workflow = await seedWorkflow({
        tenantId: tenant.tenantId,
        createdBy: tenant.user.id,
        prefix: 'optimization-dismiss',
      });

      const suggestion = await seedSuggestion({
        tenantId: tenant.tenantId,
        workflowDefinitionId: workflow.workflowDefinitionId,
        nodeId: workflow.targetNodeId,
        suggestionType: 'timeout_adjustment',
        currentValue: { timeoutMs: 60_000 },
        suggestedValue: { timeoutMs: 45_000 },
      });

      const response = await request(app!.getHttpServer())
        .post(`/api/v1/optimization-suggestions/${suggestion.id}/dismiss`)
        .set(tenant.headers);

      // 规则来源：optimization-suggestion.controller.ts:88-92。
      // dismiss 是对既有资源的状态更新，controller 显式约定 HTTP 200；旧 201 期望是残留契约。
      expect(response.status).toBe(200);
      expect(response.body.data).toMatchObject({
        id: suggestion.id,
        status: 'dismissed',
        dismissedByUserId: tenant.user.id,
      });
      expect(response.body.data.dismissedAt).toEqual(expect.any(String));

      const [dismissedSuggestion] = await ctx!.adminSql`
        SELECT status, dismissed_at, dismissed_by_user_id
        FROM optimization_suggestions
        WHERE id = ${suggestion.id}::uuid
      `;
      expect(dismissedSuggestion).toMatchObject({
        status: 'dismissed',
        dismissed_by_user_id: tenant.user.id,
        dismissed_at: expect.any(Date),
      });
    });

    it('建议已被处理时应返回 409 冲突', async () => {
      const tenant = await seedTenant('optimization-dismiss-conflict');
      const workflow = await seedWorkflow({
        tenantId: tenant.tenantId,
        createdBy: tenant.user.id,
        prefix: 'optimization-dismiss-conflict',
      });

      const suggestion = await seedSuggestion({
        tenantId: tenant.tenantId,
        workflowDefinitionId: workflow.workflowDefinitionId,
        nodeId: workflow.targetNodeId,
        suggestionType: 'timeout_adjustment',
        status: 'dismissed',
        currentValue: { timeoutMs: 60_000 },
        suggestedValue: { timeoutMs: 45_000 },
        dismissedAt: new Date('2026-02-01T00:02:00.000Z'),
        dismissedByUserId: tenant.user.id,
      });

      const response = await request(app!.getHttpServer())
        .post(`/api/v1/optimization-suggestions/${suggestion.id}/dismiss`)
        .set(tenant.headers);

      expect(response.status).toBe(409);
      expect(response.body).toMatchObject({
        type: 'OPTIMIZATION_SUGGESTION_STATUS_CONFLICT',
        title: 'Suggestion Status Conflict',
        status: 409,
        detail: `Optimization suggestion ${suggestion.id} is already dismissed`,
      });
    });
  });

  describe('GET /api/v1/optimization-suggestions/stats', () => {
    it('应返回带 byType.total 的采纳率统计', async () => {
      const tenant = await seedTenant('optimization-stats');
      const workflow = await seedWorkflow({
        tenantId: tenant.tenantId,
        createdBy: tenant.user.id,
        prefix: 'optimization-stats',
      });

      await seedSuggestion({
        tenantId: tenant.tenantId,
        workflowDefinitionId: workflow.workflowDefinitionId,
        nodeId: workflow.targetNodeId,
        suggestionType: 'model_downgrade',
        status: 'applied',
        currentValue: {
          modelId: 'gpt-4o',
          modelName: 'GPT-4o',
          provider: 'openai',
        },
        suggestedValue: {
          modelId: 'gpt-4o-mini',
          modelName: 'GPT-4o Mini',
          provider: 'openai',
        },
        appliedAt: new Date('2026-02-01T00:02:00.000Z'),
        appliedByUserId: tenant.user.id,
      });
      await seedSuggestion({
        tenantId: tenant.tenantId,
        workflowDefinitionId: workflow.workflowDefinitionId,
        nodeId: workflow.targetNodeId,
        suggestionType: 'model_downgrade',
        status: 'dismissed',
        currentValue: {
          modelId: 'gpt-4o',
          modelName: 'GPT-4o',
          provider: 'openai',
        },
        suggestedValue: {
          modelId: 'gpt-4o-mini',
          modelName: 'GPT-4o Mini',
          provider: 'openai',
        },
        dismissedAt: new Date('2026-02-01T00:03:00.000Z'),
        dismissedByUserId: tenant.user.id,
      });
      await seedSuggestion({
        tenantId: tenant.tenantId,
        workflowDefinitionId: workflow.workflowDefinitionId,
        nodeId: workflow.targetNodeId,
        suggestionType: 'tool_pruning',
        status: 'pending',
        currentValue: { tools: ['browser', 'search'] },
        suggestedValue: { tools: ['browser'], removedTools: ['search'] },
      });

      const response = await request(app!.getHttpServer())
        .get('/api/v1/optimization-suggestions/stats')
        .set(tenant.headers)
        .query({ workflowDefinitionId: workflow.workflowDefinitionId });

      expect(response.status).toBe(200);
      expect(response.body.data).toEqual({
        total: 3,
        applied: 1,
        blocked: 0,
        dismissed: 1,
        pending: 1,
        adoptionRate: 0.5,
        targetRate: 0.5,
        byType: [
          {
            suggestionType: 'model_downgrade',
            total: 2,
            applied: 1,
            blocked: 0,
            dismissed: 1,
            pending: 0,
            adoptionRate: 0.5,
          },
          {
            suggestionType: 'tool_pruning',
            total: 1,
            applied: 0,
            blocked: 0,
            dismissed: 0,
            pending: 1,
            adoptionRate: 0,
          },
        ],
      });
    });
  });

  describe('multi-tenant isolation', () => {
    it('应阻止跨租户应用建议，并且列表只返回当前租户数据', async () => {
      const tenantOne = await seedTenant('optimization-tenant-one');
      const tenantTwo = await seedTenant('optimization-tenant-two');

      const workflowOne = await seedWorkflow({
        tenantId: tenantOne.tenantId,
        createdBy: tenantOne.user.id,
        prefix: 'optimization-tenant-one',
      });
      const workflowTwo = await seedWorkflow({
        tenantId: tenantTwo.tenantId,
        createdBy: tenantTwo.user.id,
        prefix: 'optimization-tenant-two',
      });

      await seedSuggestion({
        tenantId: tenantOne.tenantId,
        workflowDefinitionId: workflowOne.workflowDefinitionId,
        nodeId: workflowOne.targetNodeId,
        suggestionType: 'timeout_adjustment',
        currentValue: { timeoutMs: 60_000 },
        suggestedValue: { timeoutMs: 45_000 },
      });
      const tenantTwoSuggestion = await seedSuggestion({
        tenantId: tenantTwo.tenantId,
        workflowDefinitionId: workflowTwo.workflowDefinitionId,
        nodeId: workflowTwo.targetNodeId,
        suggestionType: 'autonomy_upgrade',
        currentValue: { autonomyMode: 'MANUAL_CONFIRM' },
        suggestedValue: { autonomyMode: 'LLM_SUGGEST' },
      });

      const listResponse = await request(app!.getHttpServer())
        .get('/api/v1/optimization-suggestions')
        .set(tenantOne.headers);
      const crossTenantApplyResponse = await request(app!.getHttpServer())
        .post(
          `/api/v1/optimization-suggestions/${tenantTwoSuggestion.id}/apply`,
        )
        .set(tenantOne.headers);

      expect(listResponse.status).toBe(200);
      expect(listResponse.body.data.data).toHaveLength(1);
      expect(
        listResponse.body.data.data.every(
          (item: { workflowDefinitionId: string }) =>
            item.workflowDefinitionId === workflowOne.workflowDefinitionId,
        ),
      ).toBe(true);

      expect(crossTenantApplyResponse.status).toBe(404);
      expect(crossTenantApplyResponse.body).toMatchObject({
        type: 'OPTIMIZATION_SUGGESTION_NOT_FOUND',
        title: 'Suggestion Not Found',
        status: 404,
        detail: `Optimization suggestion ${tenantTwoSuggestion.id} not found`,
      });
    });
  });
});
