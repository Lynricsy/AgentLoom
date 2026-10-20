import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';

import type { DrizzleDB } from '../../../database/database.module';
import type { GeneratedAppSpecV2 } from '../../../database/schema';
import {
  CreateGeneratedAppSchema,
  StartGeneratedAppGenerationRunSchema,
} from '../dto';
import {
  GeneratedAppBindingTargetNotFoundException,
  GeneratedAppNotFoundException,
} from '../generated-app.exceptions';
import { GeneratedAppRepository } from '../generated-app.repository';
import { isAppSpecV2 } from '../types/generated-app.types';
import {
  LlmModelConfigNotFoundException,
  LlmModelConfigValidationException,
} from '../../llm/llm.exceptions';
import {
  TENANT_ID,
  USER_ID,
  createConfigService,
  createGeneratedApp,
  createInsertReturningChain,
  createPublishCandidateReadiness,
  createSelectChain,
  createUpdateReturningChain,
  mockTenantDb,
} from './generated-app-test-support';
import { QA_MODEL_ID, qaAppSpecV2 } from './app-spec-v2.fixtures';

const MODEL_ID = '01a154d7-8c8f-7c7b-87f3-a94220c05251';
const WORKFLOW_ID = '01a15774-77fd-7887-9fcf-5ff62bfb97c2';
const AGENT_ID = '01a15774-0000-7000-8000-000000000001';

// 只有判别字段参与 isAppSpecV2 与公开路由的版本分流；完整 v2 契约见 app-spec-v2.schema.spec.ts
const APP_SPEC_V2 = { version: 2 } as GeneratedAppSpecV2;

const dialect = new PgDialect();

function renderWhere(chain: { where: Mock }) {
  const condition = chain.where.mock.calls[0]?.[0] as SQL;
  return dialect.sqlToQuery(condition);
}

describe('生成应用 v2 创建入参', () => {
  it('创建 DTO 接受模型与两种绑定目标，拒绝未知 kind 和 kind 与 id 不匹配', () => {
    expect(
      CreateGeneratedAppSchema.parse({
        prompt: '问答页面',
        modelConfigId: MODEL_ID,
        bindingTarget: { kind: 'workflow', workflowDefinitionId: WORKFLOW_ID },
      }),
    ).toEqual({
      prompt: '问答页面',
      modelConfigId: MODEL_ID,
      bindingTarget: { kind: 'workflow', workflowDefinitionId: WORKFLOW_ID },
    });
    expect(
      CreateGeneratedAppSchema.parse({
        prompt: '问答页面',
        bindingTarget: { kind: 'agent', agentDefinitionId: AGENT_ID },
      }).bindingTarget,
    ).toEqual({ kind: 'agent', agentDefinitionId: AGENT_ID });

    for (const bindingTarget of [
      { kind: 'tool', workflowDefinitionId: WORKFLOW_ID },
      { kind: 'workflow', agentDefinitionId: AGENT_ID },
      { kind: 'agent', agentDefinitionId: 'not-a-uuid' },
    ]) {
      expect(
        CreateGeneratedAppSchema.safeParse({
          prompt: '问答页面',
          bindingTarget,
        }).success,
      ).toBe(false);
    }
    expect(
      CreateGeneratedAppSchema.safeParse({
        prompt: '问答页面',
        modelConfigId: 'default',
      }).success,
    ).toBe(false);
  });

  it('start DTO 接受可选的 regenerateAppSpec，空请求体不带该字段', () => {
    expect(StartGeneratedAppGenerationRunSchema.parse(undefined)).toEqual({
      triggerSource: 'manual',
      maxRepairAttempts: 3,
      maxRuntimeSeconds: 1800,
    });
    expect(
      StartGeneratedAppGenerationRunSchema.parse({ regenerateAppSpec: true })
        .regenerateAppSpec,
    ).toBe(true);
    expect(
      StartGeneratedAppGenerationRunSchema.safeParse({
        regenerateAppSpec: 'yes',
      }).success,
    ).toBe(false);
  });

  it('isAppSpecV2 只把 version 2 判为 v2，v1 与尚未生成的 null 都不是', () => {
    expect(isAppSpecV2(APP_SPEC_V2)).toBe(true);
    expect(isAppSpecV2(createGeneratedApp().appSpec)).toBe(false);
    expect(isAppSpecV2(null)).toBe(false);
  });
});

