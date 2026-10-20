import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import * as crypto from 'node:crypto';
import * as jwt from 'jsonwebtoken';

import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { RedisCacheService } from '../src/common/redis/redis-cache.service';
import { REDIS_CLIENT } from '../src/common/redis/redis.constants';
import { createMockRedisClient } from './support/redis-client.mock';
import { RedisPubSubService } from '../src/common/redis/redis-pubsub.service';
import { ZodValidationPipe } from '../src/common/pipes/zod-validation.pipe';
import { DRIZZLE } from '../src/database/database.module';
import { SupabaseService } from '../src/modules/auth/supabase/supabase.service';
import {
  GENERATED_APP_GENERATION_QUEUE,
  type GeneratedAppGenerationJobData,
} from '../src/modules/generated-app/generated-app-generation.constants';
import { GeneratedAppGenerationPipelineService } from '../src/modules/generated-app/generated-app-generation-pipeline.service';
import { GeneratedAppGenerationWorker } from '../src/modules/generated-app/generated-app-generation.worker';
import { GeneratedAppSpecGeneratorService } from '../src/modules/generated-app/generated-app-spec-generator.service';
import { GENERATED_APP_GATE_DEFINITIONS } from '../src/modules/generated-app/generated-app.gates';
import {
  GeneratedAppSpecV2Schema,
  type GeneratedAppSpecV2,
} from '../src/modules/generated-app/types/app-spec-v2.schema';
import type {
  AppSpecGenerationInput,
  AppSpecGenerationResult,
} from '../src/modules/generated-app/types/generation-v2.ports';
import {
  createRlsTestContext,
  seedAppUser,
  seedMember,
  seedOrg,
  type OrganizationRole,
  type RlsTestContext,
} from './rls/rls-test-utils';

const JWT_SECRET = 'test-e2e-jwt-secret';
const PROMPT = '一个问答页面：输入问题，调用上述工作流返回答案与引用';
const TERMINAL_RUN_STATUSES = ['passed', 'failed', 'cancelled'];

type TestUser = {
  id: string;
  email: string;
  tenantId: string;
  organizationId: string;
  role: OrganizationRole;
  headers: Record<string, string>;
  modelConfigId: string;
};

