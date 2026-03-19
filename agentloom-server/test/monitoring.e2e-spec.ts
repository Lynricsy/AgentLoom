import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

const { MockRedis } = vi.hoisted(() => {
  class MockRedis {
    status = 'ready'
    options = {}
    call = vi.fn().mockResolvedValue([1, 60_000, 0, 0])
    connect = vi.fn().mockResolvedValue(undefined)
    disconnect = vi.fn().mockResolvedValue(undefined)
    quit = vi.fn().mockResolvedValue('OK')
    on = vi.fn().mockImplementation(() => this)
    once = vi.fn().mockImplementation(() => this)
    off = vi.fn().mockImplementation(() => this)
    removeListener = vi.fn().mockImplementation(() => this)
    setMaxListeners = vi.fn().mockImplementation(() => this)
    defineCommand = vi.fn()
    get = vi.fn().mockResolvedValue(null)
    set = vi.fn().mockResolvedValue('OK')
    del = vi.fn().mockResolvedValue(0)
    keys = vi.fn().mockResolvedValue([])
    publish = vi.fn().mockResolvedValue(1)
    subscribe = vi.fn().mockResolvedValue(undefined)
    unsubscribe = vi.fn().mockResolvedValue(undefined)
    ping = vi.fn().mockResolvedValue('PONG')
    duplicate = vi.fn().mockImplementation(() => new MockRedis())
  }

  return { MockRedis }
})

vi.mock('ioredis', () => ({
  default: MockRedis,
  Cluster: MockRedis,
}))

vi.mock('@anatine/zod-nestjs', async () => {
  const { createZodDto } = await import('nestjs-zod')
  return { createZodDto }
})

import { BullRegistrar, getQueueToken } from '@nestjs/bullmq'
import { getOptionsToken } from '@nestjs/throttler'
import { Test } from '@nestjs/testing'
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify'
import type { JSONValue } from 'postgres'
import * as crypto from 'node:crypto'
import * as jwt from 'jsonwebtoken'
import request from 'supertest'

import { AppModule } from '../src/app.module'
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter'
import { ZodValidationPipe } from '../src/common/pipes/zod-validation.pipe'
import { RedisCacheService } from '../src/common/redis/redis-cache.service'
import { REDIS_CLIENT } from '../src/common/redis/redis.constants'
import { RedisPubSubService } from '../src/common/redis/redis-pubsub.service'
import { DRIZZLE, type DrizzleDB } from '../src/database/database.module'
import { SupabaseService } from '../src/modules/auth/supabase/supabase.service'
import { NodeSchedulerService } from '../src/modules/execution/node-scheduler.service'
import {
  createRlsTestContext,
  seedAppUser,
  seedMember,
  seedOrg,
  seedWorkflowDefinition,
  type OrganizationRole,
  type RlsTestContext,
} from './rls/rls-test-utils'

const JWT_SECRET = 'test-e2e-jwt-secret'

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
] as const

type TestUser = {
  id: string
  email: string
}

type AuthenticatedTestUser = TestUser & {
  tenantId?: string
  tenantRole?: OrganizationRole
}

type SeededTenant = {
  user: TestUser
  tenantId: string
  organizationId: string
  headers: Record<string, string>
}

type SeededWorkflow = {
  workflowDefinitionId: string
  workflowVersionId: string
  snapshot: JSONValue
}

type SeededExecution = {
  executionId: string
  workflowDefinitionId: string
  workflowVersionId: string
  status: string
}

function ensureTestEnvironment() {
  process.env.APP_PORT = '3098'
  process.env.APP_NODE_ENV = 'test'
  process.env.APP_DATABASE_URL = 'postgresql://test:test@localhost:5432/test'
  process.env.APP_SUPABASE_URL = 'https://test.supabase.co'
  process.env.APP_SUPABASE_ANON_KEY = 'test-anon-key'
  process.env.APP_SUPABASE_SERVICE_KEY = 'test-service-key'
  process.env.APP_JWT_SECRET = JWT_SECRET
  process.env.APP_REDIS_URL = 'redis://127.0.0.1:6379'
  process.env.APP_OAUTH_REDIRECT_URL =
    'https://test.supabase.co/auth/v1/callback'
  process.env.APP_FRONTEND_URL = 'http://localhost:3000'
  process.env.APP_MASTER_ENCRYPTION_KEY =
    '3HiqJr2j48+6csTN+/yp+9FDJeiBpILxtxgYy/w/uFQ='
  process.env.APP_MINIO_ENDPOINT = 'localhost'
  process.env.APP_MINIO_PORT = '9000'
  process.env.APP_MINIO_ACCESS_KEY = 'test-access-key'
  process.env.APP_MINIO_SECRET_KEY = 'test-secret-key'
  process.env.APP_MINIO_USE_SSL = 'false'
  process.env.APP_MINIO_BUCKET = 'agentloom-documents'
  process.env.APP_QDRANT_URL = 'http://localhost:6333'
}

