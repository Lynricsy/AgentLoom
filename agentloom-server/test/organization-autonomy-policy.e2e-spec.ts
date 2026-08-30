import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { BullRegistrar, getQueueToken } from '@nestjs/bullmq';
import { getOptionsToken } from '@nestjs/throttler';

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

import { Test } from '@nestjs/testing';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import * as jwt from 'jsonwebtoken';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { AppModule } from '../src/app.module';
import { RedisCacheService } from '../src/common/redis/redis-cache.service';
import { REDIS_CLIENT } from '../src/common/redis/redis.constants';
import { RedisPubSubService } from '../src/common/redis/redis-pubsub.service';
import { DRIZZLE, type DrizzleDB } from '../src/database/database.module';
import { SupabaseService } from '../src/modules/auth/supabase/supabase.service';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { ZodValidationPipe } from '../src/common/pipes/zod-validation.pipe';
import * as schema from '../src/database/schema';

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

type OrganizationRole = 'owner' | 'admin' | 'creator' | 'operator' | 'viewer';

type TestUser = {
  id: string;
  email: string;
};

type AuthenticatedTestUser = TestUser & {
  tenantId?: string;
  tenantRole?: OrganizationRole;
};

type HookEvent = {
  user_id: string;
  claims: Record<string, unknown>;
};

const originalStringToISOString = Reflect.get(String.prototype, 'toISOString');

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

