import { describe, expect, it, vi } from 'vitest';

import { WorkflowNotPublishedException } from '../../execution/execution.exceptions';
import { evaluateGate1GenerationPlan } from '../generated-app.gate1-generation-plan';
import {
  buildPublicInputJsonSchema,
  evaluateGate2StaticContracts,
} from '../generated-app.gate2-static-contracts';
import { GeneratedAppGate6IndependentVerifierRunner } from '../generated-app.gate6-independent-verifier';
import { GeneratedAppGate7PublishCandidateRunner } from '../generated-app.gate7-publish-candidate';
import {
  computeAppSpecSha256,
  resolveGateExecutionLevel,
  toPinnedBinding,
} from '../generated-app.gate-v2.util';
import type { GeneratedAppSpecV2 } from '../types/app-spec-v2.schema';
import type { GeneratedAppBrowserScenarioResult } from '../types/browser-acceptance-job.schema';
import type { GeneratedAppGateContextV2 } from '../types/generation-v2.ports';
import type {
  GeneratedAppBrowserAcceptancePlanV2,
  GeneratedAppGenerationPlanV2,
} from '../types/generation-plan-v2.types';
import type { StorageService } from '../../../infrastructure/storage/storage.service';
import {
  APP_ID,
  GENERATION_RUN_ID,
  TENANT_ID,
  USER_ID,
  createAgentAppSpecV2Fixture,
  createAppSpecV2Fixture,
  createConfigService,
  createResolvedBindingFixture,
  createWorkflowBindingCandidateFixture,
} from './generated-app-test-support';

const ARTIFACT_PREFIX = `tenants/${TENANT_ID}/generated-apps/${APP_ID}/runs/${GENERATION_RUN_ID}/gate-5`;

function scenarioRow(
  overrides: Partial<GeneratedAppBrowserScenarioResult> = {},
): GeneratedAppBrowserScenarioResult {
  const viewportId = overrides.viewportId ?? 'desktop';
  return {
    scenarioId: 'scenario-ask',
    viewportId,
    status: 'passed',
    durationMs: 12_000,
    failure: null,
    submissionId: '01a1553d-2841-773b-910a-5996af8ee7cc',
    consoleErrors: [],
    failedRequests: [],
    resultTexts: {
      answer: '最多可以同时运行 10 个子 Agent。',
      citations: '产品宣传册 第 3 页',
    },
    artifacts: {
      screenshotKey: `${ARTIFACT_PREFIX}/scenario-ask-${viewportId}.png`,
      traceKey: `${ARTIFACT_PREFIX}/scenario-ask-${viewportId}.zip`,
    },
    ...overrides,
  };
}

function browserPlan(
  rows: GeneratedAppBrowserScenarioResult[] = [
    scenarioRow(),
    scenarioRow({ viewportId: 'mobile' }),
  ],
  overrides: Partial<GeneratedAppBrowserAcceptancePlanV2> = {},
): GeneratedAppBrowserAcceptancePlanV2 {
  return {
    planVersion: 2,
    executionLevel: 'real',
    scenarioIds: ['scenario-ask'],
    viewports: ['desktop', 'mobile'],
    artifactPrefix: ARTIFACT_PREFIX,
    jobId: `gate5-${GENERATION_RUN_ID}`,
    result: {
      jobVersion: 1,
      status: rows.every((row) => row.status === 'passed')
        ? 'passed'
        : 'failed',
      runnerError: null,
      browser: { name: 'chromium', version: '140.0.0.0' },
      playwrightVersion: '1.56.0',
      startedAt: '2026-10-20T08:00:00.000Z',
      completedAt: '2026-10-20T08:01:00.000Z',
      scenarios: rows,
    },
    ...overrides,
  };
}

