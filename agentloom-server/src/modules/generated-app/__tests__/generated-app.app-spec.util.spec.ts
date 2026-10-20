import { describe, expect, it } from 'vitest';

import type { GeneratedAppSpecV1 } from '../../../database/schema';
import {
  buildAppSpecV2FromDraft,
  evaluateGate0AppSpec,
  GENERATED_APP_PLATFORM_REQUIREMENT_ID,
  GENERATED_APP_PLATFORM_SCENARIO_ID,
} from '../generated-app.app-spec.util';
import {
  GeneratedAppSpecDraftSchema,
  GeneratedAppSpecV2Schema,
} from '../types/app-spec-v2.schema';
import type { ResolvedGeneratedAppBinding } from '../types/generation-v2.ports';
import {
  QA_MODEL_ID,
  QA_PROMPT,
  QA_WORKFLOW_VERSION_ID,
  qaAppSpecV2,
  qaDraft,
  qaWorkflowCandidate,
} from './app-spec-v2.fixtures';

/** ADR-0007 之前由模板生成的 v1 规格：需求原样复制 prompt，只有平台流程场景 */
const V1_TEMPLATE_SPEC: GeneratedAppSpecV1 = {
  version: 1,
  appName: '问答页面',
  summary: '模板初稿',
  userGoal: QA_PROMPT,
  actors: ['创建者', '终端用户'],
  coreRequirements: [{ id: 'req-1', text: QA_PROMPT, source: 'prompt' }],
  pages: [{ id: 'page-public-runtime', name: '公开运行页', purpose: '终端用户' }],
  dataPolicy: {
    publicSubmissionsPersisted: true,
    creatorCanDeleteSubmissions: true,
    endUserLoginRequired: false,
  },
  nonGoals: ['不生成后端'],
  acceptanceScenarios: [
    {
      id: 'scenario-1',
      title: '创建者可以从一句话进入可验证生成流程',
      scope: 'platform',
      requirementIds: ['req-1'],
      given: ['已登录'],
      when: ['提交需求'],
      then: ['生成 AppSpec'],
    },
  ],
  traceability: [
    {
      requirementId: 'req-1',
      scenarioIds: ['scenario-1'],
      evidenceIds: ['app-spec-draft'],
    },
  ],
};

function resolvedQaBinding(): ResolvedGeneratedAppBinding {
  const spec = qaAppSpecV2();
  if (spec.binding.kind !== 'workflow') throw new Error('workflow binding');
  return {
    kind: 'workflow',
    binding: spec.binding,
    candidate: qaWorkflowCandidate(),
  };
}

