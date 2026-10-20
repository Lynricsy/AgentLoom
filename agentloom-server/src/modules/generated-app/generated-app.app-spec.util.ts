import * as crypto from 'crypto';

import type { z } from 'zod';

import type {
  GeneratedAppGateEvidence,
  GeneratedAppGateRunFailure,
  GeneratedAppReadiness,
  GeneratedAppStatus,
} from '../../database/schema';
import { getGeneratedAppStatusForReadiness } from './generated-app.gates';
import {
  GeneratedAppSpecV2Schema,
  type AppSpecReferenceIssue,
  type GeneratedAppAcceptanceScenarioV2,
  type GeneratedAppBinding,
  type GeneratedAppSpecDraft,
  type GeneratedAppSpecV2,
} from './types/app-spec-v2.schema';
import type { ResolvedGeneratedAppBinding } from './types/generation-v2.ports';

export interface Gate0Evaluation {
  status: 'passed' | 'failed';
  summary: string;
  evidence: GeneratedAppGateEvidence[];
  failure: GeneratedAppGateRunFailure | null;
  repairInstructions: string | null;
}

/**
 * Gate 0 失败码（Gate 内部，不是 HTTP 错误），见 ADR-0007 §4。
 * `app-spec-missing` 只出现在直接复核已存规格时：生成运行遇到缺失的 AppSpec 会先生成。
 */
export type Gate0FailureCode =
  | 'app-spec-model-unavailable'
  | 'app-spec-binding-candidates-empty'
  | 'app-spec-model-output-invalid'
  | 'app-spec-binding-invalid'
  | 'app-spec-generation-timeout'
  | 'app-spec-missing';

/** 绑定复核结果：null 表示尚未复核（Gate 0 不放行未复核的绑定） */
export type Gate0BindingCheck =
  | { ok: true; resolved: ResolvedGeneratedAppBinding }
  | { ok: false; issues: AppSpecReferenceIssue[] }
  | null;

/** 服务端补充的平台需求与对应的平台流程场景 */
export const GENERATED_APP_PLATFORM_REQUIREMENT_ID = 'req-platform-persist';
export const GENERATED_APP_PLATFORM_SCENARIO_ID = 'scenario-platform-persist';
export const GENERATED_APP_PUBLIC_RUNTIME_PAGE_ID = 'page-public-runtime';
export const GENERATED_APP_CREATOR_WORKBENCH_PAGE_ID = 'page-creator-workbench';

const GATE_0_REPAIR_INSTRUCTIONS: Record<Gate0FailureCode, string> = {
  'app-spec-model-unavailable':
    '在「模型」中启用一个 chat 模型并设为默认，或创建应用时指定 modelConfigId，然后重新运行生成。',
  'app-spec-binding-candidates-empty':
    '生成应用需要调用已发布的工作流或 Agent：先发布一个工作流或 Agent（或修正创建时指定的绑定目标），然后重新运行生成。',
  'app-spec-model-output-invalid':
    '模型多次未产出符合契约的 AppSpec：换用能力更强的 chat 模型，或把需求写得更具体后重新运行生成。',
  'app-spec-binding-invalid':
    '检查绑定工作流的输入契约与输出节点是否能承接需求（必填输入、类型、选项、text-output/json-output 节点），修正后重新运行生成。',
  'app-spec-generation-timeout':
    '生成 AppSpec 超时：稍后重试，或换用响应更快的 chat 模型。',
  'app-spec-missing': '该应用还没有 AppSpec，运行生成会按需求生成。',
};

export function buildAppName(prompt: string): string {
  const compact = prompt.replace(/\s+/g, ' ').trim();
  const firstSentence = compact.split(/[。！？!?]/)[0]?.trim() ?? compact;
  const baseName = firstSentence.length > 0 ? firstSentence : '定制化应用';
  return baseName.length > 48 ? `${baseName.slice(0, 48)}...` : baseName;
}

export function resolveStatusForShareDisabled(
  readiness: GeneratedAppReadiness,
): GeneratedAppStatus {
  if (readiness.canCreatePublicShare) {
    return 'publish_candidate';
  }

  return getGeneratedAppStatusForReadiness(readiness);
}

/** Zod issue → 「路径: 说明」，作为模型自我修复的反馈与 Gate 0 失败详情 */
export function formatZodIssues(issues: readonly z.core.$ZodIssue[]): string[] {
  return issues.map((issue) => formatIssue(issue.path, issue.message));
}