function signToken(payload: Record<string, unknown>) {
  return jwt.sign(payload, JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: '1h',
  })
}

function authHeaders(user: AuthenticatedTestUser) {
  const claims: Record<string, unknown> = {
    sub: user.id,
    email: user.email,
    aud: 'authenticated',
    jti: crypto.randomUUID(),
  }

  if (user.tenantId) {
    claims.tenant_id = user.tenantId
  }

  if (user.tenantRole) {
    claims.tenant_role = user.tenantRole
  }

  return {
    authorization: `Bearer ${signToken(claims)}`,
  }
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
  }
}

function createTestUser(prefix: string): TestUser {
  const suffix = crypto.randomUUID().slice(0, 8)

  return {
    id: crypto.randomUUID(),
    email: `${prefix}-${suffix}@example.com`,
  }
}

function createMockSupabaseService() {
  return {
    signUp: vi.fn(),
    signIn: vi.fn(),
    refreshToken: vi.fn(),
    signOut: vi.fn(),
    getUser: vi.fn(),
  }
}

function createMockRedisClient() {
  const subscriber = {
    connect: vi.fn().mockResolvedValue(undefined),
    subscribe: vi.fn().mockResolvedValue(undefined),
    unsubscribe: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
    quit: vi.fn().mockResolvedValue('OK'),
  }

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
  }
}

function createMockRedisCacheService() {
  return {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
    del: vi.fn().mockResolvedValue(undefined),
    delByPattern: vi.fn().mockResolvedValue(undefined),
    onModuleDestroy: vi.fn().mockResolvedValue(undefined),
  }
}

function createMockRedisPubSubService() {
  return {
    publish: vi.fn().mockResolvedValue(undefined),
    subscribe: vi.fn().mockResolvedValue(undefined),
    unsubscribe: vi.fn().mockResolvedValue(undefined),
    onModuleInit: vi.fn().mockResolvedValue(undefined),
    onModuleDestroy: vi.fn().mockResolvedValue(undefined),
  }
}

function createMockNodeSchedulerService() {
  return {
    startExecution: vi.fn(),
    resolveIntervention: vi.fn(),
    resolveToolPermission: vi.fn(),
    resumeScheduling: vi.fn(),
    enqueueInterventionTimeout: vi.fn(),
    removeInterventionTimeout: vi.fn(),
  }
}

function createMockQueue() {
  return {
    add: vi.fn().mockResolvedValue(undefined),
    upsertJobScheduler: vi.fn().mockResolvedValue(undefined),
    removeRepeatableByKey: vi.fn().mockResolvedValue(undefined),
    getRepeatableJobs: vi.fn().mockResolvedValue([]),
    getJob: vi.fn().mockResolvedValue(null),
    getJobs: vi.fn().mockResolvedValue([]),
    close: vi.fn().mockResolvedValue(undefined),
    on: vi.fn().mockImplementation(() => undefined),
    off: vi.fn().mockImplementation(() => undefined),
  }
}

function createMockBullRegistrar() {
  return {
    onModuleInit: vi.fn(),
    register: vi.fn(),
  }
}

function createMockThrottlerOptions() {
  const buckets = new Map<
    string,
    {
      hits: number
      expiresAt: number
      blockedUntil: number
    }
  >()

  return {
    throttlers: [{ name: 'default', ttl: 60_000, limit: 100 }],
    storage: {
      increment: vi.fn().mockImplementation(
        async (
          key: string,
          ttl: number,
          limit: number,
          blockDuration: number,
        ) => {
          const now = Date.now()
          const existingBucket = buckets.get(key)
          const bucket =
            existingBucket && existingBucket.expiresAt > now
              ? existingBucket
              : {
                  hits: 0,
                  expiresAt: now + ttl,
                  blockedUntil: 0,
                }

          if (bucket.blockedUntil > now) {
            buckets.set(key, bucket)

            return {
              totalHits: bucket.hits,
              timeToExpire: Math.max(0, bucket.expiresAt - now),
              isBlocked: true,
              timeToBlockExpire: Math.max(
                1,
                Math.ceil((bucket.blockedUntil - now) / 1_000),
              ),
            }
          }

          bucket.hits += 1
          if (bucket.hits > limit) {
            bucket.blockedUntil = now + blockDuration
          }

          buckets.set(key, bucket)

          return {
            totalHits: bucket.hits,
            timeToExpire: Math.max(0, bucket.expiresAt - now),
            isBlocked: bucket.hits > limit,
            timeToBlockExpire:
              bucket.hits > limit
                ? Math.max(1, Math.ceil((bucket.blockedUntil - now) / 1_000))
                : 0,
          }
        },
      ),
    },
    reset: () => buckets.clear(),
  }
}

