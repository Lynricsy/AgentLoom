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
import type { JSONValue } from 'postgres';
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
import { NodeSchedulerService } from '../src/modules/execution/node-scheduler.service';
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
  workflowVersionId: string;
  snapshot: JSONValue;
};

type SeededExecution = {
  executionId: string;
  workflowDefinitionId: string;
  workflowVersionId: string;
  status: string;
};

type StoredNotification = {
  type: string;
  title: string;
  body: Record<string, unknown> | null;
};

type StoredAuditLog = {
  eventType: string;
  summary: string;
  resourceId: string;
  metadata: Record<string, unknown> | null;
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
    getJob: vi.fn().mockResolvedValue(null),
    getJobs: vi.fn().mockResolvedValue([]),
    close: vi.fn().mockResolvedValue(undefined),
    on: vi.fn().mockImplementation(() => undefined),
    off: vi.fn().mockImplementation(() => undefined),
  };
}

function createMockBullRegistrar() {
  return {
    onModuleInit: vi.fn(),
    register: vi.fn(),
  };
}

function createMockThrottlerOptions() {
  const buckets = new Map<
    string,
    {
      hits: number;
      expiresAt: number;
      blockedUntil: number;
    }
  >();

  return {
    throttlers: [{ name: 'default', ttl: 60_000, limit: 100 }],
    storage: {
      increment: vi
        .fn()
        .mockImplementation(
          async (
            key: string,
            ttl: number,
            limit: number,
            blockDuration: number,
          ) => {
            const now = Date.now();
            const existingBucket = buckets.get(key);
            const bucket =
              existingBucket && existingBucket.expiresAt > now
                ? existingBucket
                : {
                    hits: 0,
                    expiresAt: now + ttl,
                    blockedUntil: 0,
                  };

            if (bucket.blockedUntil > now) {
              buckets.set(key, bucket);

              return {
                totalHits: bucket.hits,
                timeToExpire: Math.max(0, bucket.expiresAt - now),
                isBlocked: true,
                timeToBlockExpire: Math.max(
                  1,
                  Math.ceil((bucket.blockedUntil - now) / 1_000),
                ),
              };
            }

            bucket.hits += 1;
            if (bucket.hits > limit) {
              bucket.blockedUntil = now + blockDuration;
            }

            buckets.set(key, bucket);

            return {
              totalHits: bucket.hits,
              timeToExpire: Math.max(0, bucket.expiresAt - now),
              isBlocked: bucket.hits > limit,
              timeToBlockExpire:
                bucket.hits > limit
                  ? Math.max(1, Math.ceil((bucket.blockedUntil - now) / 1_000))
                  : 0,
            };
          },
        ),
    },
    reset: () => buckets.clear(),
  };
}

async function waitForCondition<T>(
  producer: () => Promise<T>,
  predicate: (value: T) => boolean,
  timeoutMs = 4_000,
): Promise<T> {
  const start = Date.now();
  let lastValue = await producer();

  while (!predicate(lastValue)) {
    if (Date.now() - start >= timeoutMs) {
      throw new Error('Timed out while waiting for expected condition');
    }

    await new Promise((resolve) => setTimeout(resolve, 50));
    lastValue = await producer();
  }

  return lastValue;
}

