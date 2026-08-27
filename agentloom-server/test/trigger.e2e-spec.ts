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
import { RedisCacheService } from '../src/common/redis/redis-cache.service';
import { REDIS_CLIENT } from '../src/common/redis/redis.constants';
import { RedisPubSubService } from '../src/common/redis/redis-pubsub.service';
import { ZodValidationPipe } from '../src/common/pipes/zod-validation.pipe';
import { DRIZZLE, type DrizzleDB } from '../src/database/database.module';
import * as schema from '../src/database/schema';
import { SupabaseService } from '../src/modules/auth/supabase/supabase.service';
import { EXECUTION_QUEUE } from '../src/modules/execution/execution.constants';
import {
  MAX_TRIGGERS_PER_WORKFLOW,
  TRIGGER_QUEUE,
} from '../src/modules/trigger/trigger.constants';
import {
  createRlsTestContext,
  seedAppUser,
  seedMember,
  seedOrg,
  type OrganizationRole,
  type RlsTestContext,
} from './rls/rls-test-utils';

const JWT_SECRET = 'test-e2e-jwt-secret';

const EMPTY_NODES: JSONValue = [];
const EMPTY_EDGES: JSONValue = [];
const DEFAULT_VIEWPORT: JSONValue = { x: 0, y: 0, zoom: 1 };
const DEFAULT_CRON_CONFIG: JSONValue = {
  expression: '0 9 * * 1',
  timezone: 'Asia/Hong_Kong',
};
const DEFAULT_SNAPSHOT: JSONValue = {
  nodes: [],
  edges: [],
  viewport: DEFAULT_VIEWPORT,
  metadata: {
    nodeCount: 0,
    edgeCount: 0,
    createdFromVersion: 1,
  },
};

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