describe('GeneratedAppRepository 创建引用校验与公开令牌查找', () => {
  let repository: GeneratedAppRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    mockTenantDb.select.mockReset();
    mockTenantDb.insert.mockReset();
    repository = new GeneratedAppRepository(
      mockTenantDb as unknown as DrizzleDB,
      createConfigService(),
    );
  });

  function mockInsertReturningPayload() {
    const insertChain = createInsertReturningChain([]);
    insertChain.returning.mockImplementation(async () => [
      createGeneratedApp(insertChain.values.mock.calls[0]?.[0]),
    ]);
    mockTenantDb.insert.mockReturnValueOnce(insertChain);
    return insertChain;
  }

  it('指定已发布工作流与 chat 模型时按本租户校验并写入两列', async () => {
    const modelChain = createSelectChain([
      { modelType: 'chat', isEnabled: true },
    ]);
    const workflowChain = createSelectChain([{ id: WORKFLOW_ID }]);
    mockTenantDb.select
      .mockReturnValueOnce(modelChain)
      .mockReturnValueOnce(workflowChain);
    const insertChain = mockInsertReturningPayload();

    const response = await repository.create(TENANT_ID, USER_ID, {
      prompt: '问答页面',
      modelConfigId: MODEL_ID,
      bindingTarget: { kind: 'workflow', workflowDefinitionId: WORKFLOW_ID },
    });

    expect(insertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        generationModelConfigId: MODEL_ID,
        bindingTarget: { kind: 'workflow', workflowDefinitionId: WORKFLOW_ID },
      }),
    );
    expect(response.generationModelConfigId).toBe(MODEL_ID);
    expect(response.bindingTarget).toEqual({
      kind: 'workflow',
      workflowDefinitionId: WORKFLOW_ID,
    });

    const modelQuery = renderWhere(modelChain);
    expect(modelQuery.sql).toContain('"llm_model_configs"."tenant_id" = $2');
    expect(modelQuery.params).toEqual([MODEL_ID, TENANT_ID]);
    const workflowQuery = renderWhere(workflowChain);
    expect(workflowQuery.sql).toContain(
      '"workflow_definitions"."tenant_id" = $2',
    );
    expect(workflowQuery.sql).toContain('"workflow_definitions"."status" = $3');
    expect(workflowQuery.sql).toContain(
      '"workflow_definitions"."published_version_id" is not null',
    );
    expect(workflowQuery.params).toEqual([WORKFLOW_ID, TENANT_ID, 'published']);
  });

  it('未指定模型与绑定目标时不查询引用，两列写 null', async () => {
    const insertChain = mockInsertReturningPayload();

    const response = await repository.create(TENANT_ID, USER_ID, {
      prompt: '问答页面',
    });

    expect(mockTenantDb.select).not.toHaveBeenCalled();
    expect(insertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        generationModelConfigId: null,
        bindingTarget: null,
      }),
    );
    expect(response.generationModelConfigId).toBeNull();
    expect(response.bindingTarget).toBeNull();
  });

  it('绑定目标不存在、跨租户或未发布时返回 422 且不写入应用', async () => {
    const agentChain = createSelectChain([]);
    mockTenantDb.select.mockReturnValueOnce(agentChain);

    const error = await repository
      .create(TENANT_ID, USER_ID, {
        prompt: '问答页面',
        bindingTarget: { kind: 'agent', agentDefinitionId: AGENT_ID },
      })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(GeneratedAppBindingTargetNotFoundException);
    expect(error).toMatchObject({
      type: 'https://agentloom.dev/errors/generated-app-binding-target-not-found',
      detail: expect.stringContaining(`Agent ${AGENT_ID}`),
    });
    expect(
      (error as GeneratedAppBindingTargetNotFoundException).getStatus(),
    ).toBe(422);
    const agentQuery = renderWhere(agentChain);
    expect(agentQuery.sql).toContain('"agent_definitions"."status" = $3');
    expect(agentQuery.sql).toContain(
      '"agent_definitions"."published_version_id" is not null',
    );
    expect(mockTenantDb.insert).not.toHaveBeenCalled();
  });

  it('模型不在本租户时 404，非 chat 或已停用时 400，均不写入应用', async () => {
    mockTenantDb.select.mockReturnValueOnce(createSelectChain([]));
    await expect(
      repository.create(TENANT_ID, USER_ID, {
        prompt: '问答页面',
        modelConfigId: MODEL_ID,
      }),
    ).rejects.toBeInstanceOf(LlmModelConfigNotFoundException);

    for (const model of [
      { modelType: 'embedding', isEnabled: true },
      { modelType: 'chat', isEnabled: false },
    ]) {
      mockTenantDb.select.mockReturnValueOnce(createSelectChain([model]));
      await expect(
        repository.create(TENANT_ID, USER_ID, {
          prompt: '问答页面',
          modelConfigId: MODEL_ID,
        }),
      ).rejects.toBeInstanceOf(LlmModelConfigValidationException);
    }
    expect(mockTenantDb.insert).not.toHaveBeenCalled();
  });

  it('公开令牌命中已发布应用时直接返回，不再按验收令牌查询；AppSpec 版本由公开运行时判断', async () => {
    const publishedApp = createGeneratedApp({
      status: 'published',
      publicShareEnabled: true,
      publicShareToken: 'a'.repeat(64),
      readiness: createPublishCandidateReadiness(),
    });

    for (const appSpec of [APP_SPEC_V2, null]) {
      mockTenantDb.select.mockReturnValueOnce(
        createSelectChain([{ ...publishedApp, appSpec }]),
      );
      await expect(
        repository.findByPublicOrAcceptanceToken('a'.repeat(64)),
      ).resolves.toMatchObject({
        access: 'public',
        appId: publishedApp.id,
        app: { appSpec },
      });
    }
    expect(mockTenantDb.select).toHaveBeenCalledTimes(2);
  });
});