function createMockQueue() {
  return {
    add: vi.fn().mockResolvedValue(undefined),
    upsertJobScheduler: vi.fn().mockResolvedValue(undefined),
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

function parseHookEvent(value: HookEvent | string) {
  return typeof value === 'string' ? (JSON.parse(value) as HookEvent) : value;
}

function makeAgentNode(
  id: string,
  label: string,
  data: Record<string, unknown>,
  type = 'llm-agent',
) {
  return {
    id,
    type,
    position: { x: 0, y: 0 },
    data: {
      label,
      nodeType: 'llm-agent',
      category: 'agent',
      ...data,
    },
  };
}

describe('Organization Autonomy Policy E2E (testcontainers)', () => {
  let app: NestFastifyApplication;
  let container: StartedPostgreSqlContainer;
  let supabaseService: ReturnType<typeof createMockSupabaseService>;
  let sql: ReturnType<typeof postgres>;
  let drizzleClient: ReturnType<typeof postgres>;
  let drizzleDb: DrizzleDB;

  beforeAll(async () => {
    Reflect.set(
      String.prototype,
      'toISOString',
      function stringToISOString(this: string) {
        return this.toString();
      },
    );

    container = await new PostgreSqlContainer('postgres:16-alpine')
      .withDatabase('testdb')
      .withUsername('testuser')
      .withPassword('testpass')
      .withStartupTimeout(120_000)
      .start();

    const connectionUri = container.getConnectionUri();
    sql = postgres(connectionUri, { max: 1 });

    await sql.unsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_auth_admin') THEN
          CREATE ROLE supabase_auth_admin NOLOGIN;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
          CREATE ROLE authenticated NOLOGIN;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
          CREATE ROLE anon NOLOGIN;
        END IF;
      END
      $$;
    `);

    await sql`CREATE SCHEMA IF NOT EXISTS auth`;
    await sql`
      CREATE TABLE auth.users (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        email text NOT NULL UNIQUE
      )
    `;

    const migrationsDir = path.join(__dirname, '../src/database/migrations');
    const migrationFiles = fs
      .readdirSync(migrationsDir)
      .filter((file) => file.endsWith('.sql'))
      .sort();

    for (const file of migrationFiles) {
      const content = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
      const statements = content
        .split('--> statement-breakpoint')
        .filter((statement) => statement.trim());

      for (const statement of statements) {
        await sql.unsafe(statement.trim());
      }
    }

    drizzleClient = postgres(connectionUri, { max: 5 });
    drizzleDb = drizzle(drizzleClient, { schema });

    supabaseService = createMockSupabaseService();
    const redisClient = createMockRedisClient();
    const redisCacheService = createMockRedisCacheService();
    const redisPubSubService = createMockRedisPubSubService();
    const queueMock = createMockQueue();
    const bullRegistrar = createMockBullRegistrar();
    const throttlerOptions = createMockThrottlerOptions();
    let moduleBuilder = Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(SupabaseService)
      .useValue(supabaseService)
      .overrideProvider(DRIZZLE)
      .useValue(drizzleDb)
      .overrideProvider(REDIS_CLIENT)
      .useValue(redisClient)
      .overrideProvider(RedisCacheService)
      .useValue(redisCacheService)
      .overrideProvider(RedisPubSubService)
      .useValue(redisPubSubService);

    moduleBuilder = moduleBuilder
      .overrideProvider(BullRegistrar)
      .useValue(bullRegistrar)
      .overrideProvider(getOptionsToken())
      .useValue(throttlerOptions);

    for (const queueName of APP_QUEUE_NAMES) {
      moduleBuilder = moduleBuilder
        .overrideProvider(getQueueToken(queueName))
        .useValue(queueMock);
    }

    const moduleFixture = await moduleBuilder.compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalPipes(new ZodValidationPipe());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  }, 240_000);

  afterAll(async () => {
    await app?.close();
    await drizzleClient?.end();
    await sql?.end();
    await container?.stop();

    if (originalStringToISOString === undefined) {
      Reflect.deleteProperty(String.prototype, 'toISOString');
    } else {
      Reflect.set(String.prototype, 'toISOString', originalStringToISOString);
    }
  });

  beforeEach(async () => {
    await sql`DELETE FROM "audit_logs"`;
    await sql`DELETE FROM "optimization_suggestions"`;
    await sql`DELETE FROM "organization_autonomy_policies"`;
    await sql`DELETE FROM "workflow_definitions"`;
    await sql`DELETE FROM "organization_members"`;
    await sql`DELETE FROM "organizations"`;
    await sql`DELETE FROM "revoked_tokens"`;
    await sql`DELETE FROM "users"`;
    await sql`DELETE FROM auth.users`;
    vi.clearAllMocks();
  });

  async function seedAuthUser(id: string, email: string) {
    await sql`
      INSERT INTO auth.users (id, email)
      VALUES (${id}::uuid, ${email})
    `;
  }

  async function seedAppUser(id: string, email: string) {
    await seedAuthUser(id, email);

    const [user] = await sql`
      INSERT INTO "users" (id, supabase_user_id, email)
      VALUES (${id}::uuid, ${id}::uuid, ${email})
      RETURNING *
    `;

    return user;
  }

  async function seedOrganization(
    ownerId: string,
    input?: { name?: string; slug?: string },
  ) {
    const name = input?.name ?? 'Autonomy Org';
    const slug =
      input?.slug ?? `autonomy-org-${crypto.randomUUID().slice(0, 8)}`;

    const [organization] = await sql`
      INSERT INTO "organizations" (name, slug, owner_id)
      VALUES (${name}, ${slug}, ${ownerId}::uuid)
      RETURNING *
    `;

    await sql`
      INSERT INTO "organization_members" (
        organization_id,
        user_id,
        role,
        invited_by
      )
      VALUES (
        ${organization.id}::uuid,
        ${ownerId}::uuid,
        ${'owner'}::org_role,
        ${ownerId}::uuid
      )
    `;

    await sql`
      UPDATE "users"
      SET current_organization_id = ${organization.id}::uuid
      WHERE id = ${ownerId}::uuid
    `;

    return organization;
  }

  async function seedOrganizationMember(
    organizationId: string,
    userId: string,
    role: OrganizationRole,
    invitedBy: string,
  ) {
    const [member] = await sql`
      INSERT INTO "organization_members" (
        organization_id,
        user_id,
        role,
        invited_by
      )
      VALUES (
        ${organizationId}::uuid,
        ${userId}::uuid,
        ${role}::org_role,
        ${invitedBy}::uuid
      )
      RETURNING *
    `;

    return member;
  }

  async function seedWorkflowDefinition(
    tenantId: string,
    userId: string,
    name: string,
    slug: string,
    nodes: Array<Record<string, unknown>>,
  ) {
    const [workflowDefinition] = await sql`
      INSERT INTO "workflow_definitions" (
        tenant_id,
        name,
        slug,
        nodes,
        edges,
        viewport,
        metadata,
        created_by,
        updated_by
      )
      VALUES (
        ${tenantId}::uuid,
        ${name},
        ${slug},
        ${JSON.stringify(nodes)}::jsonb,
        ${sql.json([])},
        ${sql.json({ x: 0, y: 0, zoom: 1 })},
        ${sql.json({})},
        ${userId}::uuid,
        ${userId}::uuid
      )
      RETURNING *
    `;

    return workflowDefinition;
  }

  async function seedAutonomyPolicy(
    organizationId: string,
    tenantId: string,
    userId: string,
    autonomyCap: 'MANUAL_CONFIRM' | 'RULE_BASED' | 'LLM_SUGGEST',
  ) {
    const [policy] = await sql`
      INSERT INTO "organization_autonomy_policies" (
        organization_id,
        tenant_id,
        autonomy_cap,
        created_by,
        updated_by
      )
      VALUES (
        ${organizationId}::uuid,
        ${tenantId}::uuid,
        ${autonomyCap},
        ${userId}::uuid,
        ${userId}::uuid
      )
      RETURNING *
    `;

    return policy;
  }

  async function callAccessTokenHook(eventPayload: HookEvent) {
    const serializedEvent = JSON.stringify(eventPayload).replaceAll("'", "''");
    const [row] = await sql.unsafe<{ result: HookEvent | string }[]>(`
      SELECT custom_access_token_hook('${serializedEvent}'::jsonb) AS result
    `);

    return parseHookEvent(row.result);
  }

  it('owner can query policy summary, update policy with audit, and non-owner cannot update it', async () => {
    const owner = createTestUser('autonomy-owner');
    const viewer = createTestUser('autonomy-viewer');
    await seedAppUser(owner.id, owner.email);
    await seedAppUser(viewer.id, viewer.email);

    const organization = await seedOrganization(owner.id);
    await seedOrganizationMember(
      organization.id,
      viewer.id,
      'viewer',
      owner.id,
    );
    await seedAutonomyPolicy(
      organization.id,
      organization.tenant_id,
      owner.id,
      'RULE_BASED',
    );
    await seedWorkflowDefinition(
      organization.tenant_id,
      owner.id,
      'Policy Workflow',
      `policy-workflow-${crypto.randomUUID().slice(0, 8)}`,
      [
        makeAgentNode('agent-1', 'Planner', {
          autonomyMode: 'FULL_AUTO',
          autonomyConfig: { mode: 'MANUAL_CONFIRM' },
        }),
        makeAgentNode('agent-2', 'Reviewer', {
          autonomyConfig: { mode: 'LLM_SUGGEST' },
        }),
      ],
    );

    const ownerResponse = await app.inject({
      method: 'GET',
      url: `/api/v1/organizations/${organization.id}/autonomy-policy`,
      headers: authHeaders(
        withTenantContext(owner, organization.tenant_id, 'owner'),
      ),
    });

    expect(ownerResponse.statusCode).toBe(200);
    const ownerBody = ownerResponse.json();
    expect(ownerBody.data.autonomyCap).toBe('RULE_BASED');
    expect(ownerBody.data.updatedBy).toBe(owner.id);
    expect(ownerBody.data.violationSummary).toEqual({
      workflowCount: 1,
      nodeCount: 2,
    });

    const updateResponse = await app.inject({
      method: 'PUT',
      url: `/api/v1/organizations/${organization.id}/autonomy-policy`,
      headers: authHeaders(
        withTenantContext(owner, organization.tenant_id, 'owner'),
      ),
      payload: {
        autonomyCap: 'MANUAL_CONFIRM',
      },
    });

    expect(updateResponse.statusCode).toBe(200);
    const updateBody = updateResponse.json();
    expect(updateBody.data.autonomyCap).toBe('MANUAL_CONFIRM');
    expect(updateBody.data.updatedBy).toBe(owner.id);

    const auditRows = await sql`
      SELECT event_type
      FROM "audit_logs"
      WHERE tenant_id = ${organization.tenant_id}::uuid
      ORDER BY created_at ASC
    `;

    expect(auditRows.map((row) => row.event_type)).toContain(
      'organization.autonomy-policy.updated',
    );

    const viewerResponse = await app.inject({
      method: 'PUT',
      url: `/api/v1/organizations/${organization.id}/autonomy-policy`,
      headers: authHeaders(
        withTenantContext(viewer, organization.tenant_id, 'viewer'),
      ),
      payload: {
        autonomyCap: 'MANUAL_CONFIRM',
      },
    });

    expect(viewerResponse.statusCode).toBe(403);
  });

  it('preview returns violating nodes and records preview audit', async () => {
    const owner = createTestUser('autonomy-preview-owner');
    await seedAppUser(owner.id, owner.email);

    const organization = await seedOrganization(owner.id);
    await seedWorkflowDefinition(
      organization.tenant_id,
      owner.id,
      'Preview Workflow',
      `preview-workflow-${crypto.randomUUID().slice(0, 8)}`,
      [
        makeAgentNode('agent-1', 'Planner', {
          autonomyMode: 'FULL_AUTO',
          autonomyConfig: { mode: 'MANUAL_CONFIRM' },
        }),
        makeAgentNode('agent-2', 'Reviewer', {
          autonomyConfig: { mode: 'LLM_SUGGEST' },
        }),
        {
          id: 'tool-1',
          type: 'tool',
          position: { x: 100, y: 0 },
          data: {
            label: 'Search Tool',
            autonomyMode: 'FULL_AUTO',
          },
        },
      ],
    );

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/organizations/${organization.id}/autonomy-policy/downgrade-preview`,
      headers: authHeaders(
        withTenantContext(owner, organization.tenant_id, 'owner'),
      ),
      payload: {
        autonomyCap: 'RULE_BASED',
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();

    expect(body.data.autonomyCap).toBe('RULE_BASED');
    expect(body.data.violationSummary).toEqual({
      workflowCount: 1,
      nodeCount: 2,
    });
    expect(body.data.violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          nodeId: 'agent-1',
          nodeName: 'Planner',
          rawMode: 'FULL_AUTO',
          canonicalMode: 'LLM_SUGGEST',
          replacementMode: 'RULE_BASED',
        }),
        expect.objectContaining({
          nodeId: 'agent-2',
          nodeName: 'Reviewer',
          rawMode: 'LLM_SUGGEST',
          canonicalMode: 'LLM_SUGGEST',
          replacementMode: 'RULE_BASED',
        }),
      ]),
    );

    const auditRows = await sql`
      SELECT event_type
      FROM "audit_logs"
      WHERE tenant_id = ${organization.tenant_id}::uuid
      ORDER BY created_at ASC
    `;

    expect(auditRows.map((row) => row.event_type)).toContain(
      'organization.autonomy-policy.previewed',
    );
  });

  it('confirm tightens policy, rewrites current workflow nodes, and writes confirm audits', async () => {
    const owner = createTestUser('autonomy-confirm-owner');
    await seedAppUser(owner.id, owner.email);

    const organization = await seedOrganization(owner.id);
    await seedAutonomyPolicy(
      organization.id,
      organization.tenant_id,
      owner.id,
      'RULE_BASED',
    );
    const workflowDefinition = await seedWorkflowDefinition(
      organization.tenant_id,
      owner.id,
      'Confirm Workflow',
      `confirm-workflow-${crypto.randomUUID().slice(0, 8)}`,
      [
        makeAgentNode('agent-1', 'Planner', {
          autonomyMode: 'FULL_AUTO',
          autonomyConfig: {
            mode: 'RULE_BASED',
            confirmationThreshold: 0.6,
          },
          settings: {
            autonomyMode: 'RULE_BASED',
            theme: 'compact',
          },
          config: {
            autonomyMode: 'RULE_BASED',
            modelId: 'gpt-4o',
          },
        }),
        makeAgentNode('agent-2', 'Reviewer', {
          autonomyConfig: {
            mode: 'LLM_SUGGEST',
            confirmationThreshold: 0.7,
          },
          settings: {
            autonomyMode: 'RULE_BASED',
            layout: 'advanced',
          },
          config: {
            autonomyMode: 'RULE_BASED',
            modelId: 'claude-3-7-sonnet',
          },
        }),
        makeAgentNode('agent-3', 'Safe Node', {
          autonomyConfig: {
            mode: 'MANUAL_CONFIRM',
            confirmationThreshold: 0.8,
          },
          settings: {
            autonomyMode: 'MANUAL_CONFIRM',
          },
          config: {
            autonomyMode: 'MANUAL_CONFIRM',
          },
        }),
      ],
    );

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/organizations/${organization.id}/autonomy-policy/downgrade-confirm`,
      headers: authHeaders(
        withTenantContext(owner, organization.tenant_id, 'owner'),
      ),
      payload: {
        autonomyCap: 'MANUAL_CONFIRM',
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();

    expect(body.data.autonomyCap).toBe('MANUAL_CONFIRM');
    expect(body.data.downgradedSummary).toEqual({
      workflowCount: 1,
      nodeCount: 2,
    });
    expect(body.data.policy.autonomyCap).toBe('MANUAL_CONFIRM');
    expect(body.data.policy.updatedBy).toBe(owner.id);
    expect(body.data.policy.violationSummary).toEqual({
      workflowCount: 0,
      nodeCount: 0,
    });

    const [persistedWorkflow] = await sql`
      SELECT nodes
      FROM "workflow_definitions"
      WHERE id = ${workflowDefinition.id}::uuid
    `;

    const nodes = persistedWorkflow.nodes as Array<{
      id: string;
      data: Record<string, unknown>;
    }>;
    const planner = nodes.find((node) => node.id === 'agent-1');
    const reviewer = nodes.find((node) => node.id === 'agent-2');
    const safeNode = nodes.find((node) => node.id === 'agent-3');

    expect(planner?.data.autonomyMode).toBe('MANUAL_CONFIRM');
    expect((planner?.data.autonomyConfig as Record<string, unknown>).mode).toBe(
      'MANUAL_CONFIRM',
    );
    expect(
      (planner?.data.settings as Record<string, unknown>).autonomyMode,
    ).toBe('MANUAL_CONFIRM');
    expect((planner?.data.config as Record<string, unknown>).autonomyMode).toBe(
      'MANUAL_CONFIRM',
    );
    expect(
      (reviewer?.data.autonomyConfig as Record<string, unknown>).mode,
    ).toBe('MANUAL_CONFIRM');
    expect(
      (reviewer?.data.settings as Record<string, unknown>).autonomyMode,
    ).toBe('MANUAL_CONFIRM');
    expect(
      (reviewer?.data.config as Record<string, unknown>).autonomyMode,
    ).toBe('MANUAL_CONFIRM');
    expect(
      (safeNode?.data.autonomyConfig as Record<string, unknown>).mode,
    ).toBe('MANUAL_CONFIRM');
    expect(
      (safeNode?.data.settings as Record<string, unknown>).autonomyMode,
    ).toBe('MANUAL_CONFIRM');
    expect(
      (safeNode?.data.config as Record<string, unknown>).autonomyMode,
    ).toBe('MANUAL_CONFIRM');

    const auditRows = await sql`
      SELECT event_type
      FROM "audit_logs"
      WHERE tenant_id = ${organization.tenant_id}::uuid
      ORDER BY created_at ASC
    `;

    expect(auditRows.map((row) => row.event_type)).toEqual(
      expect.arrayContaining([
        'organization.autonomy-policy.confirmed',
        'organization.autonomy-policy.downgrade-completed',
      ]),
    );
  });

  it('access token hook keeps tenant claims for owner policy route usage', async () => {
    const owner = createTestUser('autonomy-hook-owner');
    await seedAppUser(owner.id, owner.email);
    const organization = await seedOrganization(owner.id);

    const hookResult = await callAccessTokenHook({
      user_id: owner.id,
      claims: {
        sub: owner.id,
        email: owner.email,
        aud: 'authenticated',
      },
    });

    expect(hookResult.claims.tenant_id).toBe(organization.tenant_id);
    expect(hookResult.claims.tenant_role).toBe('owner');
  });
});
