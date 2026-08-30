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

import { getQueueToken } from '@nestjs/bullmq';
import { Test } from '@nestjs/testing';
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify';
import * as crypto from 'node:crypto';
import * as jwt from 'jsonwebtoken';
import type { JSONValue } from 'postgres';
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
import type { ApiEventTriggerConfig } from '../src/database/schema/workflow-triggers.schema';
import {
  createRlsTestContext,
  seedAppUser,
  seedMember,
  seedOrg,
  type RlsTestContext,
} from './rls/rls-test-utils';

const JWT_SECRET = 'test-e2e-jwt-secret';

// 与 marketplace/monitoring 等 e2e spec 一致的窄化助手:
// 领域接口不是结构上的 JSONValue,插入 jsonb 时按同一约定收窄。
function toJsonValue(value: unknown): JSONValue {
  return value as JSONValue;
}
const DEFAULT_VIEWPORT: JSONValue = { x: 0, y: 0, zoom: 1 };
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

type TenantFixture = {
  tenantId: string;
  organizationId: string;
  userId: string;
  headers: Record<string, string>;
};

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

function signTenantToken(userId: string, email: string, tenantId: string) {
  return jwt.sign(
    {
      sub: userId,
      email,
      aud: 'authenticated',
      jti: crypto.randomUUID(),
      tenant_id: tenantId,
      tenant_role: 'owner',
    },
    JWT_SECRET,
    { algorithm: 'HS256', expiresIn: '1h' },
  );
}