export function formatReferenceIssues(
  issues: readonly AppSpecReferenceIssue[],
): string[] {
  return issues.map((issue) => formatIssue(issue.path, issue.message));
}

function formatIssue(
  path: ReadonlyArray<PropertyKey>,
  message: string,
): string {
  const location = path
    .map((segment) =>
      typeof segment === 'number' ? `[${segment}]` : `.${String(segment)}`,
    )
    .join('')
    .replace(/^\./, '');
  return location ? `${location}: ${message}` : message;
}

/**
 * 模型草稿 → 持久化 AppSpec v2：补平台需求与平台场景、页面、数据策略、范围边界、
 * traceability、固定版本的绑定与生成元数据。调用方负责用 `GeneratedAppSpecV2Schema` 复核。
 */
export function buildAppSpecV2FromDraft(
  draft: GeneratedAppSpecDraft,
  params: {
    binding: GeneratedAppBinding;
    modelConfigId: string;
    attempt: number;
    prompt: string;
    generatedAt: Date;
  },
): GeneratedAppSpecV2 {
  const platformScenario: GeneratedAppAcceptanceScenarioV2 = {
    id: GENERATED_APP_PLATFORM_SCENARIO_ID,
    title: '公开提交保存在创建者租户并可由创建者管理',
    scope: 'platform',
    requirementIds: [GENERATED_APP_PLATFORM_REQUIREMENT_ID],
    given: ['应用已通过门禁并开启公开分享'],
    when: ['终端用户在公开页提交表单'],
    then: [
      '提交内容与运行结果写入创建者租户',
      '创建者可以在提交列表中查看并删除提交',
    ],
    browserSteps: [],
  };
  const acceptanceScenarios = [...draft.acceptanceScenarios, platformScenario];
  const coreRequirements: GeneratedAppSpecV2['coreRequirements'] = [
    ...draft.requirements,
    {
      id: GENERATED_APP_PLATFORM_REQUIREMENT_ID,
      text: '公开应用的提交内容与运行结果保存在创建者租户内，创建者可以查看和删除。',
      source: 'platform',
    },
  ];

  const traceability = coreRequirements.map((requirement) => {
    const scenarios = acceptanceScenarios.filter((scenario) =>
      scenario.requirementIds.includes(requirement.id),
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
    return {
      requirementId: requirement.id,
      scenarioIds: scenarios.map((scenario) => scenario.id),
      fieldIds: [...fieldIds],
      sectionIds: [...sectionIds],
    };
  });

  return {
    version: 2,
    appName: draft.appName,
    summary: draft.summary,
    userGoal: draft.userGoal,
    actors: draft.actors,
    coreRequirements,
    pages: [
      {
        id: GENERATED_APP_PUBLIC_RUNTIME_PAGE_ID,
        name: '公开运行页',
        purpose: `终端用户无需登录，填写「${draft.inputForm.title}」并查看「${draft.resultView.title}」。`,
      },
      {
        id: GENERATED_APP_CREATOR_WORKBENCH_PAGE_ID,
        name: '创建者工作台',
        purpose: '创建者查看生成记录、门禁结果、提交记录与发布状态。',
      },
    ],
    inputForm: draft.inputForm,
    resultView: draft.resultView,
    binding: params.binding,
    dataPolicy: {
      publicSubmissionsPersisted: true,
      creatorCanDeleteSubmissions: true,
      endUserLoginRequired: false,
    },
    nonGoals: [
      '不生成自定义后端服务、数据库 schema 或部署资产；业务处理由绑定的已发布工作流或 Agent 执行。',
      '不绕过 AgentLoom 鉴权、租户隔离、资源配额或 API 权限模型。',
    ],
    acceptanceScenarios,
    traceability,
    generation: {
      modelConfigId: params.modelConfigId,
      generatedAt: params.generatedAt.toISOString(),
      attempt: params.attempt,
      promptSha256: crypto
        .createHash('sha256')
        .update(params.prompt, 'utf8')
        .digest('hex'),
    },
  };
}

/**
 * Gate 0 对已有 AppSpec 的判定：v2 契约（含跨字段引用）→ 绑定复核结果。
 * 纯函数；生成与绑定解析由 `GeneratedAppGate0Service` 完成后再交给这里判定。
 */
export function evaluateGate0AppSpec(
  appSpec: GeneratedAppSpecV2 | null | undefined,
  bindingCheck: Gate0BindingCheck,
): Gate0Evaluation {
  if (!appSpec) {
    return buildGate0Failure('app-spec-missing', 'AppSpec 尚未生成。', []);
  }

  const parsed = GeneratedAppSpecV2Schema.safeParse(appSpec);
  if (!parsed.success) {
    const issues = formatZodIssues(parsed.error.issues);
    return buildGate0Failure(
      'app-spec-model-output-invalid',
      `AppSpec 不符合 v2 契约（${issues.length} 个问题）。`,
      issues,
    );
  }

  const spec = parsed.data;
  const schemaEvidence = buildSchemaEvidence(spec);

  if (!bindingCheck) {
    return buildGate0Failure(
      'app-spec-binding-invalid',
      'AppSpec 的绑定尚未复核，不能确认绑定目标仍可调用。',
      [],
      [schemaEvidence],
    );
  }

  if (!bindingCheck.ok) {
    const issues = formatReferenceIssues(bindingCheck.issues);
    return buildGate0Failure(
      'app-spec-binding-invalid',
      `AppSpec 的绑定与目标不兼容（${issues.length} 个问题）。`,
      issues,
      [schemaEvidence],
    );
  }

  const bindingEvidence = buildBindingEvidence(bindingCheck.resolved);
  return {
    status: 'passed',
    summary: `Gate 0 通过：${schemaEvidence.summary}绑定${bindingEvidence.summary}`,
    evidence: [schemaEvidence, bindingEvidence],
    failure: null,
    repairInstructions: null,
  };
}

/** 生成器失败（模型不可用、无候选、输出不合规、超时）也走同一失败形状 */
export function buildGate0Failure(
  code: Gate0FailureCode,
  message: string,
  issues: string[],
  evidence: GeneratedAppGateEvidence[] = [],
  details: Record<string, unknown> = {},
): Gate0Evaluation {
  return {
    status: 'failed',
    summary: `Gate 0 失败：${message}`,
    evidence: [
      ...evidence,
      {
        id: 'gate-0-failure',
        label: 'AppSpec 问题',
        kind: 'app_spec',
        url: null,
        summary:
          issues.length === 0
            ? message
            : `${message} ${issues.slice(0, 10).join('；')}`,
        details: { code, issues },
      },
    ],
    failure: {
      code,
      message,
      details: { issues, ...details },
    },
    repairInstructions: GATE_0_REPAIR_INSTRUCTIONS[code],
  };
}

function buildSchemaEvidence(
  spec: GeneratedAppSpecV2,
): GeneratedAppGateEvidence {
  const requirementScenarios = spec.acceptanceScenarios.filter(
    (scenario) => scenario.scope === 'requirement',
  );
  return {
    id: 'gate-0-app-spec-v2',
    label: 'AppSpec v2 契约',
    kind: 'app_spec',
    url: null,
    summary: `需求 ${spec.coreRequirements.filter((requirement) => requirement.source === 'prompt').length} 条（另有平台需求），表单字段 ${spec.inputForm.fields.length} 个，结果分区 ${spec.resultView.sections.length} 个，可在浏览器执行的验收场景 ${requirementScenarios.length} 条。`,
    details: {
      fieldIds: spec.inputForm.fields.map((field) => field.id),
      sectionIds: spec.resultView.sections.map((section) => section.id),
      scenarioIds: requirementScenarios.map((scenario) => scenario.id),
    },
  };
}

function buildBindingEvidence(
  resolved: ResolvedGeneratedAppBinding,
): GeneratedAppGateEvidence {
  if (resolved.kind === 'workflow') {
    return {
      id: 'gate-0-binding',
      label: '绑定复核',
      kind: 'app_spec',
      url: null,
      summary: `工作流「${resolved.candidate.name}」固定版本 ${resolved.binding.workflowVersionId}，${resolved.binding.inputMapping.length} 个输入映射、${resolved.binding.outputMapping.length} 个输出映射与已发布快照兼容。`,
      details: {
        kind: 'workflow',
        workflowDefinitionId: resolved.binding.workflowDefinitionId,
        workflowVersionId: resolved.binding.workflowVersionId,
      },
    };
  }

  return {
    id: 'gate-0-binding',
    label: '绑定复核',
    kind: 'app_spec',
    url: null,
    summary: `Agent「${resolved.candidate.name}」固定版本 ${resolved.binding.agentVersionId}，回复写入分区 ${resolved.binding.replySectionId}。`,
    details: {
      kind: 'agent',
      agentDefinitionId: resolved.binding.agentDefinitionId,
      agentVersionId: resolved.binding.agentVersionId,
    },
  };
}
