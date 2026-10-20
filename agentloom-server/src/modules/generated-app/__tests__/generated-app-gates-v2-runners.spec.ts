import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from 'vitest';

import type { DrizzleDB } from '../../../database/database.module';
import { WorkflowNotPublishedException } from '../../execution/execution.exceptions';
import { generatedAppRuntimeFormBuilder } from '../generated-app.runtime';
import {
  buildAgentWrapperWorkflowGraph,
  mapGeneratedAppSubmission,
} from '../generated-app.runtime-binding.util';
import { GeneratedAppGate3WorkspaceRunner } from '../generated-app.gate3-workspace';
import { GeneratedAppGate4IntegrationRunner } from '../generated-app.gate4-integration';
import {
  computeAppSpecSha256,
  toPinnedBinding,
} from '../generated-app.gate-v2.util';
import type { GeneratedAppSpecV2 } from '../types/app-spec-v2.schema';
import type {
  GeneratedAppBindingResolver,
  GeneratedAppGateContextV2,
} from '../types/generation-v2.ports';
import {
  APP_ID,
  GENERATION_RUN_ID,
  TENANT_ID,
  USER_ID,
  V2_AGENT_DEFINITION_ID,
  V2_AGENT_VERSION_ID,
  V2_MODEL_CONFIG_ID,
  WORKFLOW_DEFINITION_ID,
  WORKFLOW_VERSION_ID,
  createAgentAppSpecV2Fixture,
  createAppSpecV2Fixture,
  createConfigService,
  createResolvedBindingFixture,
  createWorkflowBindingCandidateFixture,
} from './generated-app-test-support';

function context(
  appSpec: GeneratedAppSpecV2 = createAppSpecV2Fixture(),
  resolvedBinding = createResolvedBindingFixture(appSpec),
): GeneratedAppGateContextV2 {
  return {
    tenantId: TENANT_ID,
    userId: USER_ID,
    appId: APP_ID,
    generationRunId: GENERATION_RUN_ID,
    appSpec,
    resolvedBinding,
    previousGates: [],
    generationPlan: {
      planVersion: 2,
      generationRunId: GENERATION_RUN_ID,
      appSpecSha256: computeAppSpecSha256(appSpec),
      binding: toPinnedBinding(appSpec),
      coverage: {
        requirements: [],
        unassertedSectionIds: [],
        untouchedFieldIds: [],
      },
    },
    signal: new AbortController().signal,
  };
}