type CreatedApp = {
  id: string;
  status: string;
  readiness: { state: string; canCreatePublicShare: boolean };
  publicShareToken: string | null;
  generationRunId: string;
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

/** 模型生成结果的替身：S2 场景的 AppSpec v2，绑定一个文档问答工作流的固定版本 */
function buildAppSpec(modelConfigId: string): GeneratedAppSpecV2 {
  const workflowDefinitionId = crypto.randomUUID();
  const workflowVersionId = crypto.randomUUID();
  return GeneratedAppSpecV2Schema.parse({
    version: 2,
    appName: '文档问答',
    summary: '输入问题，调用文档问答工作流返回答案与引用。',
    userGoal: '终端用户提问并得到带引用的答案',
    actors: ['终端用户'],
    coreRequirements: [
      { id: 'req-ask', text: '输入问题并返回答案与引用', source: 'prompt' },
    ],
    pages: [
      {
        id: 'public-runtime',
        name: '公开运行页',
        purpose: '填写表单并查看结果',
      },
    ],
    inputForm: {
      title: '提问',
      submitLabel: '提问',
      fields: [
        {
          id: 'question',
          label: '问题',
          type: 'textarea',
          required: true,
          maxLength: 2000,
        },
      ],
    },
    resultView: {
      title: '回答',
      sections: [
        { id: 'answer', label: '答案', format: 'markdown' },
        { id: 'citations', label: '引用', format: 'citations' },
      ],
    },
    binding: {
      kind: 'workflow',
      workflowDefinitionId,
      workflowVersionId,
      inputMapping: [{ fieldId: 'question', workflowInputFieldId: 'question' }],
      outputMapping: [
        { sectionId: 'answer', nodeId: 'out-answer' },
        { sectionId: 'citations', nodeId: 'out-structured', path: 'citations' },
      ],
    },
    dataPolicy: {
      publicSubmissionsPersisted: true,
      creatorCanDeleteSubmissions: true,
      endUserLoginRequired: false,
    },
    nonGoals: ['不生成自定义后端或新工作流。'],
    acceptanceScenarios: [
      {
        id: 'scenario-ask',
        title: '提问后看到答案与引用',
        scope: 'requirement',
        requirementIds: ['req-ask'],
        given: ['公开页已打开'],
        when: ['输入问题并提交'],
        then: ['展示答案', '展示引用'],
        browserSteps: [
          { action: 'fill', fieldId: 'question', value: '最多几个子 Agent？' },
          { action: 'submit' },
          {
            action: 'expectResult',
            sectionId: 'answer',
            assertion: 'nonEmpty',
          },
          {
            action: 'expectResult',
            sectionId: 'citations',
            assertion: 'nonEmpty',
          },
        ],
      },
    ],
    traceability: [
      {
        requirementId: 'req-ask',
        scenarioIds: ['scenario-ask'],
        fieldIds: ['question'],
        sectionIds: ['answer', 'citations'],
      },
    ],
    generation: {
      modelConfigId,
      generatedAt: new Date().toISOString(),
      attempt: 1,
      promptSha256: crypto.createHash('sha256').update(PROMPT).digest('hex'),
    },
  });
}

describe('Generated App v2 (E2E)', () => {
  let ctx: RlsTestContext;
  let app: NestFastifyApplication;
  let pipeline: GeneratedAppGenerationPipelineService;
  let workspaceRoot: string;
  const modelConfigByTenant = new Map<string, string>();
  const pendingRuns: Array<Promise<void>> = [];

  /** Gate 0 的模型替身：不调用 LLM，返回 S2 规格与已解析的工作流绑定 */
  const generate = vi.fn(
    async (
      request: AppSpecGenerationInput,
    ): Promise<AppSpecGenerationResult> => {
      const modelConfigId = modelConfigByTenant.get(request.tenantId);
      if (!modelConfigId) throw new Error('测试租户没有种子模型');
      const appSpec = buildAppSpec(modelConfigId);
      if (appSpec.binding.kind !== 'workflow')
        throw new Error('绑定应为工作流');
      return {
        status: 'generated',
        appSpec,
        resolvedBinding: {
          kind: 'workflow',
          binding: appSpec.binding,
          candidate: {
            kind: 'workflow',
            workflowDefinitionId: appSpec.binding.workflowDefinitionId,
            workflowVersionId: appSpec.binding.workflowVersionId,
            name: 'e2e 文档问答',
            description: null,
            inputSchema: {
              version: 2,
              collectionMode: 'form',
              fields: [
                { id: 'question', type: 'text', label: '问题', required: true },
              ],
            },
            outputNodes: [
              { nodeId: 'out-answer', nodeType: 'text-output', label: '答案' },
              {
                nodeId: 'out-structured',
                nodeType: 'json-output',
                label: '结构化答案',
              },
            ],
          },
        },
        modelConfigId,
        attempts: 1,
        usage: { promptTokens: 10, completionTokens: 20 },
      };
    },
  );

  /** 生成队列替身：入队即在本进程执行该运行（与 worker 调用同一个 executeRun） */
  const queueAdd = vi.fn(
    async (_name: string, data: GeneratedAppGenerationJobData) => {
      pendingRuns.push(
        new Promise<void>((resolve) => setImmediate(resolve)).then(() =>
          pipeline.executeRun(data),
        ),
      );
      return { id: data.generationRunId };
    },
  );

  beforeAll(async () => {
    process.env.APP_JWT_SECRET = JWT_SECRET;
    workspaceRoot = await mkdtemp(join(tmpdir(), 'e2e-generated-app-'));
    process.env.GENERATED_APP_WORKSPACE_ROOT = workspaceRoot;
    // e2e 库里没有真实发布的工作流：Gate 4 用 fixture 跳过租户复核，Gate 5 禁用，运行在 Gate 5 停止
    process.env.GENERATED_APP_GATE4_EXECUTOR_MODE = 'fixture';
    process.env.GENERATED_APP_GATE5_EXECUTOR_MODE = 'disabled';
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
      .overrideProvider(GeneratedAppSpecGeneratorService)
      .useValue({ generate })
      .overrideProvider(getQueueToken(GENERATED_APP_GENERATION_QUEUE))
      .useValue({ add: queueAdd })
      // 队列已换成同进程执行的替身，不再启动 BullMQ worker 消费真实队列
      .overrideProvider(GeneratedAppGenerationWorker)
      .useValue({})
      .compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalPipes(new ZodValidationPipe());

    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    pipeline = app.get(GeneratedAppGenerationPipelineService);
  }, 120_000);

  afterAll(async () => {
    await Promise.allSettled(pendingRuns);
    await app?.close();
    await ctx?.close();
    await rm(workspaceRoot, { recursive: true, force: true });
    delete process.env.GENERATED_APP_WORKSPACE_ROOT;
    delete process.env.GENERATED_APP_GATE4_EXECUTOR_MODE;
    delete process.env.GENERATED_APP_GATE5_EXECUTOR_MODE;
  });

  beforeEach(async () => {
    await Promise.allSettled(pendingRuns.splice(0));
    await ctx.adminSql`DELETE FROM generated_app_gate_runs`;
    await ctx.adminSql`DELETE FROM generated_app_repair_attempts`;
    await ctx.adminSql`DELETE FROM generated_app_submissions`;
    await ctx.adminSql`UPDATE generated_apps SET acceptance_generation_run_id = NULL`;
    await ctx.adminSql`DELETE FROM generated_app_generation_runs`;
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
    // Gate 0 落库时 generation_model_config_id 外键指向本租户的 chat 模型
    const [provider] = await ctx.adminSql<{ id: string }[]>`
      INSERT INTO llm_providers (org_id, tenant_id, slug, name, base_url, api_protocol)
      VALUES (${organizationId}::uuid, ${tenantId}::uuid, 'custom', 'E2E Chat',
              'http://127.0.0.1:9/v1', 'openai_chat')
      RETURNING id
    `;
    const [model] = await ctx.adminSql<{ id: string }[]>`
      INSERT INTO llm_model_configs (org_id, tenant_id, provider_id, name, model_id)
      VALUES (${organizationId}::uuid, ${tenantId}::uuid, ${provider.id}::uuid,
              'E2E Chat Model', 'e2e-chat-model')
      RETURNING id
    `;
    modelConfigByTenant.set(tenantId, model.id);

    return {
      id,
      email,
      tenantId,
      organizationId,
      role,
      headers: authHeaders(id, email, tenantId, role),
      modelConfigId: model.id,
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
      ...owner,
      id,
      email,
      role: 'viewer',
      headers: authHeaders(id, email, owner.tenantId, 'viewer'),
    };
  }

  async function createApp(owner: TestUser): Promise<CreatedApp> {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/generated-apps',
      headers: owner.headers,
      payload: { prompt: PROMPT },
    });
    expect(response.statusCode).toBe(201);
    return parseJson(response).data as CreatedApp;
  }

  /** 等待已入队的运行在本进程执行完，并确认运行已落终态 */
  async function waitForRun(runId: string) {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      await Promise.allSettled(pendingRuns);
      const [run] = await ctx.adminSql<
        { status: string; failure_reason: string | null }[]
      >`
        SELECT status, failure_reason
        FROM generated_app_generation_runs
        WHERE id = ${runId}::uuid
      `;
      if (run && TERMINAL_RUN_STATUSES.includes(run.status)) return run;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error(`生成运行 ${runId} 没有进入终态`);
  }

  /** 生成到 Gate 5 后，用管理员 SQL 把门禁置为全部通过，模拟已签收的发布候选 */
  async function createPublishCandidate(owner: TestUser) {
    const created = await createApp(owner);
    await waitForRun(created.generationRunId);
    const now = new Date().toISOString();
    const gateResults = GENERATED_APP_GATE_DEFINITIONS.map((gate) => ({
      gateId: gate.gateId,
      order: gate.order,
      name: gate.name,
      blocking: gate.blocking,
      status: 'passed',
      summary: `${gate.gateId} passed`,
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
      WHERE id = ${created.id}::uuid
    `;
    return created;
  }

  async function publishApp(owner: TestUser) {
    const created = await createPublishCandidate(owner);
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/generated-apps/${created.id}/public-share`,
      headers: owner.headers,
    });
    expect(response.statusCode).toBe(200);
    const published = parseJson(response).data as CreatedApp;
    expect(published.status).toBe('published');
    expect(published.publicShareToken).toMatch(/^[a-f0-9]{64}$/);
    return { created, token: published.publicShareToken as string };
  }

  it('创建即排队首次生成运行：201 app_spec_generating，进行中重复 start 409，worker 执行 Gate 0–5', async () => {
    const owner = await seedTenant('generated-owner');
    const created = await createApp(owner);

    expect(created.status).toBe('app_spec_generating');
    expect(created.readiness).toMatchObject({
      state: 'preview',
      canCreatePublicShare: false,
    });
    expect(created.generationRunId).toMatch(/^[0-9a-f-]{36}$/);
    expect(queueAdd).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        appId: created.id,
        generationRunId: created.generationRunId,
        regenerateAppSpec: false,
      }),
      { jobId: created.generationRunId },
    );

    const duplicate = await app.inject({
      method: 'POST',
      url: `/api/v1/generated-apps/${created.id}/generation-runs/start`,
      headers: owner.headers,
      payload: {},
    });
    expect(duplicate.statusCode).toBe(409);
    expect(parseJson(duplicate).type).toContain(
      'generated-app-generation-run-in-progress',
    );

    const run = await waitForRun(created.generationRunId);
    expect(run.status).toBe('failed');
    expect(run.failure_reason).toContain('Gate 5');
    expect(generate).toHaveBeenCalledOnce();

    const gates = await app.inject({
      method: 'GET',
      url: `/api/v1/generated-apps/${created.id}/gate-runs?generationRunId=${created.generationRunId}&pageSize=20`,
      headers: owner.headers,
    });
    expect(gates.statusCode).toBe(200);
    const gateStatuses = Object.fromEntries(
      (parseJson(gates).data as Array<{ gateId: string; status: string }>).map(
        (gate) => [gate.gateId, gate.status],
      ),
    );
    expect(gateStatuses).toEqual({
      'gate-0': 'passed',
      'gate-1': 'passed',
      'gate-2': 'passed',
      'gate-3': 'passed',
      'gate-4': 'passed',
      'gate-5': 'failed',
    });

    const detail = await app.inject({
      method: 'GET',
      url: `/api/v1/generated-apps/${created.id}`,
      headers: owner.headers,
    });
    expect(detail.statusCode).toBe(200);
    const detailData = parseJson(detail).data;
    expect(detailData.appSpec).toMatchObject({
      version: 2,
      appName: '文档问答',
    });
    expect(detailData.generationModelConfigId).toBe(owner.modelConfigId);
    expect(detailData.generationPlan).toMatchObject({
      planVersion: 2,
      generationRunId: created.generationRunId,
    });
    expect(detailData.readiness.canCreatePublicShare).toBe(false);

    const repairs = await app.inject({
      method: 'GET',
      url: `/api/v1/generated-apps/${created.id}/generation-runs/${created.generationRunId}/repair-attempts`,
      headers: owner.headers,
    });
    expect(repairs.statusCode).toBe(200);
    expect(parseJson(repairs).data).toEqual([
      expect.objectContaining({ targetGateId: 'gate-5', status: 'failed' }),
    ]);

    const artifacts = await app.inject({
      method: 'GET',
      url: `/api/v1/generated-apps/${created.id}/artifacts`,
      headers: owner.headers,
    });
    expect(artifacts.statusCode).toBe(200);
    const manifest = parseJson(artifacts).data;
    expect(manifest.workspace).toMatchObject({
      executionLevel: 'real',
      materialized: true,
    });
    expect(manifest.artifacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: 'src/generated-app/app-spec.ts',
          materialized: true,
          readable: true,
        }),
      ]),
    );

    // 上一次运行结束后可以再次 start：202 queued，复用已存规格不再调用模型
    const restart = await app.inject({
      method: 'POST',
      url: `/api/v1/generated-apps/${created.id}/generation-runs/start`,
      headers: owner.headers,
      payload: {},
    });
    expect(restart.statusCode).toBe(202);
    const restarted = parseJson(restart).data.generationRun;
    expect(restarted).toMatchObject({ status: 'queued', runNumber: 2 });
    await waitForRun(restarted.id);
    expect(generate).toHaveBeenCalledOnce();
  });

  it('公开路由按 AppSpec v2 渲染表单、校验提交并返回提交状态', async () => {
    const owner = await seedTenant('public-owner');
    const { created, token } = await publishApp(owner);

    const publicApp = await app.inject({
      method: 'GET',
      url: `/api/v1/generated-apps/public/${token}`,
    });
    expect(publicApp.statusCode).toBe(200);
    const publicData = parseJson(publicApp).data;
    expect(publicData).toMatchObject({
      token,
      appId: created.id,
      title: '文档问答',
      runtimeSurface: { kind: 'generated-app', previewUrl: null },
    });
    expect(
      (publicData.runtimeForm.fields as Array<{ id: string }>).map(
        (field) => field.id,
      ),
    ).toEqual(['question']);

    const submission = await app.inject({
      method: 'POST',
      url: `/api/v1/generated-apps/public/${token}/submissions`,
      payload: {
        anonymousSessionId: 'anonymous-e2e-session',
        input: { question: '最多几个子 Agent？' },
      },
    });
    expect(submission.statusCode).toBe(201);
    const submitted = parseJson(submission).data;
    // 绑定的工作流不在 e2e 库中：提交照常落库为 failed，公开端只看到通用原因
    expect(submitted).toMatchObject({
      appId: created.id,
      anonymousSessionId: 'anonymous-e2e-session',
      input: { question: '最多几个子 Agent？' },
      status: 'failed',
    });

    const undeclared = await app.inject({
      method: 'POST',
      url: `/api/v1/generated-apps/public/${token}/submissions`,
      payload: { input: { question: '问题', topic: '未声明字段' } },
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
      status: 'failed',
    });
  });

  it('非法 public token 与已删除的 v1 构建预览路由均返回 404', async () => {
    const invalidToken = 'invalid-public-token';
    const responses = await Promise.all([
      app.inject({
        method: 'GET',
        url: `/api/v1/generated-apps/public/${invalidToken}`,
      }),
      app.inject({
        method: 'GET',
        url: `/api/v1/generated-apps/public/${'a'.repeat(64)}/preview`,
      }),
      app.inject({
        method: 'POST',
        url: `/api/v1/generated-apps/public/${invalidToken}/submissions`,
        payload: { input: {} },
      }),
      app.inject({
        method: 'GET',
        url: `/api/v1/generated-apps/public/${invalidToken}/submissions/${crypto.randomUUID()}`,
      }),
    ]);
    expect(responses.map((response) => response.statusCode)).toEqual([
      404, 404, 404, 404,
    ]);
  });

  it('即使 token 已写入，未发布应用的公开路径仍返回 404', async () => {
    const owner = await seedTenant('unpublished-owner');
    const created = await createPublishCandidate(owner);
    const token = crypto.randomBytes(32).toString('hex');
    await ctx.adminSql`
      UPDATE generated_apps
      SET public_share_token = ${token}, public_share_enabled = true
      WHERE id = ${created.id}::uuid
    `;

    const responses = await Promise.all([
      app.inject({
        method: 'GET',
        url: `/api/v1/generated-apps/public/${token}`,
      }),
      app.inject({
        method: 'POST',
        url: `/api/v1/generated-apps/public/${token}/submissions`,
        payload: { input: { question: '问题' } },
      }),
      app.inject({
        method: 'GET',
        url: `/api/v1/generated-apps/public/${token}/submissions/${crypto.randomUUID()}`,
      }),
    ]);
    expect(responses.map((response) => response.statusCode)).toEqual([
      404, 404, 404,
    ]);
  });

  it('跨租户 owner 读取、修改、启动应用及读取提交记录均不泄露资源', async () => {
    const owner = await seedTenant('tenant-a');
    const foreignOwner = await seedTenant('tenant-b');
    const { created, token } = await publishApp(owner);

    const submission = await app.inject({
      method: 'POST',
      url: `/api/v1/generated-apps/public/${token}/submissions`,
      payload: { input: { question: '问题' } },
    });
    expect(submission.statusCode).toBe(201);
    const submissionId = parseJson(submission).data.id as string;

    const responses = await Promise.all([
      app.inject({
        method: 'GET',
        url: `/api/v1/generated-apps/${created.id}`,
        headers: foreignOwner.headers,
      }),
      app.inject({
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
      }),
      app.inject({
        method: 'POST',
        url: `/api/v1/generated-apps/${created.id}/generation-runs/start`,
        headers: foreignOwner.headers,
        payload: {},
      }),
      app.inject({
        method: 'GET',
        url: `/api/v1/generated-apps/${created.id}/submissions/${submissionId}`,
        headers: foreignOwner.headers,
      }),
    ]);
    expect(responses.map((response) => response.statusCode)).toEqual([
      404, 404, 404, 404,
    ]);
  });

  it('viewer 可读但所有 generated-app 写接口返回 403，且不会排队运行', async () => {
    const owner = await seedTenant('rbac-owner');
    const viewer = await seedViewer(owner);
    const created = await createApp(owner);
    await waitForRun(created.generationRunId);
    vi.clearAllMocks();

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
    expect(queueAdd).not.toHaveBeenCalled();
  });
});