describe('API Event ingestion E2E', () => {
  let ctx: RlsTestContext;
  let app: NestFastifyApplication;
  let db: DrizzleDB;
  let executionQueueAdd: ReturnType<typeof vi.fn>;

  beforeAll(async () => {
    process.env.APP_JWT_SECRET = JWT_SECRET;

    ctx = await createRlsTestContext();
    db = ctx.db;
    executionQueueAdd = vi.fn().mockResolvedValue(undefined);

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(SupabaseService)
      .useValue(createMockSupabaseService())
      .overrideProvider(DRIZZLE)
      .useValue(db)
      .overrideProvider(REDIS_CLIENT)
      .useValue(createMockRedisClient())
      .overrideProvider(RedisCacheService)
      .useValue(createMockRedisCacheService())
      .overrideProvider(RedisPubSubService)
      .useValue(createMockRedisPubSubService())
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
    Reflect.set(executionQueue, 'add', executionQueueAdd);
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await ctx?.close();
  });

  beforeEach(async () => {
    await ctx.reset();
    vi.clearAllMocks();
    executionQueueAdd.mockResolvedValue(undefined);
  });

  async function seedTenant(prefix: string): Promise<TenantFixture> {
    const userId = crypto.randomUUID();
    const email = `${prefix}-${crypto.randomUUID().slice(0, 8)}@example.com`;
    const tenantId = crypto.randomUUID();
    const organizationId = crypto.randomUUID();

    await seedAppUser(ctx.adminSql, userId, email);
    await seedOrg(
      ctx.adminSql,
      organizationId,
      `${prefix} org`,
      `org-${prefix}-${crypto.randomUUID().slice(0, 8)}`,
      userId,
      tenantId,
    );
    await seedMember(ctx.adminSql, organizationId, userId, 'owner', userId);
    await ctx.adminSql`
      UPDATE users
      SET current_organization_id = ${organizationId}::uuid
      WHERE id = ${userId}::uuid
    `;

    return {
      tenantId,
      organizationId,
      userId,
      headers: {
        authorization: `Bearer ${signTenantToken(userId, email, tenantId)}`,
      },
    };
  }

  async function seedWorkflow(
    tenant: TenantFixture,
    executable = true,
  ): Promise<string> {
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
        ${tenant.tenantId}::uuid,
        ${`API Event ${executable ? 'Executable' : 'Broken'} Workflow`},
        ${`api-event-${crypto.randomUUID().slice(0, 8)}`},
        'published'::workflow_status_enum,
        ${ctx.adminSql.json([])},
        ${ctx.adminSql.json([])},
        ${ctx.adminSql.json(DEFAULT_VIEWPORT)},
        1,
        ${tenant.userId}::uuid,
        ${tenant.userId}::uuid
      )
    `;

    if (!executable) {
      return workflowId;
    }

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
        ${tenant.tenantId}::uuid,
        1,
        'v1',
        ${ctx.adminSql.json(DEFAULT_SNAPSHOT)},
        ${new Date()},
        ${tenant.userId}::uuid
      )
    `;
    await ctx.adminSql`
      UPDATE workflow_definitions
      SET published_version_id = ${versionId}::uuid
      WHERE id = ${workflowId}::uuid
    `;

    return workflowId;
  }

  async function seedApiEventTrigger(options: {
    tenant: TenantFixture;
    workflowId: string;
    config: ApiEventTriggerConfig;
    enabled?: boolean;
    name?: string;
  }): Promise<string> {
    const triggerId = crypto.randomUUID();
    await ctx.adminSql`
      INSERT INTO workflow_triggers (
        id,
        workflow_definition_id,
        tenant_id,
        name,
        type,
        config,
        is_enabled,
        created_by
      ) VALUES (
        ${triggerId}::uuid,
        ${options.workflowId}::uuid,
        ${options.tenant.tenantId}::uuid,
        ${options.name ?? 'API Event Trigger'},
        'api_event'::trigger_type_enum,
        ${ctx.adminSql.json(toJsonValue(options.config))},
        ${options.enabled ?? true},
        ${options.tenant.userId}::uuid
      )
    `;
    return triggerId;
  }

  async function postEvent(
    tenant: TenantFixture,
    payload: { source: string; type: string; data?: Record<string, unknown> },
  ) {
    return app.inject({
      method: 'POST',
      url: '/api/v1/api-events',
      headers: tenant.headers,
      payload,
    });
  }

  it('generic 源应按 eventType 命中或跳过，并返回准确计数', async () => {
    const tenant = await seedTenant('api-event-generic');
    const workflowId = await seedWorkflow(tenant);
    const triggerId = await seedApiEventTrigger({
      tenant,
      workflowId,
      config: { eventSource: 'generic', eventType: 'invoice.created' },
    });

    const matched = await postEvent(tenant, {
      source: 'generic',
      type: 'invoice.created',
      data: { invoiceId: 'inv-1', amount: 42 },
    });

    expect(matched.statusCode).toBe(202);
    expect(matched.json()).toMatchObject({
      triggeredCount: 1,
      skippedCount: 0,
      executions: [{ triggerId, executionId: expect.any(String) }],
    });

    const executionId = matched.json().executions[0].executionId as string;
    expect(executionQueueAdd).toHaveBeenCalledWith(
      'execute',
      { executionId, tenantId: tenant.tenantId },
      { jobId: executionId },
    );

    const [execution] = await db
      .select()
      .from(schema.workflowExecutions)
      .where(eq(schema.workflowExecutions.id, executionId));
    expect(execution).toMatchObject({
      workflowDefinitionId: workflowId,
      tenantId: tenant.tenantId,
      triggerType: 'api',
      inputParams: {
        invoiceId: 'inv-1',
        amount: 42,
        _eventSource: 'generic',
        _eventType: 'invoice.created',
        _meta: { launchSource: 'api-event-trigger' },
      },
    });

    executionQueueAdd.mockClear();
    const unmatched = await postEvent(tenant, {
      source: 'generic',
      type: 'invoice.cancelled',
      data: { invoiceId: 'inv-1' },
    });

    expect(unmatched.statusCode).toBe(202);
    expect(unmatched.json()).toEqual({
      triggeredCount: 0,
      executions: [],
      skippedCount: 1,
    });
    expect(executionQueueAdd).not.toHaveBeenCalled();
  });

  it('GitHub 源应使用 X-Hub-Signature-256 的 HMAC-SHA256 正确签名触发', async () => {
    const tenant = await seedTenant('api-event-github-valid');
    const workflowId = await seedWorkflow(tenant);
    const secret = 'github-e2e-secret';
    const triggerId = await seedApiEventTrigger({
      tenant,
      workflowId,
      config: { eventSource: 'github', eventType: 'push', secret },
    });
    const rawBody = JSON.stringify({ ref: 'refs/heads/main', after: 'abc123' });
    const signature = `sha256=${crypto
      .createHmac('sha256', secret)
      .update(rawBody)
      .digest('hex')}`;

    const response = await postEvent(tenant, {
      source: 'github',
      type: 'push',
      data: {
        rawBody,
        headers: { 'x-hub-signature-256': signature },
        ref: 'refs/heads/main',
      },
    });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toMatchObject({
      triggeredCount: 1,
      skippedCount: 0,
      executions: [{ triggerId, executionId: expect.any(String) }],
    });
    expect(executionQueueAdd).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['错误签名', { 'x-hub-signature-256': 'sha256=invalid' }],
    ['缺少签名头', {}],
  ])(
    'GitHub %s 应 fail-closed，只计 skipped 且不创建 execution',
    async (_label, headers) => {
      const tenant = await seedTenant('api-event-github-rejected');
      const workflowId = await seedWorkflow(tenant);
      await seedApiEventTrigger({
        tenant,
        workflowId,
        config: {
          eventSource: 'github',
          eventType: 'push',
          secret: 'github-e2e-secret',
        },
      });

      const before = await db.select().from(schema.workflowExecutions);
      const response = await postEvent(tenant, {
        source: 'github',
        type: 'push',
        data: { rawBody: '{"ref":"refs/heads/main"}', headers },
      });

      expect(response.statusCode).toBe(202);
      expect(response.json()).toEqual({
        triggeredCount: 0,
        executions: [],
        skippedCount: 1,
      });
      expect(executionQueueAdd).not.toHaveBeenCalled();

      const after = await db.select().from(schema.workflowExecutions);
      expect(after).toHaveLength(before.length);
    },
  );

  it('坏 filter 应 fail-closed，且不影响同场有效 trigger', async () => {
    const tenant = await seedTenant('api-event-filter');
    const validWorkflowId = await seedWorkflow(tenant);
    const invalidWorkflowId = await seedWorkflow(tenant);
    const validTriggerId = await seedApiEventTrigger({
      tenant,
      workflowId: validWorkflowId,
      name: 'Valid Filter',
      config: {
        eventSource: 'generic',
        eventType: 'deployment',
        filterExpression:
          'payload.region === "cn" && source === "generic" && type === "deployment"',
      },
    });
    await seedApiEventTrigger({
      tenant,
      workflowId: invalidWorkflowId,
      name: 'Broken Filter',
      config: {
        eventSource: 'generic',
        eventType: 'deployment',
        filterExpression: 'payload.missing.deep.value === true',
      },
    });

    const response = await postEvent(tenant, {
      source: 'generic',
      type: 'deployment',
      data: { region: 'cn' },
    });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toMatchObject({
      triggeredCount: 1,
      skippedCount: 1,
      executions: [{ triggerId: validTriggerId }],
    });
    expect(executionQueueAdd).toHaveBeenCalledTimes(1);
  });

  it('多个 trigger 同时命中时应独立结算，一个执行失败不阻断其余 trigger', async () => {
    const tenant = await seedTenant('api-event-continue');
    const executableWorkflowId = await seedWorkflow(tenant);
    const brokenWorkflowId = await seedWorkflow(tenant, false);
    const successfulTriggerId = await seedApiEventTrigger({
      tenant,
      workflowId: executableWorkflowId,
      name: 'Executable Trigger',
      config: { eventSource: 'generic', eventType: 'order.created' },
    });
    const failedTriggerId = await seedApiEventTrigger({
      tenant,
      workflowId: brokenWorkflowId,
      name: 'Broken Workflow Trigger',
      config: { eventSource: 'generic', eventType: 'order.created' },
    });

    const response = await postEvent(tenant, {
      source: 'generic',
      type: 'order.created',
      data: { orderId: 'order-1' },
    });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toMatchObject({
      triggeredCount: 1,
      skippedCount: 0,
      executions: [{ triggerId: successfulTriggerId }],
    });
    expect(executionQueueAdd).toHaveBeenCalledTimes(1);

    const histories = await db
      .select()
      .from(schema.workflowTriggerHistory)
      .where(eq(schema.workflowTriggerHistory.triggerId, failedTriggerId));
    expect(histories).toHaveLength(1);
    expect(histories[0]).toMatchObject({
      status: 'failed',
      executionId: null,
    });
  });

  it('禁用 trigger 应从候选中排除并返回 202 零计数', async () => {
    const tenant = await seedTenant('api-event-disabled');
    const workflowId = await seedWorkflow(tenant);
    await seedApiEventTrigger({
      tenant,
      workflowId,
      enabled: false,
      config: { eventSource: 'generic', eventType: 'ping' },
    });

    const response = await postEvent(tenant, {
      source: 'generic',
      type: 'ping',
      data: {},
    });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual({
      triggeredCount: 0,
      executions: [],
      skippedCount: 0,
    });
    expect(executionQueueAdd).not.toHaveBeenCalled();
  });

  it('未知 source 应安全回退 generic，无同源 trigger 时返回 202 且不执行', async () => {
    const tenant = await seedTenant('api-event-unknown-source');
    const workflowId = await seedWorkflow(tenant);
    await seedApiEventTrigger({
      tenant,
      workflowId,
      config: { eventSource: 'generic', eventType: 'ping' },
    });

    const response = await postEvent(tenant, {
      source: 'unregistered-source',
      type: 'ping',
      data: {},
    });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual({
      triggeredCount: 0,
      executions: [],
      skippedCount: 1,
    });
    expect(executionQueueAdd).not.toHaveBeenCalled();
  });
});
