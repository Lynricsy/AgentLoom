import { describe, expect, it } from 'vitest';

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
  V2_MODEL_CONFIG_ID,
  V2_PROMPT,
  WORKFLOW_VERSION_ID,
  createAppSpecV2FromDraftFixture,
  createAppSpecDraftFixture,
  createWorkflowBindingCandidateFixture,
} from './generated-app-test-support';

function resolvedQaBinding(): ResolvedGeneratedAppBinding {
  const spec = createAppSpecV2FromDraftFixture();
  if (spec.binding.kind !== 'workflow') throw new Error('workflow binding');
  return {
    kind: 'workflow',
    binding: spec.binding,
    candidate: createWorkflowBindingCandidateFixture(),
  };
}

describe('buildAppSpecV2FromDraft：服务端补全草稿', () => {
  it('补平台需求与平台场景、traceability 按浏览器步骤关联字段与分区，整体通过 v2 schema', () => {
    const spec = createAppSpecV2FromDraftFixture();

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
      workflowVersionId: WORKFLOW_VERSION_ID,
    });
    expect(spec.generation).toEqual({
      modelConfigId: V2_MODEL_CONFIG_ID,
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
      ...createAppSpecDraftFixture(),
      requirements: [
        {
          id: GENERATED_APP_PLATFORM_REQUIREMENT_ID,
          text: '平台需求',
          source: 'prompt',
        },
      ],
      acceptanceScenarios: createAppSpecDraftFixture().acceptanceScenarios.map(
        (scenario) => ({
          ...scenario,
          requirementIds: [GENERATED_APP_PLATFORM_REQUIREMENT_ID],
        }),
      ),
    });
    if (draft.binding.kind !== 'workflow') throw new Error('workflow binding');

    const parsed = GeneratedAppSpecV2Schema.safeParse(
      buildAppSpecV2FromDraft(draft, {
        binding: {
          ...draft.binding,
          workflowVersionId: WORKFLOW_VERSION_ID,
        },
        modelConfigId: V2_MODEL_CONFIG_ID,
        attempt: 2,
        prompt: V2_PROMPT,
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
  it('尚未生成的规格判 app-spec-missing', () => {
    const evaluation = evaluateGate0AppSpec(null, null);

    expect(evaluation.status).toBe('failed');
    expect(evaluation.failure?.code).toBe('app-spec-missing');
  });

  it('v2 规格违反跨字段规则时判 app-spec-model-output-invalid 并列出问题', () => {
    const spec = createAppSpecV2FromDraftFixture();
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
    const spec = createAppSpecV2FromDraftFixture();

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
    const evaluation = evaluateGate0AppSpec(createAppSpecV2FromDraftFixture(), {
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
    expect(evaluation.evidence[1]?.summary).toContain(WORKFLOW_VERSION_ID);
  });
});
