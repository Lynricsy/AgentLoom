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
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { getOptionsToken } from '@nestjs/throttler';
import * as crypto from 'node:crypto';
import * as jwt from 'jsonwebtoken';
import request from 'supertest';

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

type StoredAuditLog = {
  eventType: string;
  summary: string;
  resourceId: string;
  metadata: Record<string, unknown> | null;
};

type StoredPrivateDeploymentRow = {
  version: number;
  smtpUseTls: boolean;
  hasSmtpPassword: boolean;
  privateCloudEndpointUrl: string | null;
  privateCloudAuthMethod: 'none' | 'api_key';
  privateCloudAllowExternalEgress: boolean;
  hasLlmApiKey: boolean;
  certificateSource: 'none' | 'uploaded' | 'tls_secret_ref';
  certificateTlsSecretRef: string | null;
  certificateExpiresAt: string | null;
  hasLicenseKey: boolean;
};

let LICENSE_PRIVATE_KEY_PEM = '';
let LICENSE_PUBLIC_KEY_FINGERPRINT = '';
let AppModule: typeof import('../src/app.module').AppModule;

function ensureTestEnvironment(publicKeyPem: string) {
  process.env.APP_PORT = '3097';
  process.env.APP_NODE_ENV = 'test';
  process.env.APP_DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
  process.env.APP_DEPLOYMENT_MODE = 'private';
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
  process.env.APP_PRIVATE_DEPLOYMENT_LICENSE_PUBLIC_KEY = publicKeyPem;
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

function createLicenseKey(
  organizationId: string,
  payloadOverrides: Partial<{
    issuedTo: string;
    expiresAt: string;
  }> = {},
): string {
  const payload = JSON.stringify({
    organizationId,
    issuedTo: 'Acme Private Cluster',
    expiresAt: '2035-12-31T00:00:00.000Z',
    ...payloadOverrides,
  });

  const signature = crypto
    .sign('sha256', Buffer.from(payload), {
      key: LICENSE_PRIVATE_KEY_PEM,
      padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
      saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST,
    })
    .toString('base64');

  return JSON.stringify({ payload, signature });
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

describe('Private Deployment E2E', () => {
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
    const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });

    LICENSE_PRIVATE_KEY_PEM = privateKey;
    const publicKeyDer = crypto.createPublicKey(publicKey).export({
      type: 'spki',
      format: 'der',
    });
    LICENSE_PUBLIC_KEY_FINGERPRINT = crypto
      .createHash('sha256')
      .update(publicKeyDer)
      .digest('hex');

    ensureTestEnvironment(publicKey);
    ({ AppModule } = await import('../src/app.module'));

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

  async function getPrivateDeploymentRow(
    organizationId: string,
  ): Promise<StoredPrivateDeploymentRow | null> {
    if (!ctx) {
      throw new Error('RLS test context not initialized');
    }

    const [row] = await ctx.adminSql<StoredPrivateDeploymentRow[]>`
      SELECT
        version,
        smtp_use_tls AS "smtpUseTls",
        smtp_password_encrypted_key IS NOT NULL AS "hasSmtpPassword",
        private_cloud_endpoint_url AS "privateCloudEndpointUrl",
        private_cloud_auth_method AS "privateCloudAuthMethod",
        private_cloud_allow_external_egress AS "privateCloudAllowExternalEgress",
        private_cloud_api_key_encrypted_key IS NOT NULL AS "hasLlmApiKey",
        certificate_source AS "certificateSource",
        certificate_tls_secret_ref AS "certificateTlsSecretRef",
        certificate_expires_at::text AS "certificateExpiresAt",
        license_key_encrypted_key IS NOT NULL AS "hasLicenseKey"
      FROM private_deployment_settings
      WHERE organization_id = ${organizationId}::uuid
      LIMIT 1
    `;

    return row ?? null;
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

    await testCtx.adminSql.unsafe(
      `ALTER TYPE notification_type_enum ADD VALUE IF NOT EXISTS 'resource_governance_execution_blocked'`,
    );
    await testCtx.adminSql.unsafe(
      `ALTER TYPE notification_type_enum ADD VALUE IF NOT EXISTS 'resource_governance_quota_updated'`,
    );
    await testCtx.adminSql.unsafe(
      `ALTER TYPE notification_type_enum ADD VALUE IF NOT EXISTS 'resource_governance_controls_updated'`,
    );
    await testCtx.adminSql.unsafe(
      `ALTER TYPE notification_type_enum ADD VALUE IF NOT EXISTS 'resource_governance_execution_terminated'`,
    );
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

  it('owner and admin can read default private deployment settings', async () => {
    const owner = await seedTenant('private-deployment-default-owner', 'owner');
    const admin = await seedTenantMember({
      organizationId: owner.organizationId,
      tenantId: owner.tenantId,
      prefix: 'private-deployment-default-admin',
      role: 'admin',
    });

    const ownerResponse = await request(app!.getHttpServer())
      .get(`/api/v1/organizations/${owner.organizationId}/private-deployment`)
      .set(owner.headers);

    const adminResponse = await request(app!.getHttpServer())
      .get(`/api/v1/organizations/${owner.organizationId}/private-deployment`)
      .set(authHeaders(admin));

    for (const response of [ownerResponse, adminResponse]) {
      expect(response.status).toBe(200);
      expect(response.body.data).toEqual({
        organizationId: owner.organizationId,
        tenantId: owner.tenantId,
        deploymentMode: 'private',
        smtp: {
          host: null,
          port: null,
          username: null,
          passwordSecretRef: null,
          fromEmail: null,
          useTls: false,
        },
        llmProxy: {
          mode: 'direct',
          baseUrl: null,
          apiKeySecretRef: null,
          allowExternalEgress: false,
        },
        certificates: {
          source: 'ingress-managed',
          tlsSecretRef: null,
          expiresAt: null,
        },
        license: {
          status: 'missing',
          fingerprint: null,
          expiresAt: null,
          lastVerifiedAt: null,
        },
        version: 0,
      });
    }
  });

  it('owner can update private deployment settings and records an audit trail', async () => {
    const owner = await seedTenant('private-deployment-update-owner', 'owner');
    const licenseExpiresAt = '2035-12-31T00:00:00.000Z';
    const licenseKey = createLicenseKey(owner.organizationId, {
      expiresAt: licenseExpiresAt,
    });

    const response = await request(app!.getHttpServer())
      .put(`/api/v1/organizations/${owner.organizationId}/private-deployment`)
      .set(owner.headers)
      .send({
        smtp: {
          host: 'smtp.internal.local',
          port: 587,
          username: 'mailer',
          password: 'super-secret-smtp-password',
          fromEmail: 'noreply@example.com',
          useTls: true,
        },
        llmProxy: {
          mode: 'enterprise_proxy',
          baseUrl: 'https://proxy.internal.local',
          apiKey: 'super-secret-llm-api-key',
          allowExternalEgress: true,
        },
        certificates: {
          source: 'secretRef',
          tlsSecretRef: 'agentloom/private-deployment-tls',
          expiresAt: '2036-01-15T00:00:00.000Z',
        },
        license: {
          licenseKey,
        },
      });

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      organizationId: owner.organizationId,
      tenantId: owner.tenantId,
      deploymentMode: 'private',
      smtp: {
        host: 'smtp.internal.local',
        port: 587,
        username: 'mailer',
        passwordSecretRef: `private-deployment://organizations/${owner.organizationId}/smtp/password`,
        fromEmail: 'noreply@example.com',
        useTls: true,
      },
      llmProxy: {
        mode: 'enterprise_proxy',
        baseUrl: 'https://proxy.internal.local',
        apiKeySecretRef: `private-deployment://organizations/${owner.organizationId}/llm-proxy/api-key`,
        allowExternalEgress: true,
      },
      certificates: {
        source: 'secretRef',
        tlsSecretRef: 'agentloom/private-deployment-tls',
        expiresAt: '2036-01-15T00:00:00.000Z',
      },
      license: {
        status: 'valid',
        fingerprint: LICENSE_PUBLIC_KEY_FINGERPRINT,
        expiresAt: licenseExpiresAt,
      },
      version: 1,
      createdBy: owner.user.id,
      updatedBy: owner.user.id,
    });
    expect(response.body.data.license.lastVerifiedAt).toEqual(
      expect.any(String),
    );

    const serializedBody = JSON.stringify(response.body);
    expect(serializedBody).not.toContain('super-secret-smtp-password');
    expect(serializedBody).not.toContain('super-secret-llm-api-key');
    expect(serializedBody).not.toContain(licenseKey);

    const row = await getPrivateDeploymentRow(owner.organizationId);
    expect(row).toMatchObject({
      version: 1,
      smtpUseTls: true,
      hasSmtpPassword: true,
      privateCloudEndpointUrl: 'https://proxy.internal.local',
      privateCloudAuthMethod: 'api_key',
      privateCloudAllowExternalEgress: true,
      hasLlmApiKey: true,
      certificateSource: 'tls_secret_ref',
      certificateTlsSecretRef: 'agentloom/private-deployment-tls',
      certificateExpiresAt: '2036-01-15 00:00:00+00',
      hasLicenseKey: true,
    });

    const auditEvents = await waitForCondition(
      () =>
        getAuditEvents(
          owner.tenantId,
          'organization.private-deployment.updated',
        ),
      (events) => events.length === 1,
    );

    expect(auditEvents).toHaveLength(1);
    expect(auditEvents[0]).toMatchObject({
      eventType: 'organization.private-deployment.updated',
      summary: 'Organization private deployment settings updated',
      resourceId: owner.organizationId,
      metadata: {
        deploymentMode: 'private',
        version: 1,
      },
    });
  });

  it('viewer cannot read or update private deployment settings', async () => {
    const owner = await seedTenant('private-deployment-viewer-owner', 'owner');
    const viewer = await seedTenantMember({
      organizationId: owner.organizationId,
      tenantId: owner.tenantId,
      prefix: 'private-deployment-viewer',
      role: 'viewer',
    });

    const getResponse = await request(app!.getHttpServer())
      .get(`/api/v1/organizations/${owner.organizationId}/private-deployment`)
      .set(authHeaders(viewer));

    expect(getResponse.status).toBe(403);
    expect(getResponse.body.type).toBe(
      'https://agentloom.dev/errors/insufficient-permissions',
    );

    const putResponse = await request(app!.getHttpServer())
      .put(`/api/v1/organizations/${owner.organizationId}/private-deployment`)
      .set(authHeaders(viewer))
      .send({
        smtp: {
          host: 'smtp.viewer.local',
          port: 2525,
          username: 'viewer',
          password: 'viewer-should-not-update',
          fromEmail: 'viewer@example.com',
          useTls: true,
        },
      });

    expect(putResponse.status).toBe(403);
    expect(putResponse.body.type).toBe(
      'https://agentloom.dev/errors/insufficient-permissions',
    );

    const row = await getPrivateDeploymentRow(owner.organizationId);
    expect(row).toBeNull();
  });
});
