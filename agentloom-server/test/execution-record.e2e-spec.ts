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
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
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
import { ExecutionRecordService } from '../src/modules/execution-record/execution-record.service';
import {
  createRlsTestContext,
  seedAppUser,
  seedMember,
  seedOrg,
  type OrganizationRole,
  type RlsTestContext,
} from './rls/rls-test-utils';

const JWT_SECRET = 'test-e2e-jwt-secret';
const TOOL_CALL_IO_MAX_BYTES = 5 * 1024;
const IO_SNAPSHOTS_MAX_BYTES = 10 * 1024;

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

type SeededExecutionRecord = {
  id: string;
  executionId: string;
  stepId: string | null;
  nodeId: string | null;
  recordType: 'step_telemetry' | 'execution_summary';
  telemetryData: JSONValue | null;
  summaryData: JSONValue | null;
  createdAt: string;
};

type SeedRecordInput = {
  stepId: string | null;
  nodeId: string | null;
  recordType: 'step_telemetry' | 'execution_summary';
  telemetryData: JSONValue | null;
  summaryData: JSONValue | null;
  createdAt: Date;
};

type SeededExecutionGraph = {
  workflowDefinitionId: string;
  workflowVersionId: string;
  executionId: string;
  stepId: string;
  records: SeededExecutionRecord[];
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

function createWorkflowSnapshot() {
  return {
    nodes: [
      {
        id: 'node-1',
        type: 'agent',
        position: { x: 0, y: 0 },
        data: {
          label: '测试 Agent',
        },
      },
    ],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 },
    metadata: {
      nodeCount: 1,
      edgeCount: 0,
      createdFromVersion: 1,
    },
  };
}

function createStepTelemetryData(startedAt: Date, completedAt: Date) {
  return {
    toolCalls: [
      {
        toolName: 'web-search',
        status: 'success',
        input: { query: 'execution record e2e' },
        output: { snippets: ['ok'] },
        durationMs: completedAt.getTime() - startedAt.getTime(),
      },
    ],
    errors: [],
    selfRepairs: [],
    ioSnapshots: {
      stepInput: { prompt: 'hello' },
      stepOutput: { text: 'world' },
    },
    llmInteractions: {
      modelId: 'gpt-4o-mini',
      promptTokens: 12,
      completionTokens: 24,
      totalTokens: 36,
      latencyMs: completedAt.getTime() - startedAt.getTime(),
    },
  };
}

function createExecutionSummaryData() {
  return {
    totalSteps: 1,
    completedSteps: 1,
    failedSteps: 0,
    totalToolCalls: 1,
    totalErrors: 0,
    totalSelfRepairs: 0,
    totalTokens: 36,
    totalLatencyMs: 240,
    avgStepLatencyMs: 240,
    executionDurationMs: 1_000,
  };
}

function getStringBytes(value: string): number {
  return new TextEncoder().encode(value).length;
}

function getSerializedBytes(value: unknown): number {
  const serialized = JSON.stringify(value);
  return serialized === undefined ? 0 : getStringBytes(serialized);
}