function createMockExecutionQueue() {
  return {
    add: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockTriggerQueue() {
  return {
    add: vi.fn().mockResolvedValue(undefined),
    removeRepeatableByKey: vi.fn().mockResolvedValue(undefined),
    // 保留 legacy repeatable 列表：注册前会清理旧条目，防升级后双触发。
    getRepeatableJobs: vi.fn().mockResolvedValue([]),
    // BullMQ 5 Job Scheduler API —— nextFireAt 现在由它提供，
    // 旧的 getRepeatableJobs 对 metadata-hash 任务返回空 id，永远匹配不上。
    upsertJobScheduler: vi.fn().mockResolvedValue(undefined),
    getJobScheduler: vi.fn().mockResolvedValue(null),
    removeJobScheduler: vi.fn().mockResolvedValue(true),
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

describe('Trigger E2E', () => {
  let ctx: RlsTestContext;
  let app: NestFastifyApplication;
  let drizzleDb: DrizzleDB;
  let redisClientMock: ReturnType<typeof createMockRedisClient>;
  let redisCacheMock: ReturnType<typeof createMockRedisCacheService>;
  let redisPubSubMock: ReturnType<typeof createMockRedisPubSubService>;
  let executionQueueMock: ReturnType<typeof createMockExecutionQueue>;
  let triggerQueueMock: ReturnType<typeof createMockTriggerQueue>;

  beforeAll(async () => {
    process.env.APP_JWT_SECRET = JWT_SECRET;

    ctx = await createRlsTestContext();
    drizzleDb = ctx.db;
    redisClientMock = createMockRedisClient();
    redisCacheMock = createMockRedisCacheService();
    redisPubSubMock = createMockRedisPubSubService();
    executionQueueMock = createMockExecutionQueue();
    triggerQueueMock = createMockTriggerQueue();

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
      { rawBody: true },
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

    const triggerQueue = app.get<Record<string, unknown>>(
      getQueueToken(TRIGGER_QUEUE),
    );
    Reflect.set(triggerQueue, 'add', triggerQueueMock.add);
    Reflect.set(
      triggerQueue,
      'removeRepeatableByKey',
      triggerQueueMock.removeRepeatableByKey,
    );
    Reflect.set(
      triggerQueue,
      'getRepeatableJobs',
      triggerQueueMock.getRepeatableJobs,
    );
    Reflect.set(
      triggerQueue,
      'upsertJobScheduler',
      triggerQueueMock.upsertJobScheduler,
    );
    Reflect.set(
      triggerQueue,
      'getJobScheduler',
      triggerQueueMock.getJobScheduler,
    );
    Reflect.set(
      triggerQueue,
      'removeJobScheduler',
      triggerQueueMock.removeJobScheduler,
    );
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
    triggerQueueMock.add.mockResolvedValue(undefined);
    triggerQueueMock.removeRepeatableByKey.mockResolvedValue(undefined);
    triggerQueueMock.getRepeatableJobs.mockResolvedValue([]);
    triggerQueueMock.upsertJobScheduler.mockResolvedValue(undefined);
    triggerQueueMock.getJobScheduler.mockResolvedValue(null);
    triggerQueueMock.removeJobScheduler.mockResolvedValue(true);
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

  async function seedTenantMember(options: {
    prefix: string;
    tenantId: string;
    organizationId: string;
    invitedBy: string;
    role: OrganizationRole;
  }) {
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

  async function seedWorkflow(options: {
    tenantId: string;
    createdBy: string;
    status: 'draft' | 'published';
    name?: string;
  }) {
    const workflowId = crypto.randomUUID();

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
        version,
        created_by,
        updated_by
      ) VALUES (
        ${workflowId}::uuid,
        ${options.tenantId}::uuid,
        ${options.name ?? 'Test Workflow'},
        ${`test-workflow-${crypto.randomUUID().slice(0, 8)}`},
        ${options.status}::workflow_status_enum,
        ${ctx.adminSql.json(EMPTY_NODES)},
        ${ctx.adminSql.json(EMPTY_EDGES)},
        ${ctx.adminSql.json(DEFAULT_VIEWPORT)},
        1,
        ${options.createdBy}::uuid,
        ${options.createdBy}::uuid
      )
    `;

    return workflowId;
  }

  async function seedPublishedWorkflow(options: {
    tenantId: string;
    organizationId: string;
    createdBy: string;
  }) {
    return seedWorkflow({
      tenantId: options.tenantId,
      createdBy: options.createdBy,
      status: 'published',
    });
  }

  async function seedExecutableWorkflow(options: {
    tenantId: string;
    organizationId: string;
    createdBy: string;
  }) {
    const workflowId = await seedPublishedWorkflow(options);
    const versionId = crypto.randomUUID();

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
        ${options.tenantId}::uuid,
        1,
        ${'v1'},
        ${ctx.adminSql.json(DEFAULT_SNAPSHOT)},
        ${new Date()},
        ${options.createdBy}::uuid
      )
    `;

    await ctx.adminSql`
      UPDATE workflow_definitions
      SET published_version_id = ${versionId}::uuid
      WHERE id = ${workflowId}::uuid
    `;

    return {
      workflowId,
      versionId,
    };
  }

  async function seedDraftWorkflow(options: {
    tenantId: string;
    organizationId: string;
    createdBy: string;
  }) {
    return seedWorkflow({
      tenantId: options.tenantId,
      createdBy: options.createdBy,
      status: 'draft',
    });
  }

  async function seedTrigger(options: {
    workflowId: string;
    tenantId: string;
    createdBy: string;
    name?: string;
    description?: string | null;
    type?: 'cron' | 'webhook' | 'api_event';
    config?: JSONValue;
    isEnabled?: boolean;
  }) {
    const triggerId = crypto.randomUUID();
    const type = options.type ?? 'cron';
    const config =
      options.config ??
      (type === 'cron'
        ? DEFAULT_CRON_CONFIG
        : type === 'webhook'
          ? {
              token: crypto.randomUUID().replaceAll('-', ''),
              secret:
                crypto.randomUUID().replaceAll('-', '') +
                crypto.randomUUID().replaceAll('-', ''),
              ipWhitelist: [],
            }
          : {
              eventSource: 'github',
              eventType: 'pull_request',
              filterExpression: 'payload.action == "opened"',
            });

    const [row] = await ctx.adminSql`
      INSERT INTO workflow_triggers (
        id,
        workflow_definition_id,
        tenant_id,
        name,
        description,
        type,
        config,
        is_enabled,
        created_by
      ) VALUES (
        ${triggerId}::uuid,
        ${options.workflowId}::uuid,
        ${options.tenantId}::uuid,
        ${options.name ?? 'Seeded Trigger'},
        ${options.description ?? null},
        ${type}::trigger_type_enum,
        ${ctx.adminSql.json(config)},
        ${options.isEnabled ?? true},
        ${options.createdBy}::uuid
      )
      RETURNING *
    `;

    return row;
  }

  async function seedTriggerHistory(options: {
    triggerId: string;
    tenantId: string;
    count: number;
  }) {
    for (let index = 0; index < options.count; index++) {
      await ctx.adminSql`
        INSERT INTO workflow_trigger_history (
          id,
          trigger_id,
          tenant_id,
          status,
          triggered_at
        ) VALUES (
          ${crypto.randomUUID()}::uuid,
          ${options.triggerId}::uuid,
          ${options.tenantId}::uuid,
          'success',
          ${new Date(Date.now() - index * 60_000)}
        )
      `;
    }
  }

  it('应当完成 create → list → get → update → delete 的完整 CRUD 生命周期', async () => {
    const owner = await seedTenant('trigger-crud-owner');
    const workflowId = await seedPublishedWorkflow({
      tenantId: owner.tenantId,
      organizationId: owner.organizationId,
      createdBy: owner.user.id,
    });

    const createResponse = await request(app.getHttpServer())
      .post(`/api/v1/workflow-definitions/${workflowId}/triggers`)
      .set(owner.headers)
      .send({
        name: 'Test Cron',
        type: 'cron',
        config: {
          expression: '0 9 * * 1',
          timezone: 'Asia/Hong_Kong',
        },
        isEnabled: true,
      });

    expect(createResponse.status).toBe(201);
    expect(createResponse.body.data).toMatchObject({
      workflowDefinitionId: workflowId,
      name: 'Test Cron',
      type: 'cron',
      isEnabled: true,
      config: {
        expression: '0 9 * * 1',
        timezone: 'Asia/Hong_Kong',
      },
    });

    const triggerId = createResponse.body.data.id as string;

    const listResponse = await request(app.getHttpServer())
      .get(`/api/v1/workflow-definitions/${workflowId}/triggers?type=cron`)
      .set(owner.headers);

    expect(listResponse.status).toBe(200);
    expect(listResponse.body.data).toHaveLength(1);
    expect(listResponse.body.data[0]).toMatchObject({
      id: triggerId,
      workflowDefinitionId: workflowId,
      type: 'cron',
    });

    const getResponse = await request(app.getHttpServer())
      .get(`/api/v1/workflow-definitions/${workflowId}/triggers/${triggerId}`)
      .set(owner.headers);

    expect(getResponse.status).toBe(200);
    expect(getResponse.body.data).toMatchObject({
      id: triggerId,
      workflowDefinitionId: workflowId,
      name: 'Test Cron',
      type: 'cron',
    });

    const updateResponse = await request(app.getHttpServer())
      .patch(`/api/v1/workflow-definitions/${workflowId}/triggers/${triggerId}`)
      .set(owner.headers)
      .send({
        name: 'Updated Name',
        description: 'New description',
      });

    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body.data).toMatchObject({
      id: triggerId,
      name: 'Updated Name',
      description: 'New description',
    });

    const deleteResponse = await request(app.getHttpServer())
      .delete(
        `/api/v1/workflow-definitions/${workflowId}/triggers/${triggerId}`,
      )
      .set(owner.headers);

    expect(deleteResponse.status).toBe(204);

    const [storedAfterDelete] = await drizzleDb
      .select()
      .from(schema.workflowTriggers)
      .where(eq(schema.workflowTriggers.id, triggerId));

    expect(storedAfterDelete).toBeUndefined();
  });

  it('应当完成 webhook 触发器创建并返回 token/secret', async () => {
    const owner = await seedTenant('trigger-webhook-owner');
    const workflowId = await seedPublishedWorkflow({
      tenantId: owner.tenantId,
      organizationId: owner.organizationId,
      createdBy: owner.user.id,
    });

    const createResponse = await request(app.getHttpServer())
      .post(`/api/v1/workflow-definitions/${workflowId}/triggers`)
      .set(owner.headers)
      .send({
        name: 'Test Webhook',
        type: 'webhook',
        config: { ipWhitelist: [] },
        isEnabled: true,
      });

    expect(createResponse.status).toBe(201);
    expect(createResponse.body.data.type).toBe('webhook');
    expect(createResponse.body.data.config.ipWhitelist).toEqual([]);
    expect(createResponse.body.data.config.token).toEqual(expect.any(String));
    expect(createResponse.body.data.config.secret).toEqual(expect.any(String));
    expect(createResponse.body.data.config.token.length).toBeGreaterThan(0);
    expect(createResponse.body.data.config.secret.length).toBeGreaterThan(0);

    const triggerId = createResponse.body.data.id as string;
    const getResponse = await request(app.getHttpServer())
      .get(`/api/v1/workflow-definitions/${workflowId}/triggers/${triggerId}`)
      .set(owner.headers);

    expect(getResponse.status).toBe(200);
    expect(getResponse.body.data.config).toMatchObject({
      token: createResponse.body.data.config.token,
      ipWhitelist: [],
    });
    expect(getResponse.body.data.config).not.toHaveProperty('secret');

    const listResponse = await request(app.getHttpServer())
      .get(`/api/v1/workflow-definitions/${workflowId}/triggers?type=webhook`)
      .set(owner.headers);

    expect(listResponse.status).toBe(200);
    expect(listResponse.body.data[0].config).not.toHaveProperty('secret');
  });

  it('应允许创建 API Event 触发器并持久化事件配置', async () => {
    const owner = await seedTenant('trigger-api-event-owner');
    const workflowId = await seedPublishedWorkflow({
      tenantId: owner.tenantId,
      organizationId: owner.organizationId,
      createdBy: owner.user.id,
    });

    const response = await request(app.getHttpServer())
      .post(`/api/v1/workflow-definitions/${workflowId}/triggers`)
      .set(owner.headers)
      .send({
        name: 'GitHub Pull Request Trigger',
        type: 'api_event',
        config: {
          eventSource: 'github',
          eventType: 'pull_request',
          filterExpression: 'payload.action == "opened"',
        },
        isEnabled: true,
      });

    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({
      workflowDefinitionId: workflowId,
      name: 'GitHub Pull Request Trigger',
      type: 'api_event',
      isEnabled: true,
      config: {
        eventSource: 'github',
        eventType: 'pull_request',
        filterExpression: 'payload.action == "opened"',
      },
    });

    const rows = await drizzleDb
      .select()
      .from(schema.workflowTriggers)
      .where(eq(schema.workflowTriggers.workflowDefinitionId, workflowId));

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      type: 'api_event',
      name: 'GitHub Pull Request Trigger',
      isEnabled: true,
      config: {
        eventSource: 'github',
        eventType: 'pull_request',
        filterExpression: 'payload.action == "opened"',
      },
    });
  });

  it('应允许修改和启停 API Event 触发器', async () => {
    const owner = await seedTenant('trigger-api-event-edit-owner');
    const workflowId = await seedPublishedWorkflow({
      tenantId: owner.tenantId,
      organizationId: owner.organizationId,
      createdBy: owner.user.id,
    });
    const trigger = await seedTrigger({
      workflowId,
      tenantId: owner.tenantId,
      createdBy: owner.user.id,
      type: 'api_event',
    });

    const updateResponse = await request(app.getHttpServer())
      .patch(
        `/api/v1/workflow-definitions/${workflowId}/triggers/${trigger.id}`,
      )
      .set(owner.headers)
      .send({
        name: 'Updated API Event Trigger',
        config: {
          eventSource: 'github',
          eventType: 'issues',
          filterExpression: 'payload.action == "opened"',
        },
      });

    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body.data).toMatchObject({
      id: trigger.id,
      name: 'Updated API Event Trigger',
      type: 'api_event',
      config: {
        eventSource: 'github',
        eventType: 'issues',
        filterExpression: 'payload.action == "opened"',
      },
    });

    const toggleResponse = await request(app.getHttpServer())
      .patch(
        `/api/v1/workflow-definitions/${workflowId}/triggers/${trigger.id}/toggle`,
      )
      .set(owner.headers)
      .send();

    expect(toggleResponse.status).toBe(200);
    expect(toggleResponse.body.data.isEnabled).toBe(false);

    const [storedTrigger] = await drizzleDb
      .select()
      .from(schema.workflowTriggers)
      .where(eq(schema.workflowTriggers.id, trigger.id));

    expect(storedTrigger?.name).toBe('Updated API Event Trigger');
    expect(storedTrigger?.isEnabled).toBe(false);
    expect(storedTrigger?.config).toMatchObject({
      eventSource: 'github',
      eventType: 'issues',
      filterExpression: 'payload.action == "opened"',
    });
  });

  it('应当在 cron 启停时持久化并清空 nextFireAt', async () => {
    const owner = await seedTenant('trigger-toggle-owner');
    const workflowId = await seedPublishedWorkflow({
      tenantId: owner.tenantId,
      organizationId: owner.organizationId,
      createdBy: owner.user.id,
    });
    const nextFireAt = new Date('2025-01-06T01:00:00.000Z');
    let registeredSchedulerId: string | null = null;

    // 注册走 upsertJobScheduler，scheduler id 就是 trigger id（稳定主键）。
    triggerQueueMock.upsertJobScheduler.mockImplementation(
      async (schedulerId: string) => {
        registeredSchedulerId = schedulerId;
        return undefined;
      },
    );
    triggerQueueMock.removeJobScheduler.mockImplementation(async () => {
      registeredSchedulerId = null;
      return true;
    });
    // nextFireAt 现在从 Job Scheduler 元数据的 next 读出，
    // 不再依赖 legacy repeatable 列表里那个可能为空的 id。
    triggerQueueMock.getJobScheduler.mockImplementation(
      async (schedulerId: string) => {
        if (!registeredSchedulerId || schedulerId !== registeredSchedulerId) {
          return null;
        }

        return {
          key: schedulerId,
          name: 'trigger-cron-execution',
          tz: 'Asia/Hong_Kong',
          pattern: '0 9 * * 1',
          next: nextFireAt.getTime(),
        };
      },
    );

    const createResponse = await request(app.getHttpServer())
      .post(`/api/v1/workflow-definitions/${workflowId}/triggers`)
      .set(owner.headers)
      .send({
        name: 'Toggle Trigger',
        type: 'cron',
        config: {
          expression: '0 9 * * 1',
          timezone: 'Asia/Hong_Kong',
        },
        isEnabled: true,
      });

    expect(createResponse.status).toBe(201);
    expect(createResponse.body.data.nextFireAt).toBe(nextFireAt.toISOString());
    const triggerId = createResponse.body.data.id as string;

    const disableResponse = await request(app.getHttpServer())
      .patch(
        `/api/v1/workflow-definitions/${workflowId}/triggers/${triggerId}/toggle`,
      )
      .set(owner.headers)
      .send();

    expect(disableResponse.status).toBe(200);
    expect(disableResponse.body.data.isEnabled).toBe(false);
    expect(disableResponse.body.data.nextFireAt).toBeNull();

    const [storedAfterDisable] = await drizzleDb
      .select()
      .from(schema.workflowTriggers)
      .where(eq(schema.workflowTriggers.id, triggerId));

    expect(storedAfterDisable?.nextFireAt).toBeNull();

    const enableResponse = await request(app.getHttpServer())
      .patch(
        `/api/v1/workflow-definitions/${workflowId}/triggers/${triggerId}/toggle`,
      )
      .set(owner.headers)
      .send();

    expect(enableResponse.status).toBe(200);
    expect(enableResponse.body.data.isEnabled).toBe(true);
    expect(enableResponse.body.data.nextFireAt).toBe(nextFireAt.toISOString());

    const [storedTrigger] = await drizzleDb
      .select()
      .from(schema.workflowTriggers)
      .where(eq(schema.workflowTriggers.id, triggerId));

    expect(storedTrigger?.isEnabled).toBe(true);
    expect(storedTrigger?.nextFireAt?.toISOString()).toBe(
      nextFireAt.toISOString(),
    );
  });

  it('公开 webhook 成功时应返回 accepted 并以 webhook 元数据创建 execution', async () => {
    const owner = await seedTenant('trigger-public-webhook-success');
    const { workflowId } = await seedExecutableWorkflow({
      tenantId: owner.tenantId,
      organizationId: owner.organizationId,
      createdBy: owner.user.id,
    });

    const createResponse = await request(app.getHttpServer())
      .post(`/api/v1/workflow-definitions/${workflowId}/triggers`)
      .set(owner.headers)
      .send({
        name: 'Public Webhook',
        type: 'webhook',
        config: {
          authMode: 'signed',
          ipWhitelist: [],
        },
        isEnabled: true,
      });

    const token = createResponse.body.data.config.token as string;
    const secret = createResponse.body.data.config.secret as string;
    const triggerId = createResponse.body.data.id as string;
    const payload = {
      hello: 'world',
      nested: { enabled: true },
    };
    const rawBody = JSON.stringify(payload);
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = crypto
      .createHmac('sha256', secret)
      .update(`${timestamp}.${rawBody}`)
      .digest('hex');

    const response = await request(app.getHttpServer())
      .post(`/api/v1/webhooks/${token}`)
      .set('content-type', 'application/json')
      .set('x-agentloom-signature', signature)
      .set('x-agentloom-timestamp', timestamp)
      .send(rawBody);

    expect(response.status).toBe(202);
    expect(response.body).toMatchObject({
      executionId: expect.any(String),
      status: 'accepted',
    });
    expect(executionQueueMock.add).toHaveBeenCalledWith(
      'execute',
      {
        executionId: response.body.executionId,
        tenantId: owner.tenantId,
      },
      {
        jobId: response.body.executionId,
      },
    );

    const [storedExecution] = await drizzleDb
      .select()
      .from(schema.workflowExecutions)
      .where(eq(schema.workflowExecutions.id, response.body.executionId));

    expect(storedExecution).toMatchObject({
      workflowDefinitionId: workflowId,
      tenantId: owner.tenantId,
      triggerType: 'webhook',
      inputParams: {
        ...payload,
        _meta: {
          launchSource: 'webhook-trigger',
        },
      },
    });

    const historyRows = await drizzleDb
      .select()
      .from(schema.workflowTriggerHistory)
      .where(eq(schema.workflowTriggerHistory.triggerId, triggerId));

    expect(historyRows).toHaveLength(1);
    expect(historyRows[0]?.status).toBe('success');
  });

  it('公开 webhook 验签失败时应返回精确 401 JSON 并记录 signature_failed', async () => {
    const owner = await seedTenant('trigger-public-webhook-signature-failed');
    const workflowId = await seedPublishedWorkflow({
      tenantId: owner.tenantId,
      organizationId: owner.organizationId,
      createdBy: owner.user.id,
    });

    const createResponse = await request(app.getHttpServer())
      .post(`/api/v1/workflow-definitions/${workflowId}/triggers`)
      .set(owner.headers)
      .send({
        name: 'Bad Signature Webhook',
        type: 'webhook',
        config: {
          authMode: 'signed',
          ipWhitelist: [],
        },
        isEnabled: true,
      });

    const token = createResponse.body.data.config.token as string;
    const triggerId = createResponse.body.data.id as string;
    const rawBody = JSON.stringify({ hello: 'world' });
    const timestamp = Math.floor(Date.now() / 1000).toString();

    const response = await request(app.getHttpServer())
      .post(`/api/v1/webhooks/${token}`)
      .set('content-type', 'application/json')
      .set('x-agentloom-signature', 'invalid-signature')
      .set('x-agentloom-timestamp', timestamp)
      .send(rawBody);

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      error: 'INVALID_SIGNATURE',
      message: 'Webhook signature verification failed',
    });

    const historyRows = await drizzleDb
      .select()
      .from(schema.workflowTriggerHistory)
      .where(eq(schema.workflowTriggerHistory.triggerId, triggerId));

    expect(historyRows).toHaveLength(1);
    expect(historyRows[0]?.status).toBe('signature_failed');
  });

  it('公开 webhook 在禁用时应返回 404', async () => {
    const owner = await seedTenant('trigger-public-webhook-disabled');
    const workflowId = await seedPublishedWorkflow({
      tenantId: owner.tenantId,
      organizationId: owner.organizationId,
      createdBy: owner.user.id,
    });

    const createResponse = await request(app.getHttpServer())
      .post(`/api/v1/workflow-definitions/${workflowId}/triggers`)
      .set(owner.headers)
      .send({
        name: 'Disabled Webhook',
        type: 'webhook',
        config: { ipWhitelist: [] },
        isEnabled: false,
      });

    const token = createResponse.body.data.config.token as string;
    const secret = createResponse.body.data.config.secret as string;
    const triggerId = createResponse.body.data.id as string;
    const rawBody = JSON.stringify({ hello: 'world' });
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = crypto
      .createHmac('sha256', secret)
      .update(`${timestamp}.${rawBody}`)
      .digest('hex');

    const response = await request(app.getHttpServer())
      .post(`/api/v1/webhooks/${token}`)
      .set('content-type', 'application/json')
      .set('x-agentloom-signature', signature)
      .set('x-agentloom-timestamp', timestamp)
      .send(rawBody);

    expect(response.status).toBe(404);

    const historyRows = await drizzleDb
      .select()
      .from(schema.workflowTriggerHistory)
      .where(eq(schema.workflowTriggerHistory.triggerId, triggerId));

    expect(historyRows).toHaveLength(0);
  });

  it('应返回触发历史分页结果', async () => {
    const owner = await seedTenant('trigger-history-owner');
    const workflowId = await seedPublishedWorkflow({
      tenantId: owner.tenantId,
      organizationId: owner.organizationId,
      createdBy: owner.user.id,
    });
    const trigger = await seedTrigger({
      workflowId,
      tenantId: owner.tenantId,
      createdBy: owner.user.id,
      name: 'History Trigger',
    });

    await seedTriggerHistory({
      triggerId: trigger.id,
      tenantId: owner.tenantId,
      count: 3,
    });

    const historyResponse = await request(app.getHttpServer())
      .get(
        `/api/v1/workflow-definitions/${workflowId}/triggers/${trigger.id}/history?page=1&pageSize=10`,
      )
      .set(owner.headers);

    expect(historyResponse.status).toBe(200);
    expect(historyResponse.body.meta).toEqual({
      page: 1,
      pageSize: 10,
      total: 3,
      totalPages: 1,
    });
    expect(historyResponse.body.data).toHaveLength(3);
    expect(historyResponse.body.data[0].triggerId).toBe(trigger.id);
    expect(historyResponse.body.data[0].status).toBe('success');
    expect(
      Date.parse(historyResponse.body.data[0].triggeredAt),
    ).toBeGreaterThanOrEqual(
      Date.parse(historyResponse.body.data[1].triggeredAt),
    );
  });

  it('工作流未发布时创建触发器应返回 409', async () => {
    const owner = await seedTenant('trigger-draft-owner');
    const workflowId = await seedDraftWorkflow({
      tenantId: owner.tenantId,
      organizationId: owner.organizationId,
      createdBy: owner.user.id,
    });

    const response = await request(app.getHttpServer())
      .post(`/api/v1/workflow-definitions/${workflowId}/triggers`)
      .set(owner.headers)
      .send({
        name: 'Draft Trigger',
        type: 'cron',
        config: {
          expression: '0 9 * * 1',
          timezone: 'Asia/Hong_Kong',
        },
        isEnabled: true,
      });

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({
      type: 'https://agentloom.dev/errors/workflow-not-published',
      title: '工作流未发布',
      status: 409,
      workflowId,
    });
  });

  it('viewer 可以读取但不能创建/更新/删除', async () => {
    const owner = await seedTenant('trigger-viewer-owner');
    const workflowId = await seedPublishedWorkflow({
      tenantId: owner.tenantId,
      organizationId: owner.organizationId,
      createdBy: owner.user.id,
    });
    const trigger = await seedTrigger({
      workflowId,
      tenantId: owner.tenantId,
      createdBy: owner.user.id,
      name: 'Viewer Trigger',
    });
    const viewer = await seedTenantMember({
      prefix: 'trigger-viewer-member',
      tenantId: owner.tenantId,
      organizationId: owner.organizationId,
      invitedBy: owner.user.id,
      role: 'viewer',
    });

    const listResponse = await request(app.getHttpServer())
      .get(`/api/v1/workflow-definitions/${workflowId}/triggers`)
      .set(viewer.headers);

    expect(listResponse.status).toBe(200);
    expect(listResponse.body.data).toHaveLength(1);

    const createResponse = await request(app.getHttpServer())
      .post(`/api/v1/workflow-definitions/${workflowId}/triggers`)
      .set(viewer.headers)
      .send({
        name: 'Viewer Create',
        type: 'cron',
        config: {
          expression: '0 9 * * 1',
          timezone: 'Asia/Hong_Kong',
        },
        isEnabled: true,
      });

    expect(createResponse.status).toBe(403);

    const updateResponse = await request(app.getHttpServer())
      .patch(
        `/api/v1/workflow-definitions/${workflowId}/triggers/${trigger.id}`,
      )
      .set(viewer.headers)
      .send({ name: 'Viewer Update' });

    expect(updateResponse.status).toBe(403);

    const deleteResponse = await request(app.getHttpServer())
      .delete(
        `/api/v1/workflow-definitions/${workflowId}/triggers/${trigger.id}`,
      )
      .set(viewer.headers);

    expect(deleteResponse.status).toBe(403);
  });

  it('访问不存在或跨租户触发器时应返回 404', async () => {
    const owner = await seedTenant('trigger-not-found-owner');
    const outsider = await seedTenant('trigger-not-found-outsider');
    const workflowId = await seedPublishedWorkflow({
      tenantId: owner.tenantId,
      organizationId: owner.organizationId,
      createdBy: owner.user.id,
    });
    const trigger = await seedTrigger({
      workflowId,
      tenantId: owner.tenantId,
      createdBy: owner.user.id,
      name: 'Cross Tenant Trigger',
    });

    const missingResponse = await request(app.getHttpServer())
      .get(
        `/api/v1/workflow-definitions/${workflowId}/triggers/${crypto.randomUUID()}`,
      )
      .set(owner.headers);

    expect(missingResponse.status).toBe(404);
    expect(missingResponse.body).toMatchObject({
      type: 'https://agentloom.dev/errors/trigger-not-found',
      title: '触发器不存在',
      status: 404,
    });

    const crossTenantResponse = await request(app.getHttpServer())
      .get(`/api/v1/workflow-definitions/${workflowId}/triggers/${trigger.id}`)
      .set(outsider.headers);

    expect(crossTenantResponse.status).toBe(404);
    expect(crossTenantResponse.body.type).toBe(
      'https://agentloom.dev/errors/trigger-not-found',
    );
  });

  it('单个工作流触发器数量达到上限时应返回 409', async () => {
    const owner = await seedTenant('trigger-limit-owner');
    const workflowId = await seedPublishedWorkflow({
      tenantId: owner.tenantId,
      organizationId: owner.organizationId,
      createdBy: owner.user.id,
    });

    for (let index = 0; index < MAX_TRIGGERS_PER_WORKFLOW; index++) {
      await seedTrigger({
        workflowId,
        tenantId: owner.tenantId,
        createdBy: owner.user.id,
        name: `Seeded Trigger ${index + 1}`,
      });
    }

    const response = await request(app.getHttpServer())
      .post(`/api/v1/workflow-definitions/${workflowId}/triggers`)
      .set(owner.headers)
      .send({
        name: 'Overflow Trigger',
        type: 'cron',
        config: {
          expression: '0 9 * * 1',
          timezone: 'Asia/Hong_Kong',
        },
        isEnabled: true,
      });

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({
      type: 'https://agentloom.dev/errors/trigger-limit-exceeded',
      title: '触发器数量超限',
      status: 409,
      limit: MAX_TRIGGERS_PER_WORKFLOW,
      workflowId,
    });
  });
});