describe('Monitoring E2E', () => {
  let ctx: RlsTestContext | undefined
  let app: NestFastifyApplication | undefined
  let drizzleDb: DrizzleDB
  let redisClientMock: ReturnType<typeof createMockRedisClient>
  let redisCacheMock: ReturnType<typeof createMockRedisCacheService>
  let redisPubSubMock: ReturnType<typeof createMockRedisPubSubService>
  let nodeSchedulerMock: ReturnType<typeof createMockNodeSchedulerService>
  let queueMock: ReturnType<typeof createMockQueue>
  let bullRegistrarMock: ReturnType<typeof createMockBullRegistrar>
  let throttlerOptions: ReturnType<typeof createMockThrottlerOptions>

  beforeAll(async () => {
    ensureTestEnvironment()

    ctx = await createRlsTestContext()
    await bootstrapMonitoringSchema(ctx)
    drizzleDb = ctx.db
    redisClientMock = createMockRedisClient()
    redisCacheMock = createMockRedisCacheService()
    redisPubSubMock = createMockRedisPubSubService()
    nodeSchedulerMock = createMockNodeSchedulerService()
    queueMock = createMockQueue()
    bullRegistrarMock = createMockBullRegistrar()
    throttlerOptions = createMockThrottlerOptions()

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
      .useValue(bullRegistrarMock)

    moduleBuilder = moduleBuilder
      .overrideProvider(getOptionsToken())
      .useValue(throttlerOptions)

    for (const queueName of APP_QUEUE_NAMES) {
      moduleBuilder = moduleBuilder
        .overrideProvider(getQueueToken(queueName))
        .useValue(queueMock)
    }

    const moduleRef = await moduleBuilder.compile()

    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    )
    app.setGlobalPrefix('api/v1')
    app.useGlobalFilters(new AllExceptionsFilter())
    app.useGlobalPipes(new ZodValidationPipe())

    await app.init()
    await app.getHttpAdapter().getInstance().ready()
  }, 120_000)

  beforeEach(async () => {
    if (!ctx) {
      throw new Error('RLS test context not initialized')
    }

    await cleanupExtendedTables(ctx)
    await ctx.reset()
    vi.clearAllMocks()

    redisCacheMock.get.mockResolvedValue(null)
    redisCacheMock.set.mockResolvedValue(undefined)
    redisCacheMock.del.mockResolvedValue(undefined)
    redisCacheMock.delByPattern.mockResolvedValue(undefined)

    redisClientMock.get.mockResolvedValue(null)
    redisClientMock.set.mockResolvedValue('OK')
    redisClientMock.del.mockResolvedValue(0)
    redisClientMock.keys.mockResolvedValue([])
    redisClientMock.publish.mockResolvedValue(1)
    redisClientMock.subscribe.mockResolvedValue(undefined)
    redisClientMock.unsubscribe.mockResolvedValue(undefined)
    redisClientMock.connect.mockResolvedValue(undefined)
    redisClientMock.disconnect.mockResolvedValue(undefined)
    redisClientMock.quit.mockResolvedValue('OK')

    redisPubSubMock.publish.mockResolvedValue(undefined)
    redisPubSubMock.subscribe.mockResolvedValue(undefined)
    redisPubSubMock.unsubscribe.mockResolvedValue(undefined)

    queueMock.add.mockResolvedValue(undefined)
    queueMock.getJob.mockResolvedValue(null)
    queueMock.getJobs.mockResolvedValue([])
    throttlerOptions.reset()
  })

  afterAll(async () => {
    await app?.close()
    await ctx?.close()
  }, 30_000)

  async function cleanupExtendedTables(testCtx: RlsTestContext) {
    await testCtx.adminSql.unsafe(`
      TRUNCATE TABLE
        agent_execution_records,
        audit_logs,
        execution_governance_controls,
        notifications,
        notification_preferences,
        workflow_executions,
        workflow_versions,
        tenant_quotas,
        execution_steps
      RESTART IDENTITY CASCADE
    `)
  }

  async function bootstrapMonitoringSchema(testCtx: RlsTestContext) {
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
    `)

    await testCtx.adminSql.unsafe(
      `ALTER TYPE notification_type_enum ADD VALUE IF NOT EXISTS 'resource_governance_execution_blocked'`,
    )
    await testCtx.adminSql.unsafe(
      `ALTER TYPE notification_type_enum ADD VALUE IF NOT EXISTS 'resource_governance_quota_updated'`,
    )
    await testCtx.adminSql.unsafe(
      `ALTER TYPE notification_type_enum ADD VALUE IF NOT EXISTS 'resource_governance_controls_updated'`,
    )
    await testCtx.adminSql.unsafe(
      `ALTER TYPE notification_type_enum ADD VALUE IF NOT EXISTS 'resource_governance_execution_terminated'`,
    )
    await testCtx.adminSql.unsafe(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON notifications TO authenticated',
    )
    await testCtx.adminSql.unsafe(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON notification_preferences TO authenticated',
    )

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
    `)
    await testCtx.adminSql.unsafe(
      'CREATE UNIQUE INDEX IF NOT EXISTS uq_tenant_quotas_org ON tenant_quotas (organization_id)',
    )
    await testCtx.adminSql.unsafe(
      'CREATE INDEX IF NOT EXISTS idx_tenant_quotas_tenant ON tenant_quotas (tenant_id)',
    )
    await testCtx.adminSql.unsafe(
      'ALTER TABLE tenant_quotas ENABLE ROW LEVEL SECURITY',
    )
    await testCtx.adminSql.unsafe(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON tenant_quotas TO authenticated',
    )
    await testCtx.adminSql.unsafe(
      'DROP POLICY IF EXISTS tenant_quotas_select_policy ON tenant_quotas',
    )
    await testCtx.adminSql.unsafe(
      'DROP POLICY IF EXISTS tenant_quotas_insert_policy ON tenant_quotas',
    )
    await testCtx.adminSql.unsafe(
      'DROP POLICY IF EXISTS tenant_quotas_update_policy ON tenant_quotas',
    )
    await testCtx.adminSql.unsafe(
      'DROP POLICY IF EXISTS tenant_quotas_delete_policy ON tenant_quotas',
    )
    await testCtx.adminSql.unsafe(
      'CREATE POLICY tenant_quotas_select_policy ON tenant_quotas AS PERMISSIVE FOR SELECT TO authenticated USING (tenant_id = get_tenant_id())',
    )
    await testCtx.adminSql.unsafe(
      'CREATE POLICY tenant_quotas_insert_policy ON tenant_quotas AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (tenant_id = get_tenant_id())',
    )
    await testCtx.adminSql.unsafe(
      'CREATE POLICY tenant_quotas_update_policy ON tenant_quotas AS PERMISSIVE FOR UPDATE TO authenticated USING (tenant_id = get_tenant_id()) WITH CHECK (tenant_id = get_tenant_id())',
    )
    await testCtx.adminSql.unsafe(
      'CREATE POLICY tenant_quotas_delete_policy ON tenant_quotas AS PERMISSIVE FOR DELETE TO authenticated USING (tenant_id = get_tenant_id())',
    )

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
    `)
    await testCtx.adminSql.unsafe(
      'CREATE UNIQUE INDEX IF NOT EXISTS uq_execution_governance_controls_target ON execution_governance_controls (organization_id, scope, target_id)',
    )
    await testCtx.adminSql.unsafe(
      'CREATE INDEX IF NOT EXISTS idx_execution_governance_controls_tenant ON execution_governance_controls (tenant_id)',
    )
    await testCtx.adminSql.unsafe(
      'CREATE INDEX IF NOT EXISTS idx_execution_governance_controls_scope ON execution_governance_controls (organization_id, scope)',
    )
    await testCtx.adminSql.unsafe(
      'ALTER TABLE execution_governance_controls ENABLE ROW LEVEL SECURITY',
    )
    await testCtx.adminSql.unsafe(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON execution_governance_controls TO authenticated',
    )
    await testCtx.adminSql.unsafe(
      'DROP POLICY IF EXISTS execution_governance_controls_select_policy ON execution_governance_controls',
    )
    await testCtx.adminSql.unsafe(
      'DROP POLICY IF EXISTS execution_governance_controls_insert_policy ON execution_governance_controls',
    )
    await testCtx.adminSql.unsafe(
      'DROP POLICY IF EXISTS execution_governance_controls_update_policy ON execution_governance_controls',
    )
    await testCtx.adminSql.unsafe(
      'DROP POLICY IF EXISTS execution_governance_controls_delete_policy ON execution_governance_controls',
    )
    await testCtx.adminSql.unsafe(
      'CREATE POLICY execution_governance_controls_select_policy ON execution_governance_controls AS PERMISSIVE FOR SELECT TO authenticated USING (tenant_id = get_tenant_id())',
    )
    await testCtx.adminSql.unsafe(
      'CREATE POLICY execution_governance_controls_insert_policy ON execution_governance_controls AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (tenant_id = get_tenant_id())',
    )
    await testCtx.adminSql.unsafe(
      'CREATE POLICY execution_governance_controls_update_policy ON execution_governance_controls AS PERMISSIVE FOR UPDATE TO authenticated USING (tenant_id = get_tenant_id()) WITH CHECK (tenant_id = get_tenant_id())',
    )
    await testCtx.adminSql.unsafe(
      'CREATE POLICY execution_governance_controls_delete_policy ON execution_governance_controls AS PERMISSIVE FOR DELETE TO authenticated USING (tenant_id = get_tenant_id())',
    )
  }

  async function seedTenant(
    prefix: string,
    role: OrganizationRole = 'owner',
  ): Promise<SeededTenant> {
    if (!ctx) {
      throw new Error('RLS test context not initialized')
    }

    const user = createTestUser(prefix)
    const organizationId = crypto.randomUUID()
    const tenantId = organizationId

    await seedAppUser(ctx.adminSql, user.id, user.email)
    await seedOrg(
      ctx.adminSql,
      organizationId,
      `${prefix} org`,
      `${prefix}-${organizationId.slice(0, 8)}`,
      user.id,
      tenantId,
    )
    await seedMember(ctx.adminSql, organizationId, user.id, role, user.id)
    await ctx.adminSql`
      UPDATE users
      SET current_organization_id = ${organizationId}::uuid
      WHERE id = ${user.id}::uuid
    `

    return {
      user,
      tenantId,
      organizationId,
      headers: authHeaders(withTenantContext(user, tenantId, role)),
    }
  }

  async function seedTenantMember(options: {
    organizationId: string
    tenantId: string
    prefix: string
    role?: OrganizationRole
  }): Promise<AuthenticatedTestUser> {
    if (!ctx) {
      throw new Error('RLS test context not initialized')
    }

    const user = createTestUser(options.prefix)
    const role = options.role ?? 'admin'

    await seedAppUser(ctx.adminSql, user.id, user.email)
    await seedMember(
      ctx.adminSql,
      options.organizationId,
      user.id,
      role,
      user.id,
    )
    await ctx.adminSql`
      UPDATE users
      SET current_organization_id = ${options.organizationId}::uuid
      WHERE id = ${user.id}::uuid
    `

    return withTenantContext(user, options.tenantId, role)
  }

  async function seedPublishedWorkflow(options: {
    tenantId: string
    createdBy: string
    prefix: string
    name?: string
  }): Promise<SeededWorkflow> {
    if (!ctx) {
      throw new Error('RLS test context not initialized')
    }

    const workflowDefinitionId = crypto.randomUUID()
    const workflowVersionId = crypto.randomUUID()
    const nodeId = `agent-${crypto.randomUUID().slice(0, 8)}`
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
    ] satisfies JSONValue[]
    const edges: JSONValue[] = []
    const viewport = { x: 0, y: 0, zoom: 1 } satisfies JSONValue
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
    }

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
    })

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
    `

    await ctx.adminSql`
      UPDATE workflow_definitions
      SET status = 'published'::workflow_status_enum,
          published_version_id = ${workflowVersionId}::uuid,
          updated_by = ${options.createdBy}::uuid,
          updated_at = NOW()
      WHERE id = ${workflowDefinitionId}::uuid
    `

    return {
      workflowDefinitionId,
      workflowVersionId,
      snapshot,
    }
  }

  async function seedExecution(options: {
    tenantId: string
    workflowDefinitionId: string
    workflowVersionId: string
    createdBy: string
    snapshot: JSONValue
    status: 'completed' | 'failed' | 'paused'
    createdAt: Date
  }): Promise<SeededExecution> {
    if (!ctx) {
      throw new Error('RLS test context not initialized')
    }

    const executionId = crypto.randomUUID()
    const completedAt =
      options.status === 'completed'
        ? new Date(options.createdAt.getTime() + 60_000)
        : null
    const failedAt =
      options.status === 'failed'
        ? new Date(options.createdAt.getTime() + 90_000)
        : null

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
        failed_at,
        total_steps,
        completed_steps,
        created_by,
        created_at,
        updated_at
      )
      VALUES (
        ${executionId}::uuid,
        ${options.workflowDefinitionId}::uuid,
        ${options.workflowVersionId}::uuid,
        ${options.tenantId}::uuid,
        ${options.status}::execution_status_enum,
        'manual'::execution_trigger_type_enum,
        '{}'::jsonb,
        ${ctx.adminSql.json(options.snapshot)},
        ${options.createdAt},
        ${completedAt},
        ${failedAt},
        1,
        ${options.status === 'completed' ? 1 : 0},
        ${options.createdBy}::uuid,
        ${options.createdAt},
        ${new Date(options.createdAt.getTime() + 120_000)}
      )
    `

    return {
      executionId,
      workflowDefinitionId: options.workflowDefinitionId,
      workflowVersionId: options.workflowVersionId,
      status: options.status,
    }
  }

  async function seedExecutionSummary(options: {
    tenantId: string
    executionId: string
    durationMs: number
  }) {
    if (!ctx) {
      throw new Error('RLS test context not initialized')
    }

    await ctx.adminSql`
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
        ${crypto.randomUUID()}::uuid,
        ${options.tenantId}::uuid,
        ${options.executionId}::uuid,
        NULL,
        NULL,
        'execution_summary',
        NULL,
        ${ctx.adminSql.json({
          totalSteps: 1,
          completedSteps: 1,
          failedSteps: 0,
          totalToolCalls: 1,
          totalErrors: 0,
          totalSelfRepairs: 0,
          totalTokens: 100,
          totalLatencyMs: options.durationMs,
          avgStepLatencyMs: options.durationMs,
          executionDurationMs: options.durationMs,
        })},
        NOW()
      )
    `
  }

  async function seedMonitoringNotification(options: {
    tenantId: string
    userId: string
    type:
      | 'execution_failed'
      | 'resource_governance_execution_blocked'
      | 'resource_governance_execution_terminated'
    title: string
    body: Record<string, unknown>
    createdAt: Date
  }) {
    if (!ctx) {
      throw new Error('RLS test context not initialized')
    }

    await ctx.adminSql`
      INSERT INTO notifications (
        id,
        tenant_id,
        user_id,
        type,
        title,
        body,
        is_read,
        created_at
      )
      VALUES (
        ${crypto.randomUUID()}::uuid,
        ${options.tenantId}::uuid,
        ${options.userId}::uuid,
        ${options.type}::notification_type_enum,
        ${options.title},
        ${ctx.adminSql.json(options.body)},
        false,
        ${options.createdAt}
      )
    `
  }

  async function seedAuditLog(options: {
    tenantId: string
    actorId: string
    eventType: string
    resourceType: string
    resourceId: string
    executionId?: string
    summary: string
    metadata?: Record<string, unknown>
    createdAt: Date
  }) {
    if (!ctx) {
      throw new Error('RLS test context not initialized')
    }

    await ctx.adminSql`
      INSERT INTO audit_logs (
        id,
        tenant_id,
        actor_id,
        actor_type,
        event_type,
        resource_type,
        resource_id,
        execution_id,
        summary,
        before,
        after,
        metadata,
        created_at
      )
      VALUES (
        ${crypto.randomUUID()}::uuid,
        ${options.tenantId}::uuid,
        ${options.actorId}::uuid,
        'user'::audit_actor_type,
        ${options.eventType},
        ${options.resourceType},
        ${options.resourceId},
        ${options.executionId ? `${options.executionId}` : null}::uuid,
        ${options.summary},
        NULL,
        NULL,
        ${ctx.adminSql.json(options.metadata ?? null)},
        ${options.createdAt}
      )
    `
  }

  async function seedWorkflowGovernancePause(options: {
    organizationId: string
    tenantId: string
    workflowId: string
    userId: string
    reason: string
    createdAt: Date
  }) {
    if (!ctx) {
      throw new Error('RLS test context not initialized')
    }

    await ctx.adminSql`
      INSERT INTO execution_governance_controls (
        id,
        organization_id,
        tenant_id,
        scope,
        target_id,
        status,
        reason,
        version,
        created_by,
        updated_by,
        created_at,
        updated_at
      )
      VALUES (
        ${crypto.randomUUID()}::uuid,
        ${options.organizationId}::uuid,
        ${options.tenantId}::uuid,
        'workflow'::governance_scope_enum,
        ${options.workflowId}::uuid,
        'paused'::execution_governance_state_enum,
        ${options.reason},
        1,
        ${options.userId}::uuid,
        ${options.userId}::uuid,
        ${options.createdAt},
        ${options.createdAt}
      )
    `
  }

  it('returns an organization-scoped monitoring dashboard and refreshes the summary when the window changes', async () => {
    const tenant = await seedTenant('monitoring-owner')
    const adminUser = await seedTenantMember({
      organizationId: tenant.organizationId,
      tenantId: tenant.tenantId,
      prefix: 'monitoring-admin',
      role: 'admin',
    })
    const workflowA = await seedPublishedWorkflow({
      tenantId: tenant.tenantId,
      createdBy: tenant.user.id,
      prefix: 'monitoring-a',
      name: '运行工作流 A',
    })
    const workflowB = await seedPublishedWorkflow({
      tenantId: tenant.tenantId,
      createdBy: tenant.user.id,
      prefix: 'monitoring-b',
      name: '运行工作流 B',
    })

    const now = Date.now()
    const recentCompletedAt = new Date(now - 5 * 60_000)
    const recentFailedAt = new Date(now - 8 * 60_000)
    const recentPausedAt = new Date(now - 3 * 60_000)
    const olderCompletedAt = new Date(now - 2 * 60 * 60_000)

    const completedExecution = await seedExecution({
      tenantId: tenant.tenantId,
      workflowDefinitionId: workflowA.workflowDefinitionId,
      workflowVersionId: workflowA.workflowVersionId,
      createdBy: tenant.user.id,
      snapshot: workflowA.snapshot,
      status: 'completed',
      createdAt: recentCompletedAt,
    })
    const failedExecution = await seedExecution({
      tenantId: tenant.tenantId,
      workflowDefinitionId: workflowA.workflowDefinitionId,
      workflowVersionId: workflowA.workflowVersionId,
      createdBy: tenant.user.id,
      snapshot: workflowA.snapshot,
      status: 'failed',
      createdAt: recentFailedAt,
    })
    const pausedExecution = await seedExecution({
      tenantId: tenant.tenantId,
      workflowDefinitionId: workflowB.workflowDefinitionId,
      workflowVersionId: workflowB.workflowVersionId,
      createdBy: tenant.user.id,
      snapshot: workflowB.snapshot,
      status: 'paused',
      createdAt: recentPausedAt,
    })
    await seedExecution({
      tenantId: tenant.tenantId,
      workflowDefinitionId: workflowA.workflowDefinitionId,
      workflowVersionId: workflowA.workflowVersionId,
      createdBy: tenant.user.id,
      snapshot: workflowA.snapshot,
      status: 'completed',
      createdAt: olderCompletedAt,
    })

    await seedExecutionSummary({
      tenantId: tenant.tenantId,
      executionId: completedExecution.executionId,
      durationMs: 40_000,
    })
    await seedExecutionSummary({
      tenantId: tenant.tenantId,
      executionId: failedExecution.executionId,
      durationMs: 80_000,
    })

    await seedWorkflowGovernancePause({
      organizationId: tenant.organizationId,
      tenantId: tenant.tenantId,
      workflowId: workflowB.workflowDefinitionId,
      userId: tenant.user.id,
      reason: 'incident response',
      createdAt: new Date(now - 7 * 60_000),
    })

    await seedMonitoringNotification({
      tenantId: tenant.tenantId,
      userId: adminUser.id,
      type: 'resource_governance_execution_blocked',
      title: '新执行已被资源治理阻止',
      body: {
        organizationId: tenant.organizationId,
        workflowId: workflowB.workflowDefinitionId,
        workflowName: '运行工作流 B',
        reason: 'workflow governance pause is preventing new workflow executions',
        category: 'workflow_pause',
        scope: 'workflow',
        requestedAt: new Date(now - 7 * 60_000).toISOString(),
        resourceGovernanceUrl: '/settings/resource-quotas',
      },
      createdAt: new Date(now - 7 * 60_000),
    })
    await seedMonitoringNotification({
      tenantId: tenant.tenantId,
      userId: adminUser.id,
      type: 'execution_failed',
      title: '执行失败',
      body: {
        workflowId: workflowA.workflowDefinitionId,
        workflowName: '运行工作流 A',
        executionId: failedExecution.executionId,
        timelineUrl: `/executions/${failedExecution.executionId}`,
        errorReason: 'agent tool call failed',
      },
      createdAt: new Date(now - 8 * 60_000),
    })

    await seedAuditLog({
      tenantId: tenant.tenantId,
      actorId: tenant.user.id,
      eventType: 'resource-governance.execution-start.blocked',
      resourceType: 'workflow_execution',
      resourceId: failedExecution.executionId,
      executionId: failedExecution.executionId,
      summary: 'execution blocked by workflow governance pause',
      metadata: {
        workflowId: workflowB.workflowDefinitionId,
      },
      createdAt: new Date(now - 7 * 60_000),
    })

    queueMock.getJobs.mockResolvedValue([
      {
        id: 'tenant-job-1',
        timestamp: new Date(now - 2 * 60_000).getTime(),
        data: {
          tenantId: tenant.tenantId,
          executionId: pausedExecution.executionId,
        },
      },
      {
        id: 'other-job-1',
        timestamp: new Date(now - 2 * 60_000).getTime(),
        data: {
          tenantId: crypto.randomUUID(),
          executionId: crypto.randomUUID(),
        },
      },
    ])

    const headers = authHeaders(adminUser)

    const recentResponse = await request(app!.getHttpServer())
      .get(`/api/v1/organizations/${tenant.organizationId}/monitoring`)
      .query({ window: '15m' })
      .set(headers)

    expect(recentResponse.status).toBe(200)
    expect(recentResponse.body.data.summary).toMatchObject({
      scope: 'organization',
      window: '15m',
      executionCount: 3,
      successRate: 50,
      failureRate: 50,
      averageDurationMs: 60_000,
      queueDepth: 1,
      governanceBlocks: 1,
    })
    expect(recentResponse.body.data.summary.metricSources.execution).toEqual(
      expect.arrayContaining(['workflow-executions', 'execution-records']),
    )
    expect(recentResponse.body.data.alerts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          linkTarget: {
            type: 'resource-governance',
            href: '/settings/resource-quotas',
          },
        }),
        expect.objectContaining({
          linkTarget: {
            type: 'execution',
            href: `/executions/${failedExecution.executionId}`,
          },
        }),
      ]),
    )
    expect(recentResponse.body.data.hotspots).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'workflow',
          label: '运行工作流 B',
          status: 'governance-paused',
        }),
        expect.objectContaining({
          kind: 'execution',
          label: pausedExecution.executionId,
          status: 'paused',
          queueDepth: 1,
        }),
      ]),
    )
    expect(recentResponse.body.data.riskSummary).toMatchObject({
      governancePauseActive: true,
      primaryLinkTarget: {
        type: 'resource-governance',
        href: '/settings/resource-quotas',
      },
    })
    expect(recentResponse.body.data.trend).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          queueDepth: null,
        }),
      ]),
    )

    const dailyResponse = await request(app!.getHttpServer())
      .get(`/api/v1/organizations/${tenant.organizationId}/monitoring`)
      .query({ window: '24h' })
      .set(headers)

    expect(dailyResponse.status).toBe(200)
    expect(dailyResponse.body.data.summary).toMatchObject({
      window: '24h',
      executionCount: 4,
    })
    expect(dailyResponse.body.data.summary.executionCount).toBeGreaterThan(
      recentResponse.body.data.summary.executionCount,
    )
    expect(dailyResponse.body.data.trend).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          queueDepth: null,
        }),
      ]),
    )
  })

  it('rejects creator access to the monitoring dashboard', async () => {
    const tenant = await seedTenant('monitoring-permissions')
    const creatorUser = await seedTenantMember({
      organizationId: tenant.organizationId,
      tenantId: tenant.tenantId,
      prefix: 'monitoring-creator',
      role: 'creator',
    })

    const response = await request(app!.getHttpServer())
      .get(`/api/v1/organizations/${tenant.organizationId}/monitoring`)
      .query({ window: '1h' })
      .set(authHeaders(creatorUser))

    expect(response.status).toBe(403)
  })
})