function context(
  appSpec: GeneratedAppSpecV2 = createAppSpecV2Fixture(),
  planOverrides: Partial<GeneratedAppGenerationPlanV2> = {},
  previousGates: GeneratedAppGateContextV2['previousGates'] = [],
): GeneratedAppGateContextV2 {
  return {
    tenantId: TENANT_ID,
    userId: USER_ID,
    appId: APP_ID,
    generationRunId: GENERATION_RUN_ID,
    appSpec,
    resolvedBinding: createResolvedBindingFixture(appSpec),
    previousGates,
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
      ...planOverrides,
    },
    signal: new AbortController().signal,
  };
}

describe('resolveGateExecutionLevel', () => {
  it('未配置为 real，只认 real/fixture/disabled，旧 v1 级别名按 disabled 处理', () => {
    const key = 'GENERATED_APP_GATE5_EXECUTOR_MODE';
    expect(resolveGateExecutionLevel(createConfigService(), key)).toBe('real');
    expect(
      resolveGateExecutionLevel(
        createConfigService({ [key]: ' Fixture ' }),
        key,
      ),
    ).toBe('fixture');
    expect(
      resolveGateExecutionLevel(
        createConfigService({ [key]: 'real-browser-e2e' }),
        key,
      ),
    ).toBe('disabled');
  });
});

describe('Gate 1 覆盖矩阵', () => {
  it('需求→场景→字段/分区→绑定输入输出逐条对应', () => {
    const evaluation = evaluateGate1GenerationPlan(createAppSpecV2Fixture());

    expect(evaluation.status).toBe('passed');
    expect(evaluation.plan?.requirements).toEqual([
      {
        requirementId: 'req-ask',
        source: 'prompt',
        scenarioIds: ['scenario-ask'],
        fieldIds: ['question'],
        sectionIds: ['answer', 'citations'],
        bindingInputs: ['question'],
        bindingOutputs: ['out-answer', 'out-structured.citations'],
      },
      expect.objectContaining({
        requirementId: 'req-platform-persist',
        scenarioIds: ['scenario-platform-persist'],
      }),
    ]);
  });

  it('结果分区没有被任何场景断言时判 generation-plan-coverage-gap', () => {
    const base = createAppSpecV2Fixture();
    const appSpec = createAppSpecV2Fixture({
      acceptanceScenarios: base.acceptanceScenarios.map((scenario) =>
        scenario.scope === 'requirement'
          ? {
              ...scenario,
              browserSteps: scenario.browserSteps.filter(
                (step) =>
                  step.action !== 'expectResult' ||
                  step.sectionId !== 'citations',
              ),
            }
          : scenario,
      ),
    });

    const evaluation = evaluateGate1GenerationPlan(appSpec);

    expect(evaluation.status).toBe('failed');
    expect(evaluation.failure?.code).toBe('generation-plan-coverage-gap');
    expect(evaluation.failure?.message).toContain('citations');
  });

  it('requirement 场景超过 Gate 5 单次上限时判缺口', () => {
    const base = createAppSpecV2Fixture();
    const ask = base.acceptanceScenarios[0];
    const extra = Array.from({ length: 5 }, (_, index) => ({
      ...ask,
      id: `scenario-ask-${index}`,
    }));
    const appSpec = createAppSpecV2Fixture({
      acceptanceScenarios: [...base.acceptanceScenarios, ...extra],
      traceability: base.traceability.map((entry) =>
        entry.requirementId === 'req-ask'
          ? {
              ...entry,
              scenarioIds: [...entry.scenarioIds, ...extra.map((s) => s.id)],
            }
          : entry,
      ),
    });

    const evaluation = evaluateGate1GenerationPlan(appSpec);

    expect(evaluation.failure?.message).toContain('超过 Gate 5 单次上限 5');
  });
});

