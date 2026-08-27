import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify';
import * as crypto from 'node:crypto';
import * as jwt from 'jsonwebtoken';

import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { ZodValidationPipe } from '../src/common/pipes/zod-validation.pipe';
import { RedisCacheService } from '../src/common/redis/redis-cache.service';
import { REDIS_CLIENT } from '../src/common/redis/redis.constants';
import { RedisPubSubService } from '../src/common/redis/redis-pubsub.service';
import { DRIZZLE } from '../src/database/database.module';
import { SupabaseService } from '../src/modules/auth/supabase/supabase.service';
import {
  createRlsTestContext,
  seedAppUser,
  seedMember,
  seedOrg,
  type OrganizationRole,
  type RlsTestContext,
} from './rls/rls-test-utils';

const JWT_SECRET = 'test-e2e-jwt-secret';

type TenantFixture = {
  userId: string;
  tenantId: string;
  organizationId: string;
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

function makeHeaders(
  userId: string,
  email: string,
  tenantId: string,
  role: OrganizationRole,
) {
  const token = jwt.sign(
    {
      sub: userId,
      email,
      aud: 'authenticated',
      jti: crypto.randomUUID(),
      tenant_id: tenantId,
      tenant_role: role,
    },
    JWT_SECRET,
    { algorithm: 'HS256', expiresIn: '1h' },
  );
  return { authorization: `Bearer ${token}` };
}

describe('Misc uncovered HTTP domains (E2E)', () => {
  let ctx: RlsTestContext;
  let app: NestFastifyApplication;

  async function seedTenant(prefix: string): Promise<TenantFixture> {
    const userId = crypto.randomUUID();
    const tenantId = crypto.randomUUID();
    const organizationId = crypto.randomUUID();
    const suffix = crypto.randomUUID().slice(0, 8);
    const email = `${prefix}-${suffix}@example.com`;

    await seedAppUser(ctx.adminSql, userId, email);
    await seedOrg(
      ctx.adminSql,
      organizationId,
      `${prefix} organization`,
      `${prefix}-${suffix}`,
      userId,
      tenantId,
    );
    await seedMember(ctx.adminSql, organizationId, userId, 'owner', userId);
    await ctx.adminSql`
      UPDATE users SET current_organization_id = ${organizationId}::uuid
      WHERE id = ${userId}::uuid
    `;

    return {
      userId,
      tenantId,
      organizationId,
      headers: makeHeaders(userId, email, tenantId, 'owner'),
    };
  }

  async function seedPublishedWorkflow(source: TenantFixture) {
    const workflowId = crypto.randomUUID();
    const versionId = crypto.randomUUID();
    const snapshot = {
      nodes: [],
      edges: [],
      viewport: null,
      inputSchema: null,
      metadata: { nodeCount: 0, edgeCount: 0, createdFromVersion: 1 },
    };

    await ctx.adminSql`
      INSERT INTO workflow_definitions (
        id, tenant_id, name, slug, nodes, edges, version, status,
        created_by, updated_by
      ) VALUES (
        ${workflowId}::uuid, ${source.tenantId}::uuid, 'Shared workflow',
        ${`shared-workflow-${workflowId.slice(0, 8)}`}, '[]'::jsonb,
        '[]'::jsonb, 1, 'published', ${source.userId}::uuid,
        ${source.userId}::uuid
      )
    `;
    await ctx.adminSql`
      INSERT INTO workflow_versions (
        id, workflow_definition_id, tenant_id, version_number, snapshot,
        published_at, created_by
      ) VALUES (
        ${versionId}::uuid, ${workflowId}::uuid, ${source.tenantId}::uuid,
        1, ${ctx.adminSql.json(snapshot)}, now(), ${source.userId}::uuid
      )
    `;
    await ctx.adminSql`
      UPDATE workflow_definitions SET published_version_id = ${versionId}::uuid
      WHERE id = ${workflowId}::uuid
    `;
    return workflowId;
  }

  async function seedPublishedAgent(source: TenantFixture) {
    const agentId = crypto.randomUUID();
    const versionId = crypto.randomUUID();
    const snapshot = {
      runtimeMode: 'no_sandbox',
      nodes: [],
      edges: [],
      viewport: null,
      systemPrompt: null,
      sandboxConfig: null,
      workspaceSnapshotId: null,
      metadata: { nodeCount: 0, edgeCount: 0, createdFromVersion: 1 },
    };

    await ctx.adminSql`
      INSERT INTO agent_definitions (
        id, tenant_id, name, slug, runtime_mode, nodes, edges, version, status,
        created_by, updated_by
      ) VALUES (
        ${agentId}::uuid, ${source.tenantId}::uuid, 'Shared agent',
        ${`shared-agent-${agentId.slice(0, 8)}`}, 'no_sandbox', '[]'::jsonb,
        '[]'::jsonb, 1, 'published', ${source.userId}::uuid,
        ${source.userId}::uuid
      )
    `;
    await ctx.adminSql`
      INSERT INTO agent_versions (
        id, agent_definition_id, tenant_id, version_number, snapshot,
        published_at, created_by
      ) VALUES (
        ${versionId}::uuid, ${agentId}::uuid, ${source.tenantId}::uuid,
        1, ${ctx.adminSql.json(snapshot)}, now(), ${source.userId}::uuid
      )
    `;
    await ctx.adminSql`
      UPDATE agent_definitions SET published_version_id = ${versionId}::uuid
      WHERE id = ${agentId}::uuid
    `;
    return agentId;
  }

  beforeAll(async () => {
    process.env.APP_JWT_SECRET = JWT_SECRET;
    ctx = await createRlsTestContext();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(SupabaseService)
      .useValue(createMockSupabaseService())
      .overrideProvider(DRIZZLE)
      .useValue(ctx.db)
      .overrideProvider(REDIS_CLIENT)
      .useValue(createMockRedisClient())
      .overrideProvider(RedisCacheService)
      .useValue(createMockRedisCacheService())
      .overrideProvider(RedisPubSubService)
      .useValue(createMockRedisPubSubService())
      .compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalPipes(new ZodValidationPipe());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await ctx?.close();
  });

  describe('user-preference', () => {
    it('GET 默认值、PATCH 回写与无 token 401', async () => {
      const tenant = await seedTenant('preferences');
      const unauthorized = await app.inject({
        method: 'GET',
        url: '/api/v1/user-preferences',
      });
      expect(unauthorized.statusCode).toBe(401);

      const initial = await app.inject({
        method: 'GET',
        url: '/api/v1/user-preferences',
        headers: tenant.headers,
      });
      expect(initial.statusCode).toBe(200);
      expect(initial.json().data).toMatchObject({
        userId: tenant.userId,
        tenantId: tenant.tenantId,
        titleModelConfigId: null,
        preferences: {},
      });

      const updated = await app.inject({
        method: 'PATCH',
        url: '/api/v1/user-preferences',
        headers: tenant.headers,
        payload: { preferences: { theme: 'dark', locale: 'zh-CN' } },
      });
      expect(updated.statusCode).toBe(200);
      expect(updated.json().data).toMatchObject({
        titleModelConfigId: null,
        preferences: { theme: 'dark', locale: 'zh-CN' },
      });

      const reread = await app.inject({
        method: 'GET',
        url: '/api/v1/user-preferences',
        headers: tenant.headers,
      });
      expect(reread.statusCode).toBe(200);
      expect(reread.json().data.preferences).toEqual({
        theme: 'dark',
        locale: 'zh-CN',
      });
    });
  });

  describe('resource-source convert-to-manual', () => {
    it('正例与重复转换均返回 200 manual', async () => {
      const tenant = await seedTenant('resource-source');
      // convert-to-manual 现在会先校验真实资源存在且属于本租户，
      // 因此必须真的建一个 workflow_definition，不能只插来源记录。
      const resourceId = await seedPublishedWorkflow(tenant);
      await ctx.adminSql`
        INSERT INTO resource_source_records (
          tenant_id, resource_type, resource_id, origin_kind, current_kind,
          source_share_type, source_share_token, created_by
        ) VALUES (
          ${tenant.tenantId}::uuid, 'workflow_definition', ${resourceId}::uuid,
          'share_imported', 'share_imported', 'workflow', 'source-token',
          ${tenant.userId}::uuid
        )
      `;

      for (let attempt = 0; attempt < 2; attempt += 1) {
        const response = await app.inject({
          method: 'POST',
          url: `/api/v1/resource-sources/workflow_definition/${resourceId}/convert-to-manual`,
          headers: tenant.headers,
        });
        expect(response.statusCode).toBe(200);
        expect(response.json().data).toEqual({
          resourceType: 'workflow_definition',
          resourceId,
          currentKind: 'manual',
        });
      }

      const [row] = await ctx.adminSql`
        SELECT origin_kind, current_kind FROM resource_source_records
        WHERE tenant_id = ${tenant.tenantId}::uuid
          AND resource_id = ${resourceId}::uuid
      `;
      expect(row).toMatchObject({
        origin_kind: 'share_imported',
        current_kind: 'manual',
      });
    });

    it('跨租户或不存在 resourceId 应返回 404', async () => {
      const owner = await seedTenant('resource-source-owner');
      const outsider = await seedTenant('resource-source-outsider');
      const resourceId = await seedPublishedWorkflow(owner);

      // 不存在的 id：此前会命中伪造 fallback 返回 200 manual。
      const missing = await app.inject({
        method: 'POST',
        url: `/api/v1/resource-sources/workflow_definition/${crypto.randomUUID()}/convert-to-manual`,
        headers: owner.headers,
      });
      expect(missing.statusCode).toBe(404);

      // 跨租户：资源真实存在但不属于调用方，同样必须 404。
      const crossTenant = await app.inject({
        method: 'POST',
        url: `/api/v1/resource-sources/workflow_definition/${resourceId}/convert-to-manual`,
        headers: outsider.headers,
      });
      expect(crossTenant.statusCode).toBe(404);
    });
  });

  describe('share', () => {
    it('workflow 创建→公开读取→import→revoke', async () => {
      const source = await seedTenant('workflow-share-source');
      const target = await seedTenant('workflow-share-target');
      const workflowId = await seedPublishedWorkflow(source);
      const created = await app.inject({
        method: 'POST',
        url: '/api/v1/workflow-shares',
        headers: source.headers,
        payload: {
          workflow_definition_id: workflowId,
          share_type: 'copyable',
        },
      });
      expect(created.statusCode).toBe(201);
      const share = created.json().data as { id: string; shareToken: string };

      const publicResponse = await app.inject({
        method: 'GET',
        url: `/api/v1/s/${share.shareToken}`,
      });
      expect(publicResponse.statusCode).toBe(200);
      expect(publicResponse.json()).toMatchObject({
        token: share.shareToken,
        resourceType: 'workflow',
        workflowDefinitionId: workflowId,
        shareType: 'copyable',
      });

      const imported = await app.inject({
        method: 'POST',
        url: '/api/v1/workflow-definitions',
        headers: target.headers,
        payload: {
          name: 'Imported shared workflow',
          share_token: share.shareToken,
        },
      });
      expect(imported.statusCode).toBe(201);
      expect(imported.json().data).toMatchObject({
        tenantId: target.tenantId,
        name: 'Imported shared workflow',
      });

      expect(
        (
          await app.inject({
            method: 'DELETE',
            url: `/api/v1/workflow-shares/${share.id}`,
            headers: source.headers,
          })
        ).statusCode,
      ).toBe(204);
      const afterRevoke = await app.inject({
        method: 'GET',
        url: `/api/v1/s/${share.shareToken}`,
      });
      // 验收原预期 404；ShareRevokedException 有意表达 Gone，实测为 410。
      expect(afterRevoke.statusCode).toBe(410);
    });

    it('agent 创建→公开读取→import→revoke', async () => {
      const source = await seedTenant('agent-share-source');
      const target = await seedTenant('agent-share-target');
      const agentId = await seedPublishedAgent(source);
      const created = await app.inject({
        method: 'POST',
        url: '/api/v1/agent-shares',
        headers: source.headers,
        payload: {
          agent_definition_id: agentId,
          share_type: 'copyable',
        },
      });
      expect(created.statusCode).toBe(201);
      const share = created.json().data as { id: string; shareToken: string };

      const publicResponse = await app.inject({
        method: 'GET',
        url: `/api/v1/s/${share.shareToken}`,
      });
      expect(publicResponse.statusCode).toBe(200);
      expect(publicResponse.json()).toMatchObject({
        token: share.shareToken,
        resourceType: 'agent',
        agentDefinitionId: agentId,
        shareType: 'copyable',
      });

      const imported = await app.inject({
        method: 'POST',
        url: `/api/v1/agent-shares/${share.shareToken}/import`,
        headers: target.headers,
      });
      expect(imported.statusCode).toBe(200);
      expect(imported.json().data).toMatchObject({
        agentDefinitionId: expect.any(String),
        name: expect.any(String),
        summary: expect.objectContaining({ cloned: expect.any(Number) }),
      });
      expect(imported.json().data.agentDefinitionId).not.toBe(agentId);

      expect(
        (
          await app.inject({
            method: 'DELETE',
            url: `/api/v1/agent-shares/${share.id}`,
            headers: source.headers,
          })
        ).statusCode,
      ).toBe(204);
      const afterRevoke = await app.inject({
        method: 'GET',
        url: `/api/v1/s/${share.shareToken}`,
      });
      // 验收原预期 404；ShareRevokedException 有意表达 Gone，实测为 410。
      expect(afterRevoke.statusCode).toBe(410);
    });
  });

  describe('agent-runtime tool-executions callback boundary', () => {
    it('非法 JSON body 返回 400', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/agent-runtime/sessions/${crypto.randomUUID()}/tool-executions`,
        headers: { 'content-type': 'application/json' },
        payload: '{',
      });
      expect(response.statusCode).toBe(400);
    });

    it('不存在的 session/toolCall 返回 404', async () => {
      const sessionId = crypto.randomUUID();
      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/agent-runtime/sessions/${sessionId}/tool-executions`,
        payload: {
          sessionId,
          toolCallId: 'missing-tool-call',
          toolName: 'missing-tool',
          input: {},
        },
      });
      expect(response.statusCode).toBe(404);
    });
  });
});