describe('GeneratedAppRepository：AppSpec 由 Gate 0 生成后落库', () => {
  let repository: GeneratedAppRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    mockTenantDb.select.mockReset();
    mockTenantDb.insert.mockReset();
    mockTenantDb.update.mockReset();
    repository = new GeneratedAppRepository(
      mockTenantDb as unknown as DrizzleDB,
      createConfigService(),
    );
  });

  it('创建时不生成模板规格：app_spec 为空、状态 app_spec_generating、门禁全部待运行', async () => {
    const insertChain = createInsertReturningChain([]);
    insertChain.returning.mockImplementation(async () => [
      createGeneratedApp(insertChain.values.mock.calls[0]?.[0]),
    ]);
    mockTenantDb.insert.mockReturnValueOnce(insertChain);

    const response = await repository.create(TENANT_ID, USER_ID, {
      prompt: '一个问答页面：输入问题，调用上述工作流返回答案与引用',
    });

    const values = insertChain.values.mock.calls[0]?.[0];
    expect(values).toMatchObject({
      appSpec: null,
      status: 'app_spec_generating',
      appName: '一个问答页面：输入问题，调用上述工作流返回答案与引用',
      // 门禁都还没运行（没有失败），不能分享但不是 blocked
      readiness: { state: 'preview', canCreatePublicShare: false },
    });
    expect(
      values.gateResults.map((gate: { status: string }) => gate.status),
    ).toEqual(Array(8).fill('pending'));
    expect(response.appSpec).toBeNull();
    expect(response.status).toBe('app_spec_generating');
  });

  it('saveGeneratedAppSpec 写入规格、名称、描述与生成模型，只把 app_spec_generating 推进到 app_spec_ready', async () => {
    const updateChain = createUpdateReturningChain([{ id: 'app-1' }]);
    mockTenantDb.update.mockReturnValueOnce(updateChain);
    const appSpec = qaAppSpecV2();

    await repository.saveGeneratedAppSpec({
      tenantId: TENANT_ID,
      userId: USER_ID,
      appId: 'app-1',
      appSpec,
      generationModelConfigId: QA_MODEL_ID,
    });

    const payload = updateChain.set.mock.calls[0]?.[0];
    expect(payload).toMatchObject({
      appSpec,
      appName: '文档问答',
      description: appSpec.summary,
      generationModelConfigId: QA_MODEL_ID,
      updatedBy: USER_ID,
    });
    expect(dialect.sqlToQuery(payload.status as SQL).sql).toBe(
      `CASE WHEN "generated_apps"."status" = 'app_spec_generating' THEN 'app_spec_ready'::generated_app_status ELSE "generated_apps"."status" END`,
    );
    const where = renderWhere(updateChain);
    expect(where.sql).toContain('"generated_apps"."tenant_id" = $1');
    expect(where.params).toEqual([TENANT_ID, 'app-1']);
  });

  it('saveGeneratedAppSpec 在应用已被删除时抛 404', async () => {
    mockTenantDb.update.mockReturnValueOnce(createUpdateReturningChain([]));

    await expect(
      repository.saveGeneratedAppSpec({
        tenantId: TENANT_ID,
        userId: USER_ID,
        appId: 'app-1',
        appSpec: qaAppSpecV2(),
        generationModelConfigId: QA_MODEL_ID,
      }),
    ).rejects.toBeInstanceOf(GeneratedAppNotFoundException);
  });
});