describe('Gate 2 静态合约', () => {
  it('公开输入 JSON Schema 由字段生成：类型、必填、长度、选项、禁止额外字段', () => {
    expect(
      buildPublicInputJsonSchema([
        {
          id: 'question',
          label: '问题',
          type: 'textarea',
          required: true,
          maxLength: 500,
          helpText: '',
          placeholder: '',
        },
        {
          id: 'count',
          label: '数量',
          type: 'number',
          required: false,
          min: 1,
          max: 9,
          helpText: '',
          placeholder: '',
        },
        {
          id: 'tags',
          label: '标签',
          type: 'multi_select',
          required: true,
          options: [{ value: 'a', label: 'A' }],
          helpText: '',
          placeholder: '',
        },
      ]),
    ).toMatchObject({
      type: 'object',
      additionalProperties: false,
      required: ['question', 'tags'],
      properties: {
        question: { type: 'string', maxLength: 500, minLength: 1 },
        count: { type: 'number', minimum: 1, maximum: 9 },
        tags: { type: 'array', minItems: 1, items: { enum: ['a'] } },
      },
    });
  });

  it('与固定版本快照兼容时通过，结果合约记录每个分区的输出节点', () => {
    const appSpec = createAppSpecV2Fixture();
    const evaluation = evaluateGate2StaticContracts(
      appSpec,
      createResolvedBindingFixture(appSpec),
      null,
    );

    expect(evaluation.status).toBe('passed');
    expect(evaluation.plan?.result.sections).toEqual([
      {
        sectionId: 'answer',
        format: 'markdown',
        source: {
          kind: 'workflow-output',
          nodeId: 'out-answer',
          nodeType: 'text-output',
          path: null,
        },
      },
      {
        sectionId: 'citations',
        format: 'citations',
        source: {
          kind: 'workflow-output',
          nodeId: 'out-structured',
          nodeType: 'json-output',
          path: 'citations',
        },
      },
    ]);
  });

  it.each([
    [
      '工作流输入类型不兼容',
      createWorkflowBindingCandidateFixture({
        inputSchema: {
          version: 1,
          collectionMode: 'form',
          fields: [
            { id: 'question', type: 'number', label: '问题', required: true },
          ],
        },
      }),
      '类型不兼容',
    ],
    [
      '工作流有未映射的必填输入',
      createWorkflowBindingCandidateFixture({
        inputSchema: {
          version: 2,
          collectionMode: 'form',
          fields: [
            { id: 'question', type: 'text', label: '问题', required: true },
            { id: 'language', type: 'text', label: '语言', required: true },
          ],
        },
      }),
      '必填输入 language',
    ],
    [
      '输出节点不在快照中',
      createWorkflowBindingCandidateFixture({
        outputNodes: [
          { nodeId: 'out-answer', nodeType: 'text-output', label: '答案' },
        ],
      }),
      'out-structured 不存在',
    ],
    [
      'text-output 节点带 path',
      createWorkflowBindingCandidateFixture({
        outputNodes: [
          { nodeId: 'out-answer', nodeType: 'text-output', label: '答案' },
          {
            nodeId: 'out-structured',
            nodeType: 'text-output',
            label: '结构化',
          },
        ],
      }),
      '不支持 path',
    ],
  ])('%s → static-contract-mismatch', (_name, candidate, message) => {
    const appSpec = createAppSpecV2Fixture();
    const resolved = createResolvedBindingFixture(appSpec);
    const evaluation = evaluateGate2StaticContracts(
      appSpec,
      resolved.kind === 'workflow' ? { ...resolved, candidate } : resolved,
      null,
    );

    expect(evaluation.status).toBe('failed');
    expect(evaluation.failure?.code).toBe('static-contract-mismatch');
    expect(evaluation.failure?.message).toContain(message);
  });

  it('Agent 绑定的包装工作流图走图结构校验，连线指向不存在节点时失败', () => {
    const appSpec = createAgentAppSpecV2Fixture();
    const evaluation = evaluateGate2StaticContracts(
      appSpec,
      createResolvedBindingFixture(appSpec),
      {
        nodes: [
          {
            id: 'trigger',
            type: 'manual-trigger',
            position: { x: 0, y: 0 },
            data: {},
          },
        ],
        edges: [{ id: 'e1', source: 'trigger', target: 'agent' }],
      },
    );

    expect(evaluation.status).toBe('failed');
    expect(evaluation.failure?.message).toContain('目标节点 agent 不存在');
  });
});