describe('Gate 3 工作区物化与 contract 测试', () => {
  let workspaceRoot: string;

  beforeEach(async () => {
    workspaceRoot = await mkdtemp(join(tmpdir(), 'gate3-v2-'));
  });

  afterEach(async () => {
    await rm(workspaceRoot, { recursive: true, force: true });
  });

  function runner(overrides: Record<string, string> = {}) {
    return new GeneratedAppGate3WorkspaceRunner(
      createConfigService({
        GENERATED_APP_WORKSPACE_ROOT: workspaceRoot,
        ...overrides,
      }),
      generatedAppRuntimeFormBuilder,
      { mapSubmission: mapGeneratedAppSubmission },
      { buildAgentWrapperWorkflowGraph },
    );
  }

  it('物化 app-spec.ts / runtime-form.ts，场景提交与反例都按真实校验器判定', async () => {
    const evaluation = await runner().run(context());

    expect(evaluation.status).toBe('passed');
    expect(
      evaluation.plan?.contractCases.map(
        (item) => `${item.caseId}:${item.passed}`,
      ),
    ).toEqual([
      'scenario-ask:submission:true',
      'reject-unknown-field:true',
      'reject-missing-required:question:true',
    ]);
    const relativePath = evaluation.plan?.workspace?.relativePath ?? '';
    expect(relativePath).toBe(
      `tenants/${TENANT_ID}/apps/${APP_ID}/runs/${GENERATION_RUN_ID}`,
    );
    const appSpecSource = await readFile(
      join(workspaceRoot, relativePath, 'src/generated-app/app-spec.ts'),
      'utf8',
    );
    expect(appSpecSource).toContain('"workflowVersionId"');
    const form = await readFile(
      join(workspaceRoot, relativePath, 'src/generated-app/runtime-form.ts'),
      'utf8',
    );
    expect(form).toContain('"question"');
    expect(JSON.stringify(evaluation.evidence)).not.toContain(workspaceRoot);
  });

  it('场景填写值超过字段长度时 contract 用例失败 → gate-3-command-failed', async () => {
    const base = createAppSpecV2Fixture();
    // 跳过 schema 构造：直接把场景值改成超长，模拟规格与表单上限不一致
    const appSpec = structuredClone(base);
    const step = appSpec.acceptanceScenarios[0].browserSteps[0];
    if (step.action === 'fill') step.value = 'x'.repeat(2001);

    const evaluation = await runner().run(context(appSpec));

    expect(evaluation.status).toBe('failed');
    expect(evaluation.failure?.code).toBe('gate-3-command-failed');
    expect(evaluation.plan?.contractCases[0]).toMatchObject({
      caseId: 'scenario-ask:submission',
      passed: false,
    });
  });

  it('投影后的 inputParams 不满足工作流 inputSchema 时失败', async () => {
    const appSpec = createAppSpecV2Fixture();
    const resolved = createResolvedBindingFixture(appSpec);
    const candidate = createWorkflowBindingCandidateFixture({
      inputSchema: {
        version: 3,
        collectionMode: 'form',
        fields: [
          {
            id: 'question',
            type: 'text',
            label: '问题',
            required: true,
            validation: { maxLength: 5 },
          },
        ],
      },
    });

    const evaluation = await runner().run(
      context(
        appSpec,
        resolved.kind === 'workflow' ? { ...resolved, candidate } : resolved,
      ),
    );

    expect(evaluation.failure?.code).toBe('gate-3-command-failed');
    expect(evaluation.failure?.message).toContain('inputSchema');
  });

  it('Agent 绑定按包装工作流的 inputSchema 做投影校验', async () => {
    const evaluation = await runner().run(
      context(createAgentAppSpecV2Fixture()),
    );

    expect(evaluation.status).toBe('passed');
    expect(evaluation.plan?.contractCases[0]).toMatchObject({ passed: true });
  });

  it('disabled 失败且不写工作区；fixture 通过但标记未执行', async () => {
    const disabled = await runner({
      GENERATED_APP_GATE3_EXECUTOR_MODE: 'disabled',
    }).run(context());
    const fixture = await runner({
      GENERATED_APP_GATE3_EXECUTOR_MODE: 'fixture',
    }).run(context());

    expect(disabled.failure?.code).toBe('gate-3-executor-disabled');
    expect(disabled.plan?.workspace).toBeNull();
    expect(fixture.status).toBe('passed');
    expect(fixture.plan).toMatchObject({
      executionLevel: 'fixture',
      workspace: null,
    });
  });
});