describe('buildAppSpecV2FromDraft：服务端补全草稿', () => {
  it('补平台需求与平台场景、traceability 按浏览器步骤关联字段与分区，整体通过 v2 schema', () => {
    const spec = qaAppSpecV2();

    expect(GeneratedAppSpecV2Schema.safeParse(spec).success).toBe(true);
    expect(spec.coreRequirements.map((r) => [r.id, r.source])).toEqual([
      ['req-ask', 'prompt'],
      [GENERATED_APP_PLATFORM_REQUIREMENT_ID, 'platform'],
    ]);
    const platformScenario = spec.acceptanceScenarios.find(
      (scenario) => scenario.id === GENERATED_APP_PLATFORM_SCENARIO_ID,
    );
    expect(platformScenario).toMatchObject({
      scope: 'platform',
      requirementIds: [GENERATED_APP_PLATFORM_REQUIREMENT_ID],
      browserSteps: [],
    });
    expect(spec.traceability).toEqual([
      {
        requirementId: 'req-ask',
        scenarioIds: ['scenario-ask'],
        fieldIds: ['question'],
        sectionIds: ['answer', 'citations'],
      },
      {
        requirementId: GENERATED_APP_PLATFORM_REQUIREMENT_ID,
        scenarioIds: [GENERATED_APP_PLATFORM_SCENARIO_ID],
        fieldIds: [],
        sectionIds: [],
      },
    ]);
    expect(spec.binding).toMatchObject({
      kind: 'workflow',
      workflowVersionId: QA_WORKFLOW_VERSION_ID,
    });
    expect(spec.generation).toEqual({
      modelConfigId: QA_MODEL_ID,
      generatedAt: '2026-10-20T00:00:00.000Z',
      attempt: 1,
      // sha256(QA_PROMPT)，复跑时据此判断需求是否变化
      promptSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
    expect(spec.dataPolicy).toEqual({
      publicSubmissionsPersisted: true,
      creatorCanDeleteSubmissions: true,
      endUserLoginRequired: false,
    });
    expect(spec.inputForm.fields[0]).toMatchObject({
      id: 'question',
      type: 'textarea',
      maxLength: 2000,
    });
  });

  it('模型自己写了平台需求 id 时补全结果不通过 v2 schema（需求 id 重复）', () => {
    const draft = GeneratedAppSpecDraftSchema.parse({
      ...qaDraft(),
      requirements: [
        {
          id: GENERATED_APP_PLATFORM_REQUIREMENT_ID,
          text: '平台需求',
          source: 'prompt',
        },
      ],
      acceptanceScenarios: qaDraft().acceptanceScenarios.map((scenario) => ({
        ...scenario,
        requirementIds: [GENERATED_APP_PLATFORM_REQUIREMENT_ID],
      })),
    });
    if (draft.binding.kind !== 'workflow') throw new Error('workflow binding');

    const parsed = GeneratedAppSpecV2Schema.safeParse(
      buildAppSpecV2FromDraft(draft, {
        binding: { ...draft.binding, workflowVersionId: QA_WORKFLOW_VERSION_ID },
        modelConfigId: QA_MODEL_ID,
        attempt: 2,
        prompt: QA_PROMPT,
        generatedAt: new Date(),
      }),
    );

    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues.map((issue) => issue.message)).toContain(
      `需求 id ${GENERATED_APP_PLATFORM_REQUIREMENT_ID} 重复`,
    );
  });
});

describe('evaluateGate0AppSpec：已存规格的 Gate 0 判定', () => {
  it('v1 模板规格判 app-spec-legacy-template，不论绑定复核结果', () => {
    const evaluation = evaluateGate0AppSpec(V1_TEMPLATE_SPEC, {
      ok: true,
      resolved: resolvedQaBinding(),
    });

    expect(evaluation.status).toBe('failed');
    expect(evaluation.failure?.code).toBe('app-spec-legacy-template');
    expect(evaluation.repairInstructions).toContain('重新运行生成');
  });

  it('尚未生成的规格判 app-spec-missing', () => {
    const evaluation = evaluateGate0AppSpec(null, null);

    expect(evaluation.status).toBe('failed');
    expect(evaluation.failure?.code).toBe('app-spec-missing');
  });

  it('v2 规格违反跨字段规则时判 app-spec-model-output-invalid 并列出问题', () => {
    const spec = qaAppSpecV2();
    const broken = {
      ...spec,
      acceptanceScenarios: spec.acceptanceScenarios.map((scenario) => ({
        ...scenario,
        browserSteps: scenario.browserSteps.filter(
          (step) => step.action !== 'submit',
        ),
      })),
    };

    const evaluation = evaluateGate0AppSpec(broken, {
      ok: true,
      resolved: resolvedQaBinding(),
    });

    expect(evaluation.failure).toMatchObject({
      code: 'app-spec-model-output-invalid',
      details: {
        issues: expect.arrayContaining([
          expect.stringContaining('场景缺少 submit 步骤'),
        ]),
      },
    });
  });

  it('绑定未复核或复核有问题时判 app-spec-binding-invalid', () => {
    const spec = qaAppSpecV2();

    expect(evaluateGate0AppSpec(spec, null).failure?.code).toBe(
      'app-spec-binding-invalid',
    );

    const evaluation = evaluateGate0AppSpec(spec, {
      ok: false,
      issues: [
        {
          path: ['binding', 'workflowVersionId'],
          message: '固定版本不存在或已归档',
        },
      ],
    });
    expect(evaluation.status).toBe('failed');
    expect(evaluation.failure).toMatchObject({
      code: 'app-spec-binding-invalid',
      details: {
        issues: ['binding.workflowVersionId: 固定版本不存在或已归档'],
      },
    });
  });

  it('合规规格且绑定复核通过时 passed，证据含字段、分区与固定版本', () => {
    const evaluation = evaluateGate0AppSpec(qaAppSpecV2(), {
      ok: true,
      resolved: resolvedQaBinding(),
    });

    expect(evaluation.status).toBe('passed');
    expect(evaluation.failure).toBeNull();
    expect(evaluation.evidence.map((item) => item.id)).toEqual([
      'gate-0-app-spec-v2',
      'gate-0-binding',
    ]);
    expect(evaluation.evidence[0]?.details).toEqual({
      fieldIds: ['question'],
      sectionIds: ['answer', 'citations'],
      scenarioIds: ['scenario-ask'],
    });
    expect(evaluation.evidence[1]?.summary).toContain(QA_WORKFLOW_VERSION_ID);
  });
});