describe('Gate 6 独立审查', () => {
  const realPlans = {
    buildUnitPlan: {
      executionLevel: 'real' as const,
      workspace: null,
      contractCases: [],
    },
    integrationPlan: { executionLevel: 'real' as const, checks: [] },
  };

  function runner(existing: (key: string) => boolean = () => true) {
    const storage = {
      exists: vi.fn(async (key: string) => existing(key)),
    } as unknown as StorageService;
    return {
      storage,
      runner: new GeneratedAppGate6IndependentVerifierRunner(
        createConfigService(),
        storage,
      ),
    };
  }

  it('两视口通过、无 console/失败请求、分区非空、artifact 均在存储中 → 通过', async () => {
    const { runner: gate6, storage } = runner();
    const evaluation = await gate6.run(
      context(undefined, {
        ...realPlans,
        browserAcceptancePlan: browserPlan(),
      }),
    );

    expect(evaluation.status).toBe('passed');
    expect(evaluation.plan?.verifiedRequirementIds).toEqual(['req-ask']);
    expect(evaluation.plan?.verifiedArtifactKeys).toHaveLength(4);
    expect(storage.exists).toHaveBeenCalledTimes(4);
  });

  it.each([
    [
      '只有桌面视口通过',
      browserPlan([scenarioRow()]),
      'requirement-not-verified',
    ],
    [
      '有 console error',
      browserPlan([
        scenarioRow({ consoleErrors: ['TypeError: x'] }),
        scenarioRow({ viewportId: 'mobile' }),
      ]),
      'console-error',
    ],
    [
      '有失败的同源请求',
      browserPlan([
        scenarioRow({
          failedRequests: [
            {
              method: 'POST',
              path: '/api/v1/generated-apps/public/<token>/submissions',
              status: 500,
            },
          ],
        }),
        scenarioRow({ viewportId: 'mobile' }),
      ]),
      'failed-request',
    ],
    [
      '断言的分区为空',
      browserPlan([
        scenarioRow({ resultTexts: { answer: '', citations: 'x' } }),
        scenarioRow({ viewportId: 'mobile' }),
      ]),
      'result-section-empty',
    ],
    [
      'Gate 5 是 fixture',
      browserPlan(undefined, { executionLevel: 'fixture', result: null }),
      'gate-5-not-real',
    ],
  ])('%s → verifier-blocking-finding', async (_name, plan, findingId) => {
    const { runner: gate6 } = runner();
    const evaluation = await gate6.run(
      context(undefined, { ...realPlans, browserAcceptancePlan: plan }),
    );

    expect(evaluation.status).toBe('failed');
    expect(evaluation.failure?.code).toBe('verifier-blocking-finding');
    expect(evaluation.plan?.findings.map((item) => item.findingId)).toContain(
      findingId,
    );
  });

  it('截图不在对象存储中时阻断', async () => {
    const { runner: gate6 } = runner((key) => !key.endsWith('mobile.png'));
    const evaluation = await gate6.run(
      context(undefined, {
        ...realPlans,
        browserAcceptancePlan: browserPlan(),
      }),
    );

    expect(evaluation.plan?.findings).toEqual([
      expect.objectContaining({
        findingId: 'artifact-not-stored',
        viewportId: 'mobile',
      }),
    ]);
  });

  it('Gate 3 为 fixture 时阻断，即使浏览器证据齐全', async () => {
    const { runner: gate6 } = runner();
    const evaluation = await gate6.run(
      context(undefined, {
        ...realPlans,
        buildUnitPlan: {
          executionLevel: 'fixture',
          workspace: null,
          contractCases: [],
        },
        browserAcceptancePlan: browserPlan(),
      }),
    );

    expect(evaluation.plan?.findings.map((item) => item.findingId)).toEqual([
      'gate-3-not-real',
    ]);
  });
});

