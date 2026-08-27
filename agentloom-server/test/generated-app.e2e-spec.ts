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
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import * as crypto from 'node:crypto';
import * as jwt from 'jsonwebtoken';

import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { RedisCacheService } from '../src/common/redis/redis-cache.service';
import { REDIS_CLIENT } from '../src/common/redis/redis.constants';
import { RedisPubSubService } from '../src/common/redis/redis-pubsub.service';
import { ZodValidationPipe } from '../src/common/pipes/zod-validation.pipe';
import { DRIZZLE } from '../src/database/database.module';
import { SupabaseService } from '../src/modules/auth/supabase/supabase.service';
import { GeneratedAppArtifactService } from '../src/modules/generated-app/generated-app-artifact.service';
import { GeneratedAppGenerationOrchestratorService } from '../src/modules/generated-app/generated-app-generation-orchestrator.service';
import { GeneratedAppRepository } from '../src/modules/generated-app/generated-app.repository';
import { GENERATED_APP_GATE_DEFINITIONS } from '../src/modules/generated-app/generated-app.gates';
import {
  createRlsTestContext,
  seedAppUser,
  seedMember,
  seedOrg,
  type OrganizationRole,
  type RlsTestContext,
} from './rls/rls-test-utils';

const JWT_SECRET = 'test-e2e-jwt-secret';
const PREVIEW_HTML = '<!doctype html><html><body>offline preview</body></html>';

type TestUser = {
  id: string;
  email: string;
  tenantId: string;
  organizationId: string;
  role: OrganizationRole;
  headers: Record<string, string>;
};

type CreatedApp = {
  id: string;
  status: string;
  readiness: { state: string; canCreatePublicShare: boolean };
  publicShareToken: string | null;
};

function signToken(payload: Record<string, unknown>) {
  return jwt.sign(payload, JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: '1h',
  });
}