describe('Gate 4 绑定复核', () => {
  type Row = Record<string, unknown>;

  /**
   * 按 select 调用顺序返回结果：定义、版本、（Agent 的）模型配置，最后是创建者角色。
   * 测试里没有租户事务，Gate 4 的租户读与成员读落到同一个连接上。
   */
  function queueSelects(results: Row[][]) {
    const remaining = [...results];
    return () => {
      const rows = remaining.shift() ?? [];
      const chain = {
        from: () => chain,
        innerJoin: () => chain,
        where: () =>
          Object.assign(Promise.resolve(rows), { limit: async () => rows }),
        limit: async () => rows,
      };
      return chain;
    };
  }

  function runner(params: {
    tenantSelects: Row[][];
    role?: string | null;
    resolver?: GeneratedAppBindingResolver['resolve'];
    ensureRuntimeWorkflow?: Mock;
  }) {
    const db = {
      select: vi.fn(
        queueSelects([
          ...params.tenantSelects,
          params.role === null ? [] : [{ role: params.role ?? 'creator' }],
        ]),
      ),
    };
    const ensureRuntimeWorkflow =
      params.ensureRuntimeWorkflow ??
      vi.fn().mockResolvedValue({
        workflowDefinitionId: WORKFLOW_DEFINITION_ID,
        workflowVersionId: WORKFLOW_VERSION_ID,
      });
    return {
      ensureRuntimeWorkflow,
      gate4: new GeneratedAppGate4IntegrationRunner(
        db as unknown as DrizzleDB,
        createConfigService(),
        {
          listCandidates: vi.fn(),
          resolve:
            params.resolver ??
            vi.fn(async () => ({
              ok: true as const,
              resolved: createResolvedBindingFixture(),
            })),
        },
        { ensureRuntimeWorkflow },
      ),
    };
  }

  const publishedWorkflow = [
    { status: 'published', publishedVersionId: WORKFLOW_VERSION_ID },
  ];
  const pinnedVersion = [{ id: WORKFLOW_VERSION_ID }];

  it('工作流仍发布、固定版本仍是当前版本、创建者可执行 → 通过且不创建包装工作流', async () => {
    const { gate4, ensureRuntimeWorkflow } = runner({
      tenantSelects: [publishedWorkflow, pinnedVersion],
    });

    const evaluation = await gate4.run(context());

    expect(evaluation.status).toBe('passed');
    expect(evaluation.plan?.checks.map((check) => check.check)).toEqual([
      'target-published',
      'pinned-version-exists',
      'pinned-version-current',
      'mapping-compatible',
      'creator-can-execute',
    ]);
    expect(ensureRuntimeWorkflow).not.toHaveBeenCalled();
  });

  it('源工作流在生成中重新发布 → binding-drifted', async () => {
    const { gate4 } = runner({
      tenantSelects: [
        [{ status: 'published', publishedVersionId: 'another-version' }],
        pinnedVersion,
      ],
    });

    const evaluation = await gate4.run(context());

    expect(evaluation.failure?.code).toBe('binding-drifted');
    expect(evaluation.failure?.message).toContain(
      '当前发布版本 another-version',
    );
  });

  it('工作流已归档 → binding-unavailable（优先于 drift）', async () => {
    const { gate4 } = runner({
      tenantSelects: [
        [{ status: 'archived', publishedVersionId: null }],
        pinnedVersion,
      ],
    });

    const evaluation = await gate4.run(context());

    expect(evaluation.failure?.code).toBe('binding-unavailable');
  });

  it('映射与快照不再兼容（resolver 报问题）→ binding-drifted', async () => {
    const { gate4 } = runner({
      tenantSelects: [publishedWorkflow, pinnedVersion],
      resolver: vi.fn(async () => ({
        ok: false as const,
        issues: [{ path: ['binding'], message: '工作流输入 question 已删除' }],
      })),
    });

    const evaluation = await gate4.run(context());

    expect(evaluation.failure).toMatchObject({
      code: 'binding-drifted',
      message: '工作流输入 question 已删除',
    });
  });

  it.each([
    [null, '创建者已不是该租户成员'],
    ['viewer', 'viewer'],
  ])('创建者角色 %s → binding-unavailable', async (role, message) => {
    const { gate4 } = runner({
      tenantSelects: [publishedWorkflow, pinnedVersion],
      role,
    });

    const evaluation = await gate4.run(context());

    expect(evaluation.failure?.code).toBe('binding-unavailable');
    expect(evaluation.failure?.message).toContain(message);
  });

  it('Agent 绑定：模型配置停用时失败且不创建包装工作流', async () => {
    const snapshot = {
      nodes: [
        {
          id: 'm',
          type: 'llm-model',
          position: { x: 0, y: 0 },
          data: { llmConfigId: V2_MODEL_CONFIG_ID },
        },
      ],
      edges: [],
    };
    const { gate4, ensureRuntimeWorkflow } = runner({
      tenantSelects: [
        [{ status: 'published', publishedVersionId: V2_AGENT_VERSION_ID }],
        [{ snapshot }],
        [],
      ],
    });

    const evaluation = await gate4.run(context(createAgentAppSpecV2Fixture()));

    expect(evaluation.failure?.code).toBe('binding-unavailable');
    expect(evaluation.failure?.message).toContain(
      `模型配置 ${V2_MODEL_CONFIG_ID} 不存在或已停用`,
    );
    expect(ensureRuntimeWorkflow).not.toHaveBeenCalled();
  });

  it('Agent 绑定全部可用时创建并发布包装工作流；发布校验失败转为 binding-unavailable', async () => {
    const snapshot = { nodes: [], edges: [] };
    const ok = runner({
      tenantSelects: [
        [{ status: 'published', publishedVersionId: V2_AGENT_VERSION_ID }],
        [{ snapshot }],
      ],
    });
    const passed = await ok.gate4.run(context(createAgentAppSpecV2Fixture()));

    expect(passed.status).toBe('passed');
    expect(ok.ensureRuntimeWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({
        appId: APP_ID,
        generationRunId: GENERATION_RUN_ID,
      }),
    );

    const rejected = runner({
      tenantSelects: [
        [{ status: 'published', publishedVersionId: V2_AGENT_VERSION_ID }],
        [{ snapshot }],
      ],
      ensureRuntimeWorkflow: vi
        .fn()
        .mockRejectedValue(
          new WorkflowNotPublishedException(V2_AGENT_DEFINITION_ID),
        ),
    });
    const failed = await rejected.gate4.run(
      context(createAgentAppSpecV2Fixture()),
    );

    expect(failed.failure?.code).toBe('binding-unavailable');
    expect(failed.failure?.message).toContain('包装工作流未通过发布校验');
  });
});