describe('ExecutionRecord E2E', () => {
  let ctx: RlsTestContext | undefined;
  let app: NestFastifyApplication | undefined;
  let drizzleDb: DrizzleDB;
  let executionRecordService: ExecutionRecordService;
  let redisClientMock: ReturnType<typeof createMockRedisClient>;
  let redisCacheMock: ReturnType<typeof createMockRedisCacheService>;
  let redisPubSubMock: ReturnType<typeof createMockRedisPubSubService>;
  let nodeSchedulerMock: ReturnType<typeof createMockNodeSchedulerService>;

  beforeAll(async () => {
    ensureTestEnvironment();

    ctx = await createRlsTestContext();
    drizzleDb = ctx.db;
    redisClientMock = createMockRedisClient();
    redisCacheMock = createMockRedisCacheService();
    redisPubSubMock = createMockRedisPubSubService();
    nodeSchedulerMock = createMockNodeSchedulerService();

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
      .overrideProvider(NodeSchedulerService)
      .useValue(nodeSchedulerMock)
      .compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalPipes(new ZodValidationPipe());

    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    executionRecordService = app.get(ExecutionRecordService);
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

  async function seedExecutionGraph(options: {
    tenantId: string;
    createdBy: string;
    prefix: string;
    records?: SeedRecordInput[];
  }): Promise<SeededExecutionGraph> {
    if (!ctx) {
      throw new Error('RLS test context not initialized');
    }

    const workflowDefinitionId = crypto.randomUUID();
    const workflowVersionId = crypto.randomUUID();
    const executionId = crypto.randomUUID();
    const stepId = crypto.randomUUID();
    const snapshot = createWorkflowSnapshot();
    const startedAt = new Date('2026-01-01T00:00:00.000Z');
    const completedAt = new Date('2026-01-01T00:00:01.000Z');
    const seedRecords =
      options.records ??
      [
        {
          stepId,
          nodeId: 'node-1',
          recordType: 'step_telemetry' as const,
          telemetryData: createStepTelemetryData(startedAt, completedAt),
          summaryData: null,
          createdAt: new Date('2026-01-01T00:00:02.000Z'),
        },
        {
          stepId: null,
          nodeId: null,
          recordType: 'execution_summary' as const,
          telemetryData: null,
          summaryData: createExecutionSummaryData(),
          createdAt: new Date('2026-01-01T00:00:03.000Z'),
        },
      ];

    await ctx.adminSql`
      INSERT INTO workflow_definitions (
        id,
        tenant_id,
        name,
        slug,
        description,
        nodes,
        edges,
        viewport,
        metadata,
        input_schema,
        version,
        status,
        created_by,
        updated_by,
        created_at,
        updated_at
      )
      VALUES (
        ${workflowDefinitionId}::uuid,
        ${options.tenantId}::uuid,
        ${`${options.prefix} workflow`},
        ${`${options.prefix}-${workflowDefinitionId.slice(0, 8)}`},
        ${'Execution record E2E workflow'},
        ${ctx.adminSql.json(snapshot.nodes)},
        ${ctx.adminSql.json(snapshot.edges)},
        ${ctx.adminSql.json(snapshot.viewport)},
        ${ctx.adminSql.json({ source: 'execution-record.e2e' })},
        ${null},
        1,
        'draft'::workflow_status_enum,
        ${options.createdBy}::uuid,
        ${options.createdBy}::uuid,
        ${startedAt},
        ${completedAt}
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
        archived_at,
        created_by,
        created_at
      )
      VALUES (
        ${workflowVersionId}::uuid,
        ${workflowDefinitionId}::uuid,
        ${options.tenantId}::uuid,
        1,
        ${'v1'},
        ${ctx.adminSql.json(snapshot)},
        ${completedAt},
        ${null},
        ${options.createdBy}::uuid,
        ${completedAt}
      )
    `;

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
        created_by,
        created_at,
        updated_at
      )
      VALUES (
        ${executionId}::uuid,
        ${workflowDefinitionId}::uuid,
        ${workflowVersionId}::uuid,
        ${options.tenantId}::uuid,
        'completed'::execution_status_enum,
        'manual'::execution_trigger_type_enum,
        ${ctx.adminSql.json({ source: 'manual' })},
        ${ctx.adminSql.json(snapshot)},
        ${startedAt},
        ${completedAt},
        1,
        1,
        ${options.createdBy}::uuid,
        ${startedAt},
        ${completedAt}
      )
    `;

    await ctx.adminSql`
      INSERT INTO execution_steps (
        id,
        execution_id,
        node_id,
        step_order,
        status,
        node_type,
        node_data,
        input,
        result,
        attempt_count,
        checkpoint_data,
        error_message,
        is_encrypted,
        started_at,
        completed_at,
        created_at,
        updated_at
      )
      VALUES (
        ${stepId}::uuid,
        ${executionId}::uuid,
        ${'node-1'},
        1,
        'completed'::step_status_enum,
        ${ctx.adminSql.json({ type: 'agent' })},
        ${ctx.adminSql.json({ label: '测试 Agent' })},
        ${ctx.adminSql.json({ prompt: 'hello' })},
        ${ctx.adminSql.json({ output: 'test' })},
        1,
        ${ctx.adminSql.json({})},
        ${null},
        false,
        ${startedAt},
        ${completedAt},
        ${startedAt},
        ${completedAt}
      )
    `;

    const records: SeededExecutionRecord[] = [];

    for (const record of seedRecords) {
      const telemetryData =
        record.telemetryData === null
          ? null
          : ctx.adminSql.json(record.telemetryData as JSONValue);
      const summaryData =
        record.summaryData === null
          ? null
          : ctx.adminSql.json(record.summaryData as JSONValue);

      const [inserted] = await ctx.adminSql`
        INSERT INTO agent_execution_records (
          id,
          tenant_id,
          execution_id,
          step_id,
          node_id,
          record_type,
          telemetry_data,
          summary_data,
          created_at
        )
        VALUES (
          uuid_generate_v7(),
          ${options.tenantId}::uuid,
          ${executionId}::uuid,
          ${record.stepId}::uuid,
          ${record.nodeId},
          ${record.recordType}::record_type,
          ${telemetryData},
          ${summaryData},
          ${record.createdAt}
        )
        RETURNING id, execution_id, step_id, node_id, record_type, telemetry_data, summary_data, created_at
      `;

      records.push({
        id: inserted.id,
        executionId: inserted.execution_id,
        stepId: inserted.step_id,
        nodeId: inserted.node_id,
        recordType: inserted.record_type,
        telemetryData: inserted.telemetry_data,
        summaryData: inserted.summary_data,
        createdAt: inserted.created_at.toISOString(),
      });
    }

    return {
      workflowDefinitionId,
      workflowVersionId,
      executionId,
      stepId,
      records,
    };
  }

  describe('GET /api/v1/execution-records', () => {
    it('should return records filtered by executionId', async () => {
      const tenant = await seedTenant('records-by-execution');
      const seeded = await seedExecutionGraph({
        tenantId: tenant.tenantId,
        createdBy: tenant.user.id,
        prefix: 'records-by-execution',
      });

      const response = await request(app!.getHttpServer())
        .get('/api/v1/execution-records')
        .set(tenant.headers)
        .query({ executionId: seeded.executionId });

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(2);
      expect(response.body.data.map((record: { recordType: string }) => record.recordType))
        .toEqual(['execution_summary', 'step_telemetry']);
      expect(response.body.data[0]).toMatchObject({
        recordType: 'execution_summary',
        telemetryData: null,
        summaryData: createExecutionSummaryData(),
      });
      expect(response.body.data[1]).toMatchObject({
        recordType: 'step_telemetry',
        summaryData: null,
        telemetryData: createStepTelemetryData(
          new Date('2026-01-01T00:00:00.000Z'),
          new Date('2026-01-01T00:00:01.000Z'),
        ),
      });
      expect(response.body.meta).toEqual({
        total: 2,
        limit: 50,
        offset: 0,
        hasMore: false,
      });
      expect(
        response.body.data.every(
          (record: { executionId: string }) =>
            record.executionId === seeded.executionId,
        ),
      ).toBe(true);
    });

    it('should return records filtered by recordType', async () => {
      const tenant = await seedTenant('records-by-type');
      const seeded = await seedExecutionGraph({
        tenantId: tenant.tenantId,
        createdBy: tenant.user.id,
        prefix: 'records-by-type',
      });

      const response = await request(app!.getHttpServer())
        .get('/api/v1/execution-records')
        .set(tenant.headers)
        .query({
          executionId: seeded.executionId,
          recordType: 'step_telemetry',
        });

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0]).toMatchObject({
        executionId: seeded.executionId,
        stepId: seeded.stepId,
        nodeId: 'node-1',
        recordType: 'step_telemetry',
      });
      expect(response.body.meta).toEqual({
        total: 1,
        limit: 50,
        offset: 0,
        hasMore: false,
      });
    });

    it('should return records filtered by stepId', async () => {
      const tenant = await seedTenant('records-by-step');
      const seeded = await seedExecutionGraph({
        tenantId: tenant.tenantId,
        createdBy: tenant.user.id,
        prefix: 'records-by-step',
      });

      const response = await request(app!.getHttpServer())
        .get('/api/v1/execution-records')
        .set(tenant.headers)
        .query({
          executionId: seeded.executionId,
          stepId: seeded.stepId,
        });

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0]).toMatchObject({
        executionId: seeded.executionId,
        stepId: seeded.stepId,
        nodeId: 'node-1',
        recordType: 'step_telemetry',
      });
      expect(response.body.meta).toEqual({
        total: 1,
        limit: 50,
        offset: 0,
        hasMore: false,
      });
    });

    it('should respect limit and offset pagination', async () => {
      const tenant = await seedTenant('records-pagination');
      const recordStartedAt = new Date('2026-01-01T00:00:00.000Z');
      const recordCompletedAt = new Date('2026-01-01T00:00:00.240Z');
      const seeded = await seedExecutionGraph({
        tenantId: tenant.tenantId,
        createdBy: tenant.user.id,
        prefix: 'records-pagination',
        records: [
          {
            stepId: null,
            nodeId: 'node-1',
            recordType: 'step_telemetry',
            telemetryData: createStepTelemetryData(
              recordStartedAt,
              recordCompletedAt,
            ),
            summaryData: null,
            createdAt: new Date('2026-01-01T00:00:01.000Z'),
          },
          {
            stepId: null,
            nodeId: null,
            recordType: 'execution_summary',
            telemetryData: null,
            summaryData: createExecutionSummaryData(),
            createdAt: new Date('2026-01-01T00:00:02.000Z'),
          },
          {
            stepId: null,
            nodeId: 'node-1',
            recordType: 'step_telemetry',
            telemetryData: createStepTelemetryData(
              recordStartedAt,
              recordCompletedAt,
            ),
            summaryData: null,
            createdAt: new Date('2026-01-01T00:00:03.000Z'),
          },
          {
            stepId: null,
            nodeId: null,
            recordType: 'execution_summary',
            telemetryData: null,
            summaryData: createExecutionSummaryData(),
            createdAt: new Date('2026-01-01T00:00:04.000Z'),
          },
        ],
      });

      const firstPage = await request(app!.getHttpServer())
        .get('/api/v1/execution-records')
        .set(tenant.headers)
        .query({
          executionId: seeded.executionId,
          limit: 1,
          offset: 0,
        });

      const secondPage = await request(app!.getHttpServer())
        .get('/api/v1/execution-records')
        .set(tenant.headers)
        .query({
          executionId: seeded.executionId,
          limit: 1,
          offset: 1,
        });

      expect(firstPage.status).toBe(200);
      expect(secondPage.status).toBe(200);

      expect(firstPage.body.data).toHaveLength(1);
      expect(secondPage.body.data).toHaveLength(1);
      expect(firstPage.body.data[0].id).not.toBe(secondPage.body.data[0].id);
      expect(firstPage.body.meta).toEqual({
        total: 4,
        limit: 1,
        offset: 0,
        hasMore: true,
      });
      expect(secondPage.body.meta).toEqual({
        total: 4,
        limit: 1,
        offset: 1,
        hasMore: true,
      });
      expect(new Date(firstPage.body.data[0].createdAt).getTime()).toBeGreaterThan(
        new Date(secondPage.body.data[0].createdAt).getTime(),
      );
    });

    it('should return 422 for missing executionId', async () => {
      const tenant = await seedTenant('records-missing-execution-id');

      const response = await request(app!.getHttpServer())
        .get('/api/v1/execution-records')
        .set(tenant.headers);

      expect(response.status).toBe(422);
      expect(response.headers['content-type']).toContain(
        'application/problem+json',
      );
      expect(response.body).toMatchObject({
        type: 'https://agentloom.dev/errors/validation-error',
        title: 'Validation Error',
        status: 422,
        detail: 'Request validation failed',
      });
    });

    it('should return 422 for invalid executionId format', async () => {
      const tenant = await seedTenant('records-invalid-execution-id');

      const response = await request(app!.getHttpServer())
        .get('/api/v1/execution-records')
        .set(tenant.headers)
        .query({ executionId: 'not-a-uuid' });

      expect(response.status).toBe(422);
      expect(response.headers['content-type']).toContain(
        'application/problem+json',
      );
      expect(response.body).toMatchObject({
        type: 'https://agentloom.dev/errors/validation-error',
        title: 'Validation Error',
        status: 422,
        detail: 'Request validation failed',
      });
    });

    it('should return 404 for non-existent executionId', async () => {
      const tenant = await seedTenant('records-empty-result');
      const missingExecutionId = crypto.randomUUID();

      const response = await request(app!.getHttpServer())
        .get('/api/v1/execution-records')
        .set(tenant.headers)
        .query({ executionId: missingExecutionId });

      expect(response.status).toBe(404);
      expect(response.headers['content-type']).toContain(
        'application/problem+json',
      );
      expect(response.body).toMatchObject({
        type: 'https://agentloom.dev/errors/execution-not-found',
        title: '执行记录不存在',
        status: 404,
        detail: `执行记录 ${missingExecutionId} 不存在`,
      });
    });

    it('should return 200 with an empty array when the execution exists but has no records', async () => {
      const tenant = await seedTenant('records-existing-empty');
      const seeded = await seedExecutionGraph({
        tenantId: tenant.tenantId,
        createdBy: tenant.user.id,
        prefix: 'records-existing-empty',
        records: [],
      });

      const response = await request(app!.getHttpServer())
        .get('/api/v1/execution-records')
        .set(tenant.headers)
        .query({ executionId: seeded.executionId });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        data: [],
        meta: {
          total: 0,
          limit: 50,
          offset: 0,
          hasMore: false,
        },
      });
    });

    it('should return structured truncated telemetry data with redacted secrets', async () => {
      if (!ctx) {
        throw new Error('RLS test context not initialized');
      }

      const tenant = await seedTenant('records-truncated-telemetry');
      const seeded = await seedExecutionGraph({
        tenantId: tenant.tenantId,
        createdBy: tenant.user.id,
        prefix: 'records-truncated-telemetry',
        records: [],
      });

      await ctx.adminSql`
        UPDATE execution_steps
        SET
          input = ${ctx.adminSql.json({
            authorizationHeader: 'Bearer secret-input',
            inputTokens: 99,
            content: 'i'.repeat(IO_SNAPSHOTS_MAX_BYTES * 2),
          })},
          result = ${ctx.adminSql.json({
            modelId: 'gpt-4.1',
            promptTokens: 123,
            completionTokens: 45,
            totalTokens: 168,
            privateKey: 'private-output-key',
            content: 'o'.repeat(IO_SNAPSHOTS_MAX_BYTES * 2),
          })},
          checkpoint_data = ${ctx.adminSql.json({
            toolCalls: [
              {
                id: 'tool-1',
                tool: 'search_docs',
                args: {
                  apiKey: 'tool-secret-key',
                  promptTokens: 77,
                  content: 'x'.repeat(TOOL_CALL_IO_MAX_BYTES * 2),
                },
                status: 'completed',
                result: {
                  accessKey: 'tool-access-key',
                  totalTokens: 88,
                  content: 'y'.repeat(TOOL_CALL_IO_MAX_BYTES * 2),
                },
                transitions: [
                  {
                    from: 'pending',
                    to: 'in_progress',
                    timestamp: '2026-01-01T00:00:00.000Z',
                  },
                  {
                    from: 'in_progress',
                    to: 'completed',
                    timestamp: '2026-01-01T00:00:01.000Z',
                  },
                ],
              },
            ],
          })}
        WHERE id = ${seeded.stepId}::uuid
      `;

      await executionRecordService.handleStepStatusChanged({
        tenantId: tenant.tenantId,
        executionId: seeded.executionId,
        stepId: seeded.stepId,
        nodeId: 'node-1',
        from: 'running',
        to: 'completed',
      });

      const response = await request(app!.getHttpServer())
        .get('/api/v1/execution-records')
        .set(tenant.headers)
        .query({
          executionId: seeded.executionId,
          recordType: 'step_telemetry',
        });

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(1);

      const telemetry = response.body.data[0].telemetryData;
      expect(telemetry.toolCalls[0]).toMatchObject({
        toolName: 'search_docs',
        status: 'success',
        input: {
          apiKey: '[REDACTED]',
          promptTokens: 77,
        },
        output: {
          accessKey: '[REDACTED]',
          totalTokens: 88,
        },
      });
      expect(getSerializedBytes(telemetry.toolCalls[0].input)).toBeLessThanOrEqual(
        TOOL_CALL_IO_MAX_BYTES,
      );
      expect(getSerializedBytes(telemetry.toolCalls[0].output)).toBeLessThanOrEqual(
        TOOL_CALL_IO_MAX_BYTES,
      );
      expect(JSON.stringify(telemetry.toolCalls[0].input)).toContain('[TRUNCATED]');
      expect(JSON.stringify(telemetry.toolCalls[0].output)).toContain('[TRUNCATED]');

      expect(telemetry.ioSnapshots.stepInput).toMatchObject({
        authorizationHeader: '[REDACTED]',
        inputTokens: 99,
      });
      expect(telemetry.ioSnapshots.stepOutput).toMatchObject({
        modelId: 'gpt-4.1',
        promptTokens: 123,
        completionTokens: 45,
        totalTokens: 168,
        privateKey: '[REDACTED]',
      });
      expect(getSerializedBytes(telemetry.ioSnapshots.stepInput)).toBeLessThanOrEqual(
        IO_SNAPSHOTS_MAX_BYTES,
      );
      expect(getSerializedBytes(telemetry.ioSnapshots.stepOutput)).toBeLessThanOrEqual(
        IO_SNAPSHOTS_MAX_BYTES,
      );
      expect(JSON.stringify(telemetry.ioSnapshots.stepInput)).toContain('[TRUNCATED]');
      expect(JSON.stringify(telemetry.ioSnapshots.stepOutput)).toContain(
        '[TRUNCATED]',
      );

      expect(telemetry.llmInteractions).toEqual({
        modelId: 'gpt-4.1',
        promptTokens: 123,
        completionTokens: 45,
        totalTokens: 168,
        latencyMs: 1000,
      });
    });

    it('should enforce multi-tenant isolation', async () => {
      const tenantOne = await seedTenant('records-tenant-one');
      const tenantTwo = await seedTenant('records-tenant-two');

      const tenantOneSeed = await seedExecutionGraph({
        tenantId: tenantOne.tenantId,
        createdBy: tenantOne.user.id,
        prefix: 'records-tenant-one',
      });
      const tenantTwoSeed = await seedExecutionGraph({
        tenantId: tenantTwo.tenantId,
        createdBy: tenantTwo.user.id,
        prefix: 'records-tenant-two',
      });

      const ownResponse = await request(app!.getHttpServer())
        .get('/api/v1/execution-records')
        .set(tenantOne.headers)
        .query({ executionId: tenantOneSeed.executionId });

      const crossTenantResponse = await request(app!.getHttpServer())
        .get('/api/v1/execution-records')
        .set(tenantOne.headers)
        .query({ executionId: tenantTwoSeed.executionId });

      expect(ownResponse.status).toBe(200);
      expect(ownResponse.body.data).toHaveLength(2);
      expect(
        ownResponse.body.data.every(
          (record: { executionId: string }) =>
            record.executionId === tenantOneSeed.executionId,
        ),
      ).toBe(true);

      expect(crossTenantResponse.status).toBe(404);
      expect(crossTenantResponse.body).toMatchObject({
        type: 'https://agentloom.dev/errors/execution-not-found',
        title: '执行记录不存在',
        status: 404,
        detail: `执行记录 ${tenantTwoSeed.executionId} 不存在`,
      });
    });
  });
});