function authHeaders(
  userId: string,
  email: string,
  tenantId: string,
  role: OrganizationRole,
) {
  return {
    authorization: `Bearer ${signToken({
      sub: userId,
      email,
      aud: 'authenticated',
      jti: crypto.randomUUID(),
      tenant_id: tenantId,
      tenant_role: role,
    })}`,
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

function parseJson(response: { body: string }) {
  return JSON.parse(response.body) as Record<string, any>;
}

describe('Generated App (E2E)', () => {
  let ctx: RlsTestContext;
  let app: NestFastifyApplication;
  let repository: GeneratedAppRepository;

  const startGenerationRun = vi.fn(
    async (
      tenantId: string,
      userId: string,
      appId: string,
      dto: {
        triggerSource?: 'initial' | 'manual' | 'retry' | 'system';
        maxRepairAttempts?: number;
        maxRuntimeSeconds?: number;
      },
    ) => {
      const generationRun = await repository.createGenerationRun(
        tenantId,
        userId,
        appId,
        {
          runNumber: 1,
          status: 'passed',
          triggerSource: dto.triggerSource ?? 'manual',
          maxRepairAttempts: dto.maxRepairAttempts ?? 3,
          maxRuntimeSeconds: dto.maxRuntimeSeconds ?? 1800,
          summary: '离线 fake runner 已完成，不调用 LLM',
          completedAt: new Date().toISOString(),
        },
      );

      return {
        generationRun,
        gateRuns: [],
        app: await repository.findOne(tenantId, appId),
      };
    },
  );

  const artifactServiceFake = {
    resolvePublicRuntimePreviewUrl: vi.fn(
      async (_app: unknown, token: string) =>
        `/api/v1/generated-apps/public/${token}/preview`,
    ),
    resolveArtifactContentForApp: vi.fn(async () => ({
      artifact: {
        artifactId: 'gate-3-build-output-html',
        label: 'Gate 3 build output',
        kind: 'build_output',
        path: 'dist/index.html',
        materialized: true,
        sizeBytes: Buffer.byteLength(PREVIEW_HTML),
        contentType: 'text/html',
        readable: true,
        updatedAt: new Date(),
      },
      content: PREVIEW_HTML,
      truncated: false,
    })),
    getArtifactManifest: vi.fn(),
    getArtifactContent: vi.fn(),
  };

  beforeAll(async () => {
    process.env.APP_JWT_SECRET = JWT_SECRET;
    ctx = await createRlsTestContext();

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
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
      .overrideProvider(GeneratedAppGenerationOrchestratorService)
      .useValue({ startGenerationRun })
      .overrideProvider(GeneratedAppArtifactService)
      .useValue(artifactServiceFake)
      .compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalPipes(new ZodValidationPipe());

    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    repository = app.get(GeneratedAppRepository);
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await ctx?.close();
  });

  beforeEach(async () => {
    await ctx.adminSql`DELETE FROM generated_app_gate_runs`;
    await ctx.adminSql`DELETE FROM generated_app_repair_attempts`;
    await ctx.adminSql`DELETE FROM generated_app_generation_runs`;
    await ctx.adminSql`DELETE FROM generated_app_submissions`;
    await ctx.adminSql`DELETE FROM generated_apps`;
    await ctx.reset();
    vi.clearAllMocks();
  });

  async function seedTenant(
    prefix: string,
    role: OrganizationRole = 'owner',
  ): Promise<TestUser> {
    const id = crypto.randomUUID();
    const tenantId = crypto.randomUUID();
    const organizationId = crypto.randomUUID();
    const email = `${prefix}-${crypto.randomUUID().slice(0, 8)}@example.com`;

    await seedAppUser(ctx.adminSql, id, email);
    await seedOrg(
      ctx.adminSql,
      organizationId,
      `${prefix} org`,
      `${prefix}-${crypto.randomUUID().slice(0, 8)}`,
      id,
      tenantId,
    );
    await seedMember(ctx.adminSql, organizationId, id, role, id);
    await ctx.adminSql`
      UPDATE users
      SET current_organization_id = ${organizationId}::uuid
      WHERE id = ${id}::uuid
    `;

    return {
      id,
      email,
      tenantId,
      organizationId,
      role,
      headers: authHeaders(id, email, tenantId, role),
    };
  }

  async function seedViewer(owner: TestUser): Promise<TestUser> {
    const id = crypto.randomUUID();
    const email = `viewer-${crypto.randomUUID().slice(0, 8)}@example.com`;
    await seedAppUser(ctx.adminSql, id, email);
    await seedMember(
      ctx.adminSql,
      owner.organizationId,
      id,
      'viewer',
      owner.id,
    );
    await ctx.adminSql`
      UPDATE users
      SET current_organization_id = ${owner.organizationId}::uuid
      WHERE id = ${id}::uuid
    `;
    return {
      id,
      email,
      tenantId: owner.tenantId,
      organizationId: owner.organizationId,
      role: 'viewer',
      headers: authHeaders(id, email, owner.tenantId, 'viewer'),
    };
  }

  async function createApp(owner: TestUser): Promise<CreatedApp> {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/generated-apps',
      headers: owner.headers,
      payload: { prompt: '创建一个离线验收表单应用' },
    });
    expect(response.statusCode).toBe(201);
    return parseJson(response).data as CreatedApp;
  }

  async function markPublishCandidate(appId: string) {
    const now = new Date().toISOString();
    const gateResults = GENERATED_APP_GATE_DEFINITIONS.map((gate) => ({
      gateId: gate.gateId,
      order: gate.order,
      name: gate.name,
      blocking: gate.blocking,
      status: 'passed',
      summary: `${gate.gateId} offline evidence passed`,
      evidence: [],
      updatedAt: now,
    }));
    const readiness = {
      state: 'publish_candidate',
      canCreatePublicShare: true,
      blockingIssueCount: 0,
      warningCount: 0,
      summary: '全部阻断门禁已通过',
      blockers: [],
      warnings: [],
    };

    await ctx.adminSql`
      UPDATE generated_apps
      SET status = 'publish_candidate',
          gate_results = ${ctx.adminSql.json(gateResults)},
          readiness = ${ctx.adminSql.json(readiness)}
      WHERE id = ${appId}::uuid
    `;
  }

  async function publishApp(owner: TestUser, appId: string) {
    await markPublishCandidate(appId);
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/generated-apps/${appId}/public-share`,
      headers: owner.headers,
    });
    expect(response.statusCode).toBe(200);
    const published = parseJson(response).data as CreatedApp;
    expect(published.status).toBe('published');
    expect(published.publicShareToken).toMatch(/^[a-f0-9]{64}$/);
    return published.publicShareToken as string;
  }

  /**
   * 按公开详情返回的 runtimeForm 构造一份合法提交。
   * 公开提交现在是 fail-closed 的：未在运行时表单声明的字段一律 422，
   * 因此测试不能再硬编码任意字段名，必须依据服务端声明的契约来填。
   */
  type RuntimeFormField = {
    id: string;
    type: string;
    required: boolean;
    // 选项用 value 作为提交值（不是 id）——写错会得到 undefined，
    // 而 JSON.stringify 会把 undefined 整个键丢掉，表现成「必填项缺失」。
    options: Array<{ value: string; label: string }>;
  };

  async function buildValidSubmissionInput(token: string) {
    const publicApp = await app.inject({
      method: 'GET',
      url: `/api/v1/generated-apps/public/${token}`,
    });
    expect(publicApp.statusCode).toBe(200);

    const fields = parseJson(publicApp).data.runtimeForm
      .fields as RuntimeFormField[];
    const input: Record<string, unknown> = {};

    for (const field of fields) {
      if (!field.required) continue;

      if (field.options.length > 0) {
        input[field.id] = field.options[0].value;
        continue;
      }

      switch (field.type) {
        case 'number':
        case 'range':
          input[field.id] = 1;
          break;
        case 'checkbox':
          input[field.id] = true;
          break;
        default:
          input[field.id] = 'offline E2E';
      }
    }

    expect(Object.keys(input).length).toBeGreaterThan(0);
    return input;
  }

  it('固化 create → 离线 generation run → run/gate 列表 → readiness 核心链', async () => {
    const owner = await seedTenant('generated-owner');
    const created = await createApp(owner);

    expect(created.status).toBe('app_spec_ready');
    expect(created.readiness).toMatchObject({
      state: 'preview',
      canCreatePublicShare: false,
    });

    const prematureShare = await app.inject({
      method: 'POST',
      url: `/api/v1/generated-apps/${created.id}/public-share`,
      headers: owner.headers,
    });
    expect(prematureShare.statusCode).toBe(409);

    const start = await app.inject({
      method: 'POST',
      url: `/api/v1/generated-apps/${created.id}/generation-runs/start`,
      headers: owner.headers,
      payload: { triggerSource: 'manual', maxRepairAttempts: 0 },
    });
    expect(start.statusCode).toBe(201);
    const started = parseJson(start).data;
    expect(started.generationRun).toMatchObject({
      appId: created.id,
      status: 'passed',
      summary: '离线 fake runner 已完成，不调用 LLM',
    });
    expect(startGenerationRun).toHaveBeenCalledOnce();

    const runs = await app.inject({
      method: 'GET',
      url: `/api/v1/generated-apps/${created.id}/generation-runs`,
      headers: owner.headers,
    });
    expect(runs.statusCode).toBe(200);
    expect(parseJson(runs)).toMatchObject({
      meta: { total: 1 },
      data: [{ id: started.generationRun.id, status: 'passed' }],
    });

    const updateRun = await app.inject({
      method: 'PATCH',
      url: `/api/v1/generated-apps/${created.id}/generation-runs/${started.generationRun.id}`,
      headers: owner.headers,
      payload: { summary: '详情已通过更新接口回读' },
    });
    expect(updateRun.statusCode).toBe(200);
    expect(parseJson(updateRun).data).toMatchObject({
      id: started.generationRun.id,
      summary: '详情已通过更新接口回读',
    });

    const gate = await app.inject({
      method: 'POST',
      url: `/api/v1/generated-apps/${created.id}/gate-runs`,
      headers: owner.headers,
      payload: {
        gateId: 'gate-1',
        generationRunId: started.generationRun.id,
        status: 'passed',
        summary: '离线 gate evidence passed',
      },
    });
    expect(gate.statusCode).toBe(201);
    expect(parseJson(gate).data.gateRun).toMatchObject({
      gateId: 'gate-1',
      status: 'passed',
    });

    const gates = await app.inject({
      method: 'GET',
      url: `/api/v1/generated-apps/${created.id}/gate-runs?generationRunId=${started.generationRun.id}`,
      headers: owner.headers,
    });
    expect(gates.statusCode).toBe(200);
    expect(parseJson(gates)).toMatchObject({
      meta: { total: 1 },
      data: [{ gateId: 'gate-1', status: 'passed' }],
    });

    const detail = await app.inject({
      method: 'GET',
      url: `/api/v1/generated-apps/${created.id}`,
      headers: owner.headers,
    });
    expect(detail.statusCode).toBe(200);
    expect(parseJson(detail).data.readiness.canCreatePublicShare).toBe(false);
  });

  it('公开 @Public 路由支持详情、HTML 预览、提交和提交状态查询', async () => {
    const owner = await seedTenant('public-owner');
    const created = await createApp(owner);
    const token = await publishApp(owner, created.id);

    const publicApp = await app.inject({
      method: 'GET',
      url: `/api/v1/generated-apps/public/${token}`,
    });
    expect(publicApp.statusCode).toBe(200);
    expect(parseJson(publicApp).data).toMatchObject({
      token,
      appId: created.id,
      runtimeSurface: {
        kind: 'generated-app',
        previewUrl: `/api/v1/generated-apps/public/${token}/preview`,
      },
    });

    const preview = await app.inject({
      method: 'GET',
      url: `/api/v1/generated-apps/public/${token}/preview`,
    });
    expect(preview.statusCode).toBe(200);
    expect(preview.headers['content-type']).toContain('text/html');
    expect(preview.headers['cache-control']).toBe('no-store');
    expect(preview.body).toBe(PREVIEW_HTML);

    const validInput = await buildValidSubmissionInput(token);
    const submission = await app.inject({
      method: 'POST',
      url: `/api/v1/generated-apps/public/${token}/submissions`,
      payload: {
        anonymousSessionId: 'anonymous-e2e-session',
        input: validInput,
      },
    });
    expect(submission.statusCode).toBe(201);
    const submitted = parseJson(submission).data;
    expect(submitted).toMatchObject({
      appId: created.id,
      anonymousSessionId: 'anonymous-e2e-session',
      input: validInput,
    });
    expect(submitted.id).toMatch(/^[0-9a-f-]{36}$/);

    // 公开提交 fail-closed：未声明字段必须 422，且不得落库。
    const undeclared = await app.inject({
      method: 'POST',
      url: `/api/v1/generated-apps/public/${token}/submissions`,
      payload: {
        anonymousSessionId: 'anonymous-e2e-session',
        input: { ...validInput, topic: 'offline E2E' },
      },
    });
    expect(undeclared.statusCode).toBe(422);

    const status = await app.inject({
      method: 'GET',
      url: `/api/v1/generated-apps/public/${token}/submissions/${submitted.id}`,
    });
    expect(status.statusCode).toBe(200);
    expect(parseJson(status).data).toMatchObject({
      id: submitted.id,
      appId: created.id,
      status: submitted.status,
    });
  });

  it('非法 public token 对详情、预览、提交和状态查询均 fail-closed 为 404', async () => {
    const invalidToken = 'invalid-public-token';
    const submissionId = crypto.randomUUID();
    const requests = [
      app.inject({
        method: 'GET',
        url: `/api/v1/generated-apps/public/${invalidToken}`,
      }),
      app.inject({
        method: 'GET',
        url: `/api/v1/generated-apps/public/${invalidToken}/preview`,
      }),
      app.inject({
        method: 'POST',
        url: `/api/v1/generated-apps/public/${invalidToken}/submissions`,
        payload: { input: {} },
      }),
      app.inject({
        method: 'GET',
        url: `/api/v1/generated-apps/public/${invalidToken}/submissions/${submissionId}`,
      }),
    ];

    const responses = await Promise.all(requests);
    expect(responses.map((response) => response.statusCode)).toEqual([
      404, 404, 404, 404,
    ]);
  });

  it('即使 token 已写入，未发布应用的全部公开路径仍返回 404', async () => {
    const owner = await seedTenant('unpublished-owner');
    const created = await createApp(owner);
    await markPublishCandidate(created.id);
    const token = crypto.randomBytes(32).toString('hex');
    await ctx.adminSql`
      UPDATE generated_apps
      SET public_share_token = ${token}, public_share_enabled = true
      WHERE id = ${created.id}::uuid
    `;

    const submissionId = crypto.randomUUID();
    const responses = await Promise.all([
      app.inject({
        method: 'GET',
        url: `/api/v1/generated-apps/public/${token}`,
      }),
      app.inject({
        method: 'GET',
        url: `/api/v1/generated-apps/public/${token}/preview`,
      }),
      app.inject({
        method: 'POST',
        url: `/api/v1/generated-apps/public/${token}/submissions`,
        payload: { input: {} },
      }),
      app.inject({
        method: 'GET',
        url: `/api/v1/generated-apps/public/${token}/submissions/${submissionId}`,
      }),
    ]);
    expect(responses.map((response) => response.statusCode)).toEqual([
      404, 404, 404, 404,
    ]);
  });

  it('跨租户 owner 读取、修改应用及读取提交记录均不泄露资源', async () => {
    const owner = await seedTenant('tenant-a');
    const foreignOwner = await seedTenant('tenant-b');
    const created = await createApp(owner);
    const token = await publishApp(owner, created.id);

    const submission = await app.inject({
      method: 'POST',
      url: `/api/v1/generated-apps/public/${token}/submissions`,
      payload: { input: await buildValidSubmissionInput(token) },
    });
    expect(submission.statusCode).toBe(201);
    const submissionId = parseJson(submission).data.id as string;

    const read = await app.inject({
      method: 'GET',
      url: `/api/v1/generated-apps/${created.id}`,
      headers: foreignOwner.headers,
    });
    expect(read.statusCode).toBe(404);

    const write = await app.inject({
      method: 'PATCH',
      url: `/api/v1/generated-apps/${created.id}/gates`,
      headers: foreignOwner.headers,
      payload: {
        gateResults: [
          {
            gateId: 'gate-0',
            order: 0,
            name: '需求规格门禁',
            blocking: true,
            status: 'passed',
            summary: 'foreign update must not apply',
            evidence: [],
          },
        ],
      },
    });
    expect(write.statusCode).toBe(404);

    const submissionRead = await app.inject({
      method: 'GET',
      url: `/api/v1/generated-apps/${created.id}/submissions/${submissionId}`,
      headers: foreignOwner.headers,
    });
    expect(submissionRead.statusCode).toBe(404);
  });

  it('viewer 可读但所有 generated-app 写接口返回 403', async () => {
    const owner = await seedTenant('rbac-owner');
    const viewer = await seedViewer(owner);
    const created = await createApp(owner);

    const list = await app.inject({
      method: 'GET',
      url: '/api/v1/generated-apps',
      headers: viewer.headers,
    });
    expect(list.statusCode).toBe(200);
    expect(parseJson(list).data).toEqual([
      expect.objectContaining({ id: created.id }),
    ]);

    const responses = await Promise.all([
      app.inject({
        method: 'POST',
        url: '/api/v1/generated-apps',
        headers: viewer.headers,
        payload: { prompt: 'viewer must not create' },
      }),
      app.inject({
        method: 'POST',
        url: `/api/v1/generated-apps/${created.id}/generation-runs/start`,
        headers: viewer.headers,
        payload: {},
      }),
      app.inject({
        method: 'POST',
        url: `/api/v1/generated-apps/${created.id}/gate-runs`,
        headers: viewer.headers,
        payload: {
          gateId: 'gate-1',
          status: 'passed',
          summary: 'viewer must not record gate',
        },
      }),
      app.inject({
        method: 'POST',
        url: `/api/v1/generated-apps/${created.id}/public-share`,
        headers: viewer.headers,
      }),
    ]);

    expect(responses.map((response) => response.statusCode)).toEqual([
      403, 403, 403, 403,
    ]);
    expect(startGenerationRun).not.toHaveBeenCalled();
  });

  // 当前 controller 没有 GET generation-runs/:runId；运行详情只能由创建/更新响应返回。
  it.todo('新增真实 generation run detail 路由后固化独立详情查询');
});
