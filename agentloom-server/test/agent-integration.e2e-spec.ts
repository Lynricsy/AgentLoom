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

describe('Agent Integration E2E', () => {
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

    await cleanupAgentTables(ctx);
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

  async function cleanupAgentTables(testCtx: RlsTestContext) {
    await testCtx.adminSql.unsafe(`
      TRUNCATE TABLE
        agent_messages,
        agent_conversations,
        agent_versions,
        agent_definitions
      RESTART IDENTITY CASCADE
    `);
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

  async function createAndPublishAgent(
    server: ReturnType<NestFastifyApplication['getHttpServer']>,
    headers: Record<string, string>,
    name: string,
  ): Promise<{ agentId: string; publishedVersionId: string }> {
    const createRes = await request(server)
      .post('/api/v1/agent-definitions')
      .set(headers)
      .send({ name, runtimeMode: 'sandbox' });

    expect(createRes.status).toBe(201);
    const agentId: string = createRes.body.data.id;

    await request(server)
      .post(`/api/v1/agent-definitions/${agentId}/versions`)
      .set(headers)
      .send({});

    await request(server)
      .post(`/api/v1/agent-definitions/${agentId}/publish`)
      .set(headers);

    const getRes = await request(server)
      .get(`/api/v1/agent-definitions/${agentId}`)
      .set(headers);

    return {
      agentId,
      publishedVersionId: getRes.body.data.published_version_id,
    };
  }

  describe('Agent Definition CRUD', () => {
    it('should create, read, update, version, publish, and filter by status', async () => {
      const tenant = await seedTenant('agent-crud');
      const server = app!.getHttpServer();

      const createRes = await request(server)
        .post('/api/v1/agent-definitions')
        .set(tenant.headers)
        .send({
          name: 'Test Agent',
          description: 'An E2E test agent definition',
          runtimeMode: 'sandbox',
        });

      expect(createRes.status).toBe(201);
      expect(createRes.body.data).toBeDefined();
      const agentId: string = createRes.body.data.id;
      expect(agentId).toBeTruthy();
      expect(createRes.body.data.name).toBe('Test Agent');
      expect(createRes.body.data.status).toBe('draft');

      const getRes = await request(server)
        .get(`/api/v1/agent-definitions/${agentId}`)
        .set(tenant.headers);

      expect(getRes.status).toBe(200);
      expect(getRes.body.data.id).toBe(agentId);
      expect(getRes.body.data.name).toBe('Test Agent');
      expect(getRes.body.data.description).toBe('An E2E test agent definition');

      const updateRes = await request(server)
        .put(`/api/v1/agent-definitions/${agentId}`)
        .set(tenant.headers)
        .send({
          name: 'Updated Agent',
          description: 'Updated description',
          version: 1,
        });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.data.name).toBe('Updated Agent');

      const versionRes = await request(server)
        .post(`/api/v1/agent-definitions/${agentId}/versions`)
        .set(tenant.headers)
        .send({ changelog: 'Initial version for E2E' });

      expect(versionRes.status).toBe(201);
      expect(versionRes.body.data).toBeDefined();
      expect(versionRes.body.data.version_number).toBeDefined();

      const publishRes = await request(server)
        .post(`/api/v1/agent-definitions/${agentId}/publish`)
        .set(tenant.headers);

      expect(publishRes.status).toBe(200);

      const afterPublishRes = await request(server)
        .get(`/api/v1/agent-definitions/${agentId}`)
        .set(tenant.headers);

      expect(afterPublishRes.status).toBe(200);
      expect(afterPublishRes.body.data.status).toBe('published');
      expect(afterPublishRes.body.data.published_version_id).toBeTruthy();

      const listPublishedRes = await request(server)
        .get('/api/v1/agent-definitions')
        .query({ status: 'published' })
        .set(tenant.headers);

      expect(listPublishedRes.status).toBe(200);
      expect(listPublishedRes.body.data).toBeInstanceOf(Array);
      expect(
        listPublishedRes.body.data.some(
          (a: { id: string }) => a.id === agentId,
        ),
      ).toBe(true);

      const listArchivedRes = await request(server)
        .get('/api/v1/agent-definitions')
        .query({ status: 'archived' })
        .set(tenant.headers);

      expect(listArchivedRes.status).toBe(200);
      expect(listArchivedRes.body.data).toHaveLength(0);
    });
  });

  describe('Agent Conversation', () => {
    it('should create conversation, send message, list conversations, and verify details', async () => {
      const tenant = await seedTenant('agent-conv');
      const server = app!.getHttpServer();

      const { agentId } = await createAndPublishAgent(
        server,
        tenant.headers,
        'Conversation Agent',
      );

      const convRes = await request(server)
        .post(`/api/v1/agent-definitions/${agentId}/conversations`)
        .set(tenant.headers)
        .send({ title: 'E2E Conversation' });

      expect(convRes.status).toBe(201);
      expect(convRes.body.data).toBeDefined();
      const conversationId: string = convRes.body.data.id;
      expect(conversationId).toBeTruthy();
      expect(convRes.body.data.status).toBe('active');

      const msgRes = await request(server)
        .post(`/api/v1/agent-conversations/${conversationId}/messages`)
        .set(tenant.headers)
        .send({ content: 'Hello from E2E test' });

      expect([200, 201, 202]).toContain(msgRes.status);

      const listConvRes = await request(server)
        .get(`/api/v1/agent-definitions/${agentId}/conversations`)
        .set(tenant.headers);

      expect(listConvRes.status).toBe(200);
      expect(listConvRes.body.data).toBeInstanceOf(Array);
      expect(
        listConvRes.body.data.some(
          (c: { id: string }) => c.id === conversationId,
        ),
      ).toBe(true);

      const detailRes = await request(server)
        .get(`/api/v1/agent-conversations/${conversationId}`)
        .set(tenant.headers);

      expect(detailRes.status).toBe(200);
      expect(detailRes.body.data.id).toBe(conversationId);
      expect(detailRes.body.data.title).toBe('E2E Conversation');
    });

    it('should start conversation atomically with the first message', async () => {
      const tenant = await seedTenant('agent-conv-start');
      const server = app!.getHttpServer();

      const { agentId } = await createAndPublishAgent(
        server,
        tenant.headers,
        'Conversation Starter Agent',
      );

      const startRes = await request(server)
        .post(`/api/v1/agent-definitions/${agentId}/conversations/start`)
        .set(tenant.headers)
        .send({ content: 'Hello from atomic start' });

      expect(startRes.status).toBe(201);
      expect(startRes.body.data).toBeDefined();
      const conversationId: string = startRes.body.data.id;
      expect(conversationId).toBeTruthy();

      const detailRes = await request(server)
        .get(`/api/v1/agent-conversations/${conversationId}`)
        .set(tenant.headers);

      expect(detailRes.status).toBe(200);
      expect(detailRes.body.data.id).toBe(conversationId);
      expect(detailRes.body.data.messages.data).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            role: 'user',
            content: 'Hello from atomic start',
          }),
        ]),
      );
    });
  });

  describe('Workflow Agent Node', () => {
    it('should create workflow with agent type node referencing published agent', async () => {
      const tenant = await seedTenant('wf-agent-node');
      const server = app!.getHttpServer();

      const { agentId } = await createAndPublishAgent(
        server,
        tenant.headers,
        'Workflow Bridge Agent',
      );

      const wfCreateRes = await request(server)
        .post('/api/v1/workflow-definitions')
        .set(tenant.headers)
        .send({ name: 'Agent Node Workflow' });

      expect(wfCreateRes.status).toBe(201);
      const workflowId: string = wfCreateRes.body.data.id;
      expect(workflowId).toBeTruthy();

      const agentNodeId = `agent-${crypto.randomUUID().slice(0, 8)}`;
      const nodes = [
        {
          id: agentNodeId,
          type: 'agent',
          position: { x: 100, y: 100 },
          data: {
            label: 'Bridge Agent Node',
            agentDefinitionId: agentId,
            config: {},
          },
        },
      ];
      const edges: unknown[] = [];
      const viewport = { x: 0, y: 0, zoom: 1 };

      const getWfRes = await request(server)
        .get(`/api/v1/workflow-definitions/${workflowId}`)
        .set(tenant.headers);

      expect(getWfRes.status).toBe(200);
      const currentVersion: number = getWfRes.body.data.version;

      const patchRes = await request(server)
        .patch(`/api/v1/workflow-definitions/${workflowId}`)
        .set(tenant.headers)
        .send({
          nodes,
          edges,
          viewport,
          version: currentVersion,
        });

      expect(patchRes.status).toBe(200);

      const verifyRes = await request(server)
        .get(`/api/v1/workflow-definitions/${workflowId}`)
        .set(tenant.headers);

      expect(verifyRes.status).toBe(200);

      const savedNodes = verifyRes.body.data.nodes as Array<{
        id: string;
        type: string;
        data: { agentDefinitionId?: string };
      }>;

      expect(savedNodes).toBeInstanceOf(Array);
      expect(savedNodes.length).toBeGreaterThanOrEqual(1);

      const agentNode = savedNodes.find((n) => n.id === agentNodeId);
      expect(agentNode).toBeDefined();
      expect(agentNode!.type).toBe('agent');
      expect(agentNode!.data.agentDefinitionId).toBe(agentId);
    });
  });
});