describe('Resource Governance E2E', () => {
  let ctx: RlsTestContext | undefined;
  let app: NestFastifyApplication | undefined;
  let drizzleDb: DrizzleDB;
  let redisClientMock: ReturnType<typeof createMockRedisClient>;
  let redisCacheMock: ReturnType<typeof createMockRedisCacheService>;
  let redisPubSubMock: ReturnType<typeof createMockRedisPubSubService>;
  let nodeSchedulerMock: ReturnType<typeof createMockNodeSchedulerService>;
  let queueMock: ReturnType<typeof createMockQueue>;
  let bullRegistrarMock: ReturnType<typeof createMockBullRegistrar>;
  let throttlerOptions: ReturnType<typeof createMockThrottlerOptions>;

  beforeAll(async () => {
    ensureTestEnvironment();

    ctx = await createRlsTestContext();
    await bootstrapResourceGovernanceSchema(ctx);
    drizzleDb = ctx.db;
    redisClientMock = createMockRedisClient();
    redisCacheMock = createMockRedisCacheService();
    redisPubSubMock = createMockRedisPubSubService();
    nodeSchedulerMock = createMockNodeSchedulerService();
    queueMock = createMockQueue();
    bullRegistrarMock = createMockBullRegistrar();
    throttlerOptions = createMockThrottlerOptions();

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
        .useValue(queueMock);
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
    if (!ctx) {
      throw new Error('RLS test context not initialized');
    }

    await cleanupExtendedTables(ctx);
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
    redisClientMock.subscribe.mockResolvedValue(undefined);
    redisClientMock.unsubscribe.mockResolvedValue(undefined);
    redisClientMock.connect.mockResolvedValue(undefined);
    redisClientMock.disconnect.mockResolvedValue(undefined);
    redisClientMock.quit.mockResolvedValue('OK');

    redisPubSubMock.publish.mockResolvedValue(undefined);
    redisPubSubMock.subscribe.mockResolvedValue(undefined);
    redisPubSubMock.unsubscribe.mockResolvedValue(undefined);

    queueMock.add.mockResolvedValue(undefined);
    queueMock.getJob.mockResolvedValue(null);
    queueMock.getJobs.mockResolvedValue([]);
    throttlerOptions.reset();
  });

  afterAll(async () => {
    await app?.close();
    await ctx?.close();
  }, 30_000);

  async function cleanupExtendedTables(testCtx: RlsTestContext) {
    await testCtx.adminSql.unsafe(`
      TRUNCATE TABLE
        execution_steps,
        workflow_executions,
        workflow_versions,
        notification_preferences,
        notifications,
        execution_governance_controls,
        tenant_quotas
      RESTART IDENTITY CASCADE
    `);
  }

  async function bootstrapResourceGovernanceSchema(testCtx: RlsTestContext) {
    await testCtx.adminSql.unsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_type WHERE typname = 'execution_governance_state_enum'
        ) THEN
          CREATE TYPE execution_governance_state_enum AS ENUM ('active', 'paused');
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM pg_type WHERE typname = 'governance_scope_enum'
        ) THEN
          CREATE TYPE governance_scope_enum AS ENUM ('tenant', 'workflow');
        END IF;
      END
      $$;
    `);

    await testCtx.adminSql.unsafe(`
      ALTER TYPE notification_type_enum ADD VALUE IF NOT EXISTS 'resource_governance_execution_blocked';
    `);
    await testCtx.adminSql.unsafe(`
      ALTER TYPE notification_type_enum ADD VALUE IF NOT EXISTS 'resource_governance_quota_updated';
    `);
    await testCtx.adminSql.unsafe(`
      ALTER TYPE notification_type_enum ADD VALUE IF NOT EXISTS 'resource_governance_controls_updated';
    `);
    await testCtx.adminSql.unsafe(`
      ALTER TYPE notification_type_enum ADD VALUE IF NOT EXISTS 'resource_governance_execution_terminated';
    `);
    await testCtx.adminSql.unsafe(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON notifications TO authenticated',
    );
    await testCtx.adminSql.unsafe(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON notification_preferences TO authenticated',
    );

    await testCtx.adminSql.unsafe(`
      CREATE TABLE IF NOT EXISTS tenant_quotas (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
        organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        tenant_id uuid NOT NULL,
        api_rate_limit_per_minute integer DEFAULT 100 NOT NULL,
        max_concurrent_executions integer,
        daily_execution_limit integer,
        daily_api_call_limit integer,
        storage_quota_mb integer,
        max_sandbox_cpu_percent integer,
        max_sandbox_memory_mb integer,
        version integer DEFAULT 1 NOT NULL,
        created_by uuid NOT NULL REFERENCES users(id),
        updated_by uuid NOT NULL REFERENCES users(id),
        created_at timestamp with time zone DEFAULT now() NOT NULL,
        updated_at timestamp with time zone DEFAULT now() NOT NULL
      );
    `);
    await testCtx.adminSql.unsafe(
      'CREATE UNIQUE INDEX IF NOT EXISTS uq_tenant_quotas_org ON tenant_quotas (organization_id)',
    );
    await testCtx.adminSql.unsafe(
      'CREATE INDEX IF NOT EXISTS idx_tenant_quotas_tenant ON tenant_quotas (tenant_id)',
    );
    await testCtx.adminSql.unsafe(
      'ALTER TABLE tenant_quotas ENABLE ROW LEVEL SECURITY',
    );
    await testCtx.adminSql.unsafe(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON tenant_quotas TO authenticated',
    );
    await testCtx.adminSql.unsafe(
      'DROP POLICY IF EXISTS tenant_quotas_select_policy ON tenant_quotas',
    );
    await testCtx.adminSql.unsafe(
      'DROP POLICY IF EXISTS tenant_quotas_insert_policy ON tenant_quotas',
    );
    await testCtx.adminSql.unsafe(
      'DROP POLICY IF EXISTS tenant_quotas_update_policy ON tenant_quotas',
    );
    await testCtx.adminSql.unsafe(
      'DROP POLICY IF EXISTS tenant_quotas_delete_policy ON tenant_quotas',
    );
    await testCtx.adminSql.unsafe(
      'CREATE POLICY tenant_quotas_select_policy ON tenant_quotas AS PERMISSIVE FOR SELECT TO authenticated USING (tenant_id = get_tenant_id())',
    );
    await testCtx.adminSql.unsafe(
      'CREATE POLICY tenant_quotas_insert_policy ON tenant_quotas AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (tenant_id = get_tenant_id())',
    );
    await testCtx.adminSql.unsafe(
      'CREATE POLICY tenant_quotas_update_policy ON tenant_quotas AS PERMISSIVE FOR UPDATE TO authenticated USING (tenant_id = get_tenant_id()) WITH CHECK (tenant_id = get_tenant_id())',
    );
    await testCtx.adminSql.unsafe(
      'CREATE POLICY tenant_quotas_delete_policy ON tenant_quotas AS PERMISSIVE FOR DELETE TO authenticated USING (tenant_id = get_tenant_id())',
    );

    await testCtx.adminSql.unsafe(`
      CREATE TABLE IF NOT EXISTS execution_governance_controls (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
        organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        tenant_id uuid NOT NULL,
        scope governance_scope_enum NOT NULL,
        target_id uuid NOT NULL,
        status execution_governance_state_enum DEFAULT 'active' NOT NULL,
        reason text,
        version integer DEFAULT 1 NOT NULL,
        created_by uuid NOT NULL REFERENCES users(id),
        updated_by uuid NOT NULL REFERENCES users(id),
        created_at timestamp with time zone DEFAULT now() NOT NULL,
        updated_at timestamp with time zone DEFAULT now() NOT NULL
      );
    `);
    await testCtx.adminSql.unsafe(
      'CREATE UNIQUE INDEX IF NOT EXISTS uq_execution_governance_controls_target ON execution_governance_controls (organization_id, scope, target_id)',
    );
    await testCtx.adminSql.unsafe(
      'CREATE INDEX IF NOT EXISTS idx_execution_governance_controls_tenant ON execution_governance_controls (tenant_id)',
    );
    await testCtx.adminSql.unsafe(
      'CREATE INDEX IF NOT EXISTS idx_execution_governance_controls_scope ON execution_governance_controls (organization_id, scope)',
    );
    await testCtx.adminSql.unsafe(
      'ALTER TABLE execution_governance_controls ENABLE ROW LEVEL SECURITY',
    );
    await testCtx.adminSql.unsafe(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON execution_governance_controls TO authenticated',
    );
    await testCtx.adminSql.unsafe(
      'DROP POLICY IF EXISTS execution_governance_controls_select_policy ON execution_governance_controls',
    );
    await testCtx.adminSql.unsafe(
      'DROP POLICY IF EXISTS execution_governance_controls_insert_policy ON execution_governance_controls',
    );
    await testCtx.adminSql.unsafe(
      'DROP POLICY IF EXISTS execution_governance_controls_update_policy ON execution_governance_controls',
    );
    await testCtx.adminSql.unsafe(
      'DROP POLICY IF EXISTS execution_governance_controls_delete_policy ON execution_governance_controls',
    );
    await testCtx.adminSql.unsafe(
      'CREATE POLICY execution_governance_controls_select_policy ON execution_governance_controls AS PERMISSIVE FOR SELECT TO authenticated USING (tenant_id = get_tenant_id())',
    );
    await testCtx.adminSql.unsafe(
      'CREATE POLICY execution_governance_controls_insert_policy ON execution_governance_controls AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (tenant_id = get_tenant_id())',
    );
    await testCtx.adminSql.unsafe(
      'CREATE POLICY execution_governance_controls_update_policy ON execution_governance_controls AS PERMISSIVE FOR UPDATE TO authenticated USING (tenant_id = get_tenant_id()) WITH CHECK (tenant_id = get_tenant_id())',
    );
    await testCtx.adminSql.unsafe(
      'CREATE POLICY execution_governance_controls_delete_policy ON execution_governance_controls AS PERMISSIVE FOR DELETE TO authenticated USING (tenant_id = get_tenant_id())',
    );
  }

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

  async function seedPublishedWorkflow(options: {
    tenantId: string;
    createdBy: string;
    prefix: string;
    name?: string;
  }): Promise<SeededWorkflow> {
    if (!ctx) {
      throw new Error('RLS test context not initialized');
    }

    const workflowDefinitionId = crypto.randomUUID();
    const workflowVersionId = crypto.randomUUID();
    const nodeId = `agent-${crypto.randomUUID().slice(0, 8)}`;
    const nodes = [
      {
        id: nodeId,
        type: 'llm-agent',
        position: { x: 0, y: 0 },
        data: {
          label: options.name ?? `${options.prefix} Agent`,
          config: {
            modelId: 'gpt-4o-mini',
            provider: 'openai',
            timeoutMs: 30_000,
          },
        },
      },
    ] satisfies JSONValue[];
    const edges: JSONValue[] = [];
    const viewport = { x: 0, y: 0, zoom: 1 } satisfies JSONValue;
    const snapshot: JSONValue = {
      nodes,
      edges,
      viewport,
      inputSchema: null,
      metadata: {
        nodeCount: 1,
        edgeCount: 0,
        createdFromVersion: 1,
      },
    };

    await seedWorkflowDefinition(ctx.adminSql, {
      id: workflowDefinitionId,
      tenantId: options.tenantId,
      name: options.name ?? `${options.prefix} workflow`,
      slug: `${options.prefix}-${workflowDefinitionId.slice(0, 8)}`,
      createdBy: options.createdBy,
      updatedBy: options.createdBy,
      nodes,
      edges,
      viewport,
      inputSchema: null,
      status: 'draft',
    });

    await ctx.adminSql`
      INSERT INTO workflow_versions (
        id,
        workflow_definition_id,
        tenant_id,
        version_number,
        snapshot,
        published_at,
        created_by
      )
      VALUES (
        ${workflowVersionId}::uuid,
        ${workflowDefinitionId}::uuid,
        ${options.tenantId}::uuid,
        1,
        ${ctx.adminSql.json(snapshot)},
        NOW(),
        ${options.createdBy}::uuid
      )
    `;

    await ctx.adminSql`
      UPDATE workflow_definitions
      SET status = 'published'::workflow_status_enum,
          published_version_id = ${workflowVersionId}::uuid,
          updated_by = ${options.createdBy}::uuid,
          updated_at = NOW()
      WHERE id = ${workflowDefinitionId}::uuid
    `;

    return {
      workflowDefinitionId,
      workflowVersionId,
      snapshot,
    };
  }

  async function seedTenantMember(options: {
    organizationId: string;
    tenantId: string;
    prefix: string;
    role?: OrganizationRole;
  }): Promise<AuthenticatedTestUser> {
    if (!ctx) {
      throw new Error('RLS test context not initialized');
    }

    const user = createTestUser(options.prefix);
    const role = options.role ?? 'admin';

    await seedAppUser(ctx.adminSql, user.id, user.email);
    await seedMember(
      ctx.adminSql,
      options.organizationId,
      user.id,
      role,
      user.id,
    );
    await ctx.adminSql`
      UPDATE users
      SET current_organization_id = ${options.organizationId}::uuid
      WHERE id = ${user.id}::uuid
    `;

    return withTenantContext(user, options.tenantId, role);
  }

  async function seedExecution(options: {
    tenantId: string;
    workflowDefinitionId: string;
    workflowVersionId: string;
    createdBy: string;
    snapshot: JSONValue;
    status?: 'pending' | 'running' | 'paused';
  }): Promise<SeededExecution> {
    if (!ctx) {
      throw new Error('RLS test context not initialized');
    }

    const executionId = crypto.randomUUID();
    const status = options.status ?? 'running';

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
        total_steps,
        completed_steps,
        created_by
      )
      VALUES (
        ${executionId}::uuid,
        ${options.workflowDefinitionId}::uuid,
        ${options.workflowVersionId}::uuid,
        ${options.tenantId}::uuid,
        ${status}::execution_status_enum,
        'manual'::execution_trigger_type_enum,
        '{}'::jsonb,
        ${ctx.adminSql.json(options.snapshot)},
        ${status === 'pending' ? null : new Date('2026-03-18T00:00:00.000Z')},
        1,
        0,
        ${options.createdBy}::uuid
      )
    `;

    return {
      executionId,
      workflowDefinitionId: options.workflowDefinitionId,
      workflowVersionId: options.workflowVersionId,
      status,
    };
  }

  async function getAuditEvents(
    tenantId: string,
    eventType: string,
  ): Promise<StoredAuditLog[]> {
    if (!ctx) {
      throw new Error('RLS test context not initialized');
    }

    return ctx.adminSql<StoredAuditLog[]>`
      SELECT
        event_type AS "eventType",
        summary,
        resource_id AS "resourceId",
        metadata
      FROM audit_logs
      WHERE tenant_id = ${tenantId}::uuid
        AND event_type = ${eventType}
      ORDER BY created_at DESC
    `;
  }

  async function getNotifications(
    tenantId: string,
    type: string,
  ): Promise<StoredNotification[]> {
    if (!ctx) {
      throw new Error('RLS test context not initialized');
    }

    return ctx.adminSql<StoredNotification[]>`
      SELECT
        type,
        title,
        body
      FROM notifications
      WHERE tenant_id = ${tenantId}::uuid
        AND type = ${type}::notification_type_enum
      ORDER BY created_at DESC
    `;
  }

  async function countWorkflowExecutions(
    tenantId: string,
    workflowDefinitionId: string,
  ): Promise<number> {
    if (!ctx) {
      throw new Error('RLS test context not initialized');
    }

    const [row] = await ctx.adminSql<{ count: number }[]>`
      SELECT count(*)::int AS count
      FROM workflow_executions
      WHERE tenant_id = ${tenantId}::uuid
        AND workflow_definition_id = ${workflowDefinitionId}::uuid
    `;

    return row?.count ?? 0;
  }

  async function getExecutionStatus(
    executionId: string,
  ): Promise<string | null> {
    if (!ctx) {
      throw new Error('RLS test context not initialized');
    }

    const [row] = await ctx.adminSql<{ status: string }[]>`
      SELECT status
      FROM workflow_executions
      WHERE id = ${executionId}::uuid
      LIMIT 1
    `;

    return row?.status ?? null;
  }

  it('returns the default governance state and persists quota updates with audit and notification', async () => {
    const tenant = await seedTenant('resource-governance-defaults');

    const initialResponse = await request(app!.getHttpServer())
      .get(`/api/v1/organizations/${tenant.organizationId}/resource-governance`)
      .set(tenant.headers);

    expect(initialResponse.status).toBe(200);
    expect(initialResponse.body.data).toMatchObject({
      organizationId: tenant.organizationId,
      quota: {
        organizationId: tenant.organizationId,
        tenantId: tenant.tenantId,
        apiRateLimitPerMinute: 100,
        maxConcurrentExecutions: null,
        dailyExecutionLimit: null,
        dailyApiCallLimit: null,
        storageQuotaMb: null,
        maxSandboxCpuPercent: null,
        maxSandboxMemoryMb: null,
        version: 0,
      },
      governance: {
        organizationId: tenant.organizationId,
        tenantId: tenant.tenantId,
        tenantControl: {
          scope: 'tenant',
          targetId: tenant.tenantId,
          status: 'active',
          reason: null,
        },
        workflowControls: [],
        version: 0,
      },
    });

    const quotaPayload = {
      maxConcurrentExecutions: 2,
      dailyExecutionLimit: 4,
      dailyApiCallLimit: 9,
      storageQuotaMb: 512,
      apiRateLimitPerMinute: 7,
      maxSandboxCpuPercent: 60,
      maxSandboxMemoryMb: 256,
    };

    const updateResponse = await request(app!.getHttpServer())
      .put(
        `/api/v1/organizations/${tenant.organizationId}/resource-governance/quota`,
      )
      .set(tenant.headers)
      .send(quotaPayload);

    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body.data).toMatchObject({
      organizationId: tenant.organizationId,
      tenantId: tenant.tenantId,
      ...quotaPayload,
      version: 1,
      updatedBy: tenant.user.id,
    });

    const auditRows = await waitForCondition(
      () =>
        getAuditEvents(tenant.tenantId, 'resource-governance.quota.updated'),
      (rows) => rows.length === 1,
    );
    expect(auditRows[0]).toMatchObject({
      eventType: 'resource-governance.quota.updated',
      resourceId: tenant.organizationId,
    });

    const notifications = await waitForCondition(
      () =>
        getNotifications(tenant.tenantId, 'resource_governance_quota_updated'),
      (rows) => rows.length === 1,
    );
    expect(notifications[0]).toMatchObject({
      type: 'resource_governance_quota_updated',
    });
    expect(notifications[0].body).toMatchObject({
      organizationId: tenant.organizationId,
      quota: expect.objectContaining(quotaPayload),
    });
  });

  it('shares the tenant minute throttle bucket across identities while isolating other tenants', async () => {
    const tenant = await seedTenant('resource-governance-shared-minute-bucket');
    const siblingMember = await seedTenantMember({
      organizationId: tenant.organizationId,
      tenantId: tenant.tenantId,
      prefix: 'resource-governance-shared-minute-member',
      role: 'admin',
    });
    const otherTenant = await seedTenant(
      'resource-governance-shared-minute-other',
    );

    const quotaPayload = {
      apiRateLimitPerMinute: 1,
    };

    await request(app!.getHttpServer())
      .put(
        `/api/v1/organizations/${tenant.organizationId}/resource-governance/quota`,
      )
      .set(tenant.headers)
      .send(quotaPayload)
      .expect(200);

    await request(app!.getHttpServer())
      .put(
        `/api/v1/organizations/${otherTenant.organizationId}/resource-governance/quota`,
      )
      .set(otherTenant.headers)
      .send(quotaPayload)
      .expect(200);

    throttlerOptions.reset();
    throttlerOptions.storage.increment.mockClear();

    const firstResponse = await request(app!.getHttpServer())
      .get(`/api/v1/organizations/${tenant.organizationId}/resource-governance`)
      .set(tenant.headers);

    expect(firstResponse.status).toBe(200);
    expect(firstResponse.body.data.quota.apiRateLimitPerMinute).toBe(1);
    expect(firstResponse.headers['x-ratelimit-limit']).toBe('1');
    expect(firstResponse.headers['x-ratelimit-remaining']).toBe('0');

    const secondResponse = await request(app!.getHttpServer())
      .get(`/api/v1/organizations/${tenant.organizationId}/resource-governance`)
      .set(authHeaders(siblingMember));

    expect(secondResponse.status).toBe(429);
    expect(secondResponse.body.block).toMatchObject({
      action: 'api_request',
      category: 'api_rate_limit',
      scope: 'api',
      metadata: expect.objectContaining({
        metric: 'apiRateLimitPerMinute',
        limit: 1,
        currentValue: 2,
      }),
    });
    expect(secondResponse.headers['retry-after']).toBeDefined();
    expect(secondResponse.headers['x-ratelimit-limit']).toBe('1');
    expect(secondResponse.headers['x-ratelimit-remaining']).toBe('0');
    expect(secondResponse.headers['x-ratelimit-reset']).toBeDefined();

    const isolatedTenantResponse = await request(app!.getHttpServer())
      .get(
        `/api/v1/organizations/${otherTenant.organizationId}/resource-governance`,
      )
      .set(otherTenant.headers);

    expect(isolatedTenantResponse.status).toBe(200);
  });

  it('pauses a tenant without mutating running executions and blocks new execution starts with audit and notification', async () => {
    const tenant = await seedTenant('resource-governance-tenant-pause');
    const workflow = await seedPublishedWorkflow({
      tenantId: tenant.tenantId,
      createdBy: tenant.user.id,
      prefix: 'tenant-pause',
    });
    const runningExecution = await seedExecution({
      tenantId: tenant.tenantId,
      workflowDefinitionId: workflow.workflowDefinitionId,
      workflowVersionId: workflow.workflowVersionId,
      createdBy: tenant.user.id,
      snapshot: workflow.snapshot,
      status: 'running',
    });

    const controlsResponse = await request(app!.getHttpServer())
      .put(
        `/api/v1/organizations/${tenant.organizationId}/resource-governance/controls`,
      )
      .set(tenant.headers)
      .send({
        tenantControl: {
          status: 'paused',
          reason: 'incident response',
        },
      });

    expect(controlsResponse.status).toBe(200);
    expect(controlsResponse.body.data).toMatchObject({
      organizationId: tenant.organizationId,
      action: 'governance_update',
      scope: 'tenant',
      operator: tenant.user.id,
      reason: 'incident response',
      effectiveState: {
        governance: {
          tenantControl: {
            scope: 'tenant',
            targetId: tenant.tenantId,
            status: 'paused',
            reason: 'incident response',
          },
        },
      },
    });

    expect(await getExecutionStatus(runningExecution.executionId)).toBe(
      'running',
    );

    const blockedResponse = await request(app!.getHttpServer())
      .post(`/api/v1/workflow-definitions/${workflow.workflowDefinitionId}/run`)
      .set(tenant.headers)
      .send({});

    expect(blockedResponse.status).toBe(409);
    expect(blockedResponse.body.block).toMatchObject({
      action: 'execution_start',
      category: 'tenant_pause',
      scope: 'tenant',
      metadata: {
        workflowId: workflow.workflowDefinitionId,
      },
    });
    expect(
      await countWorkflowExecutions(
        tenant.tenantId,
        workflow.workflowDefinitionId,
      ),
    ).toBe(1);

    const blockedAudits = await waitForCondition(
      () =>
        getAuditEvents(
          tenant.tenantId,
          'resource-governance.execution-start.blocked',
        ),
      (rows) => rows.length === 1,
    );
    expect(blockedAudits[0].metadata).toMatchObject({
      block: expect.objectContaining({
        category: 'tenant_pause',
        scope: 'tenant',
      }),
    });

    const blockedNotifications = await waitForCondition(
      () =>
        getNotifications(
          tenant.tenantId,
          'resource_governance_execution_blocked',
        ),
      (rows) => rows.length === 1,
    );
    expect(blockedNotifications[0]).toMatchObject({
      type: 'resource_governance_execution_blocked',
      title: '新执行已被资源治理阻止',
    });
    expect(blockedNotifications[0].body).toMatchObject({
      organizationId: tenant.organizationId,
      workflowId: workflow.workflowDefinitionId,
      reason: 'incident response',
      category: 'tenant_pause',
      scope: 'tenant',
    });
  });

  it('blocks only the paused workflow while allowing sibling workflows to run', async () => {
    const tenant = await seedTenant('resource-governance-workflow-pause');
    const blockedWorkflow = await seedPublishedWorkflow({
      tenantId: tenant.tenantId,
      createdBy: tenant.user.id,
      prefix: 'workflow-blocked',
      name: 'Blocked workflow',
    });
    const allowedWorkflow = await seedPublishedWorkflow({
      tenantId: tenant.tenantId,
      createdBy: tenant.user.id,
      prefix: 'workflow-allowed',
      name: 'Allowed workflow',
    });

    const controlsResponse = await request(app!.getHttpServer())
      .put(
        `/api/v1/organizations/${tenant.organizationId}/resource-governance/controls`,
      )
      .set(tenant.headers)
      .send({
        workflowControls: [
          {
            scope: 'workflow',
            targetId: blockedWorkflow.workflowDefinitionId,
            status: 'paused',
            reason: 'workflow anomaly detected',
          },
        ],
      });

    expect(controlsResponse.status).toBe(200);
    expect(controlsResponse.body.data).toMatchObject({
      action: 'governance_update',
      scope: 'workflow',
      affectedSummary: {
        requested: 1,
        affected: 1,
        skipped: 0,
        workflowTargetIds: [blockedWorkflow.workflowDefinitionId],
      },
    });
    expect(controlsResponse.body.data.effectedAt).toBe(
      controlsResponse.body.data.effectiveState.governance.workflowControls[0]
        .updatedAt,
    );

    const blockedResponse = await request(app!.getHttpServer())
      .post(
        `/api/v1/workflow-definitions/${blockedWorkflow.workflowDefinitionId}/run`,
      )
      .set(tenant.headers)
      .send({});

    expect(blockedResponse.status).toBe(409);
    expect(blockedResponse.body.block).toMatchObject({
      action: 'execution_start',
      category: 'workflow_pause',
      scope: 'workflow',
      metadata: {
        workflowId: blockedWorkflow.workflowDefinitionId,
      },
    });

    const allowedResponse = await request(app!.getHttpServer())
      .post(
        `/api/v1/workflow-definitions/${allowedWorkflow.workflowDefinitionId}/run`,
      )
      .set(tenant.headers)
      .send({});

    expect(allowedResponse.status).toBe(202);
    expect(allowedResponse.body.data).toMatchObject({
      workflowId: allowedWorkflow.workflowDefinitionId,
      status: 'pending',
    });
    expect(
      await countWorkflowExecutions(
        tenant.tenantId,
        blockedWorkflow.workflowDefinitionId,
      ),
    ).toBe(0);
    expect(
      await countWorkflowExecutions(
        tenant.tenantId,
        allowedWorkflow.workflowDefinitionId,
      ),
    ).toBe(1);
  });

  it('terminates anomalous executions with the expected action contract, audit log, and notification', async () => {
    const tenant = await seedTenant('resource-governance-terminate');
    const workflow = await seedPublishedWorkflow({
      tenantId: tenant.tenantId,
      createdBy: tenant.user.id,
      prefix: 'terminate',
    });
    const execution = await seedExecution({
      tenantId: tenant.tenantId,
      workflowDefinitionId: workflow.workflowDefinitionId,
      workflowVersionId: workflow.workflowVersionId,
      createdBy: tenant.user.id,
      snapshot: workflow.snapshot,
      status: 'running',
    });

    const terminateResponse = await request(app!.getHttpServer())
      .post(
        `/api/v1/organizations/${tenant.organizationId}/resource-governance/executions/${execution.executionId}/terminate`,
      )
      .set(tenant.headers)
      .send({ reason: 'detected anomalous execution pattern' });

    expect(terminateResponse.status).toBe(200);
    expect(terminateResponse.body.data).toMatchObject({
      organizationId: tenant.organizationId,
      action: 'execution_termination',
      scope: 'execution',
      operator: tenant.user.id,
      reason: 'detected anomalous execution pattern',
      executionId: execution.executionId,
      workflowId: workflow.workflowDefinitionId,
      execution: {
        id: execution.executionId,
        workflowId: workflow.workflowDefinitionId,
        status: 'cancelled',
        timelineUrl: `/executions/${execution.executionId}`,
      },
      affectedSummary: {
        requested: 1,
        affected: 1,
        skipped: 0,
        executionId: execution.executionId,
        workflowId: workflow.workflowDefinitionId,
        finalStatus: 'cancelled',
        timelineUrl: `/executions/${execution.executionId}`,
      },
      effectiveState: {
        governance: {
          tenantControl: {
            status: 'active',
          },
        },
      },
    });

    expect(await getExecutionStatus(execution.executionId)).toBe('cancelled');

    const auditRows = await waitForCondition(
      () =>
        getAuditEvents(
          tenant.tenantId,
          'resource-governance.execution.terminated',
        ),
      (rows) => rows.length === 1,
    );
    expect(auditRows[0]).toMatchObject({
      eventType: 'resource-governance.execution.terminated',
      resourceId: tenant.organizationId,
    });

    const notifications = await waitForCondition(
      () =>
        getNotifications(
          tenant.tenantId,
          'resource_governance_execution_terminated',
        ),
      (rows) => rows.length === 1,
    );
    expect(notifications[0]).toMatchObject({
      type: 'resource_governance_execution_terminated',
    });
    expect(notifications[0].body).toMatchObject({
      organizationId: tenant.organizationId,
      workflowId: workflow.workflowDefinitionId,
      executionId: execution.executionId,
      reason: 'detected anomalous execution pattern',
    });
  });
});