describe('Gate 7 发布候选', () => {
  const passedGates = [0, 1, 2, 3, 4, 5, 6].map((order) => ({
    gateId: `gate-${order}`,
    status: 'passed' as const,
    evidence: [
      {
        id: `gate-${order}-evidence`,
        label: 'x',
        kind: 'plan' as const,
        url: null,
        summary: 'x',
      },
    ],
  }));
  const verified = {
    independentVerificationPlan: {
      executionLevel: 'real' as const,
      verifiedRequirementIds: ['req-ask'],
      verifiedArtifactKeys: [`${ARTIFACT_PREFIX}/scenario-ask-desktop.png`],
      findings: [],
    },
  };
  const runtimeWorkflow = {
    workflowDefinitionId: '55555555-5555-4555-8555-555555555556',
    workflowVersionId: '55555555-5555-4555-8555-555555555559',
  };

  it('Gate 0–6 通过时准备运行时工作流并写 manifest', async () => {
    const ensureRuntimeWorkflow = vi.fn().mockResolvedValue(runtimeWorkflow);
    const gate7 = new GeneratedAppGate7PublishCandidateRunner(
      createConfigService(),
      { ensureRuntimeWorkflow },
    );
    const ctx = context(undefined, verified, passedGates);

    const evaluation = await gate7.run(ctx);

    expect(evaluation.status).toBe('passed');
    expect(ensureRuntimeWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({
        appId: APP_ID,
        generationRunId: GENERATION_RUN_ID,
      }),
    );
    expect(evaluation.plan?.manifest).toMatchObject({
      appSpecSha256: ctx.generationPlan.appSpecSha256,
      binding: {
        kind: 'workflow',
        workflowVersionId: runtimeWorkflow.workflowVersionId,
      },
      runtimeWorkflow,
      artifactKeys: verified.independentVerificationPlan.verifiedArtifactKeys,
      gateEvidenceIds: { 'gate-5': ['gate-5-evidence'] },
    });
  });

  it('AppSpec 在 Gate 0 之后被改动时拒绝签收且不创建运行时工作流', async () => {
    const ensureRuntimeWorkflow = vi.fn();
    const gate7 = new GeneratedAppGate7PublishCandidateRunner(
      createConfigService(),
      { ensureRuntimeWorkflow },
    );
    const ctx = context(
      undefined,
      { ...verified, appSpecSha256: '0'.repeat(64) },
      passedGates,
    );

    const evaluation = await gate7.run(ctx);

    expect(evaluation.failure?.code).toBe(
      'gate-7-publish-candidate-contract-blocked',
    );
    expect(ensureRuntimeWorkflow).not.toHaveBeenCalled();
  });

  it('前序 Gate 有未通过时阻断', async () => {
    const gate7 = new GeneratedAppGate7PublishCandidateRunner(
      createConfigService(),
      { ensureRuntimeWorkflow: vi.fn() },
    );
    const gates = passedGates.map((gate) =>
      gate.gateId === 'gate-5' ? { ...gate, status: 'failed' as const } : gate,
    );

    const evaluation = await gate7.run(context(undefined, verified, gates));

    expect(evaluation.failure?.message).toContain('gate-5 在本次运行未通过');
  });

  it('运行时工作流发布失败转为 Gate 7 失败而不是运行异常', async () => {
    const gate7 = new GeneratedAppGate7PublishCandidateRunner(
      createConfigService(),
      {
        ensureRuntimeWorkflow: vi
          .fn()
          .mockRejectedValue(
            new WorkflowNotPublishedException(
              runtimeWorkflow.workflowDefinitionId,
            ),
          ),
      },
    );

    const evaluation = await gate7.run(
      context(undefined, verified, passedGates),
    );

    expect(evaluation.status).toBe('failed');
    expect(evaluation.failure?.code).toBe(
      'gate-7-publish-candidate-contract-blocked',
    );
  });

  it('fixture 执行器不能产生发布候选', async () => {
    const gate7 = new GeneratedAppGate7PublishCandidateRunner(
      createConfigService({ GENERATED_APP_GATE7_EXECUTOR_MODE: 'fixture' }),
      { ensureRuntimeWorkflow: vi.fn() },
    );

    const evaluation = await gate7.run(
      context(undefined, verified, passedGates),
    );

    expect(evaluation.failure?.code).toBe(
      'gate-7-fixture-not-publish-candidate',
    );
  });
});
