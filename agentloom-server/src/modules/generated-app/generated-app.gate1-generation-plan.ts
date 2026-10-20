// Gate 1 架构计划（ADR-0007 §4）：从 AppSpec v2 推导「需求 → 场景 → 字段/结果分区 → 绑定」覆盖矩阵。
// 纯计算，不读租户数据；覆盖缺口即失败 generation-plan-coverage-gap。

import { GENERATED_APP_SPEC_LIMITS } from './types/app-spec-v2.schema';
import type { GeneratedAppSpecV2 } from './types/app-spec-v2.schema';
import type {
  GeneratedAppCoveragePlan,
  GeneratedAppRequirementCoverage,
} from './types/generation-plan-v2.types';
import type { GeneratedAppGateEvaluationV2 } from './types/generation-v2.ports';
import { failedGate, gateEvidence } from './generated-app.gate-v2.util';

export const AGENT_MESSAGE_BINDING_INPUT = 'agent:message';
export const AGENT_REPLY_BINDING_OUTPUT = 'agent:reply';

export function buildCoveragePlan(
  appSpec: GeneratedAppSpecV2,
): GeneratedAppCoveragePlan {
  const binding = appSpec.binding;
  const inputByField = new Map<string, string>();
  const outputBySection = new Map<string, string>();
  if (binding.kind === 'workflow') {
    for (const mapping of binding.inputMapping) {
      inputByField.set(mapping.fieldId, mapping.workflowInputFieldId);
    }
    for (const mapping of binding.outputMapping) {
      outputBySection.set(
        mapping.sectionId,
        mapping.path ? `${mapping.nodeId}.${mapping.path}` : mapping.nodeId,
      );
    }
  } else {
    for (const field of appSpec.inputForm.fields) {
      inputByField.set(field.id, AGENT_MESSAGE_BINDING_INPUT);
    }
    outputBySection.set(binding.replySectionId, AGENT_REPLY_BINDING_OUTPUT);
  }

  const touchedFields = new Set<string>();
  const assertedSections = new Set<string>();
  const requirements: GeneratedAppRequirementCoverage[] =
    appSpec.coreRequirements.map((requirement) => {
      const scenarios = appSpec.acceptanceScenarios.filter(
        (scenario) =>
          scenario.requirementIds.includes(requirement.id) &&
          (requirement.source === 'platform' ||
            scenario.scope === 'requirement'),
      );
      const fieldIds = new Set<string>();
      const sectionIds = new Set<string>();
      for (const scenario of scenarios) {
        for (const step of scenario.browserSteps) {
          if (step.action === 'fill' || step.action === 'select') {
            fieldIds.add(step.fieldId);
          } else if (step.action === 'expectResult') {
            sectionIds.add(step.sectionId);
          }
        }
      }
      fieldIds.forEach((id) => touchedFields.add(id));
      sectionIds.forEach((id) => assertedSections.add(id));
      return {
        requirementId: requirement.id,
        source: requirement.source,
        scenarioIds: scenarios.map((scenario) => scenario.id),
        fieldIds: [...fieldIds],
        sectionIds: [...sectionIds],
        bindingInputs: [
          ...new Set([...fieldIds].flatMap((id) => inputByField.get(id) ?? [])),
        ],
        bindingOutputs: [
          ...new Set(
            [...sectionIds].flatMap((id) => outputBySection.get(id) ?? []),
          ),
        ],
      };
    });

  return {
    requirements,
    unassertedSectionIds: appSpec.resultView.sections
      .map((section) => section.id)
      .filter((id) => !assertedSections.has(id)),
    untouchedFieldIds: appSpec.inputForm.fields
      .map((field) => field.id)
      .filter((id) => !touchedFields.has(id)),
  };
}

export function collectCoverageGaps(
  appSpec: GeneratedAppSpecV2,
  coverage: GeneratedAppCoveragePlan,
): string[] {
  const gaps: string[] = [];
  for (const entry of coverage.requirements) {
    if (entry.scenarioIds.length === 0) {
      gaps.push(`需求 ${entry.requirementId} 没有验收场景`);
      continue;
    }
    if (entry.source !== 'prompt') continue;
    if (entry.sectionIds.length === 0) {
      gaps.push(`需求 ${entry.requirementId} 的场景没有断言任何结果分区`);
    }
    if (entry.bindingOutputs.length < entry.sectionIds.length) {
      gaps.push(`需求 ${entry.requirementId} 断言的分区缺少绑定输出`);
    }
    const traced = appSpec.traceability.find(
      (item) => item.requirementId === entry.requirementId,
    );
    const untraced = entry.scenarioIds.filter(
      (id) => !traced?.scenarioIds.includes(id),
    );
    if (untraced.length > 0) {
      gaps.push(
        `需求 ${entry.requirementId} 的 traceability 缺少场景 ${untraced.join('、')}`,
      );
    }
  }
  for (const sectionId of coverage.unassertedSectionIds) {
    gaps.push(`结果分区 ${sectionId} 没有被任何验收场景断言，Gate 5 无法验证`);
  }
  for (const field of appSpec.inputForm.fields) {
    if (field.required && coverage.untouchedFieldIds.includes(field.id)) {
      gaps.push(`必填字段 ${field.id} 没有被任何验收场景填写`);
    }
  }
  const requirementScenarioCount = appSpec.acceptanceScenarios.filter(
    (scenario) => scenario.scope === 'requirement',
  ).length;
  if (
    requirementScenarioCount > GENERATED_APP_SPEC_LIMITS.browserScenariosMax
  ) {
    gaps.push(
      `requirement 场景 ${requirementScenarioCount} 个，超过 Gate 5 单次上限 ${GENERATED_APP_SPEC_LIMITS.browserScenariosMax}`,
    );
  }
  return gaps;
}

export function evaluateGate1GenerationPlan(
  appSpec: GeneratedAppSpecV2,
): GeneratedAppGateEvaluationV2<GeneratedAppCoveragePlan> {
  const coverage = buildCoveragePlan(appSpec);
  const gaps = collectCoverageGaps(appSpec, coverage);
  const evidence = [
    gateEvidence({
      id: 'gate-1-coverage-matrix',
      label: '需求覆盖矩阵',
      kind: 'plan',
      summary: `${coverage.requirements.length} 条需求、${appSpec.acceptanceScenarios.length} 个场景、${appSpec.inputForm.fields.length} 个字段、${appSpec.resultView.sections.length} 个结果分区；缺口 ${gaps.length} 处。`,
      details: { coverage, gaps },
    }),
  ];

  if (gaps.length > 0) {
    return failedGate({
      summary: `Gate 1 失败：覆盖矩阵有 ${gaps.length} 处缺口。`,
      code: 'generation-plan-coverage-gap',
      message: gaps.join('；'),
      details: { gaps },
      evidence,
      repairInstructions:
        '重新生成 AppSpec（start 时传 regenerateAppSpec: true），让每条需求都有断言结果分区的验收场景。',
      plan: coverage,
    });
  }

  return {
    status: 'passed',
    summary: 'Gate 1 通过：每条需求都有场景覆盖，字段与结果分区都映射到绑定。',
    evidence,
    failure: null,
    repairInstructions: null,
    plan: coverage,
  };
}
