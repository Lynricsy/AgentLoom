/**
 * 生成应用 v2 的 `generated_apps.generation_plan` 形状（ADR-0007 §4）。
 *
 * 每个 Gate 把自己的计划/报告写入对应键；后续 Gate 只读取前序 Gate 的键，不重新推导。
 * 不含任何固定字段假设：字段、结果分区、绑定都来自 AppSpec v2。
 */
import type { GeneratedAppFieldType } from './app-spec-v2.schema';
import type {
  GeneratedAppBrowserAcceptanceResult,
  GeneratedAppBrowserViewportId,
} from './browser-acceptance-job.schema';

/** 各 Gate runner 的执行级别：real 真实执行；fixture 仅供单测，不得放行发布；disabled 直接失败 */
export type GeneratedAppGateExecutionLevel = 'real' | 'fixture' | 'disabled';

export const GENERATED_APP_GATE_EXECUTION_LEVELS = [
  'real',
  'fixture',
  'disabled',
] as const satisfies readonly GeneratedAppGateExecutionLevel[];

export type GeneratedAppPinnedBinding =
  | {
      kind: 'workflow';
      workflowDefinitionId: string;
      workflowVersionId: string;
    }
  | {
      kind: 'agent';
      agentDefinitionId: string;
      agentVersionId: string;
    };

// ─── Gate 1：需求 → 场景 → 字段/分区 → 绑定 覆盖矩阵 ─────────────────

export interface GeneratedAppRequirementCoverage {
  requirementId: string;
  source: 'prompt' | 'platform';
  /** 验证该需求的场景（prompt 需求只计 requirement 场景） */
  scenarioIds: string[];
  /** 场景步骤填写/选择的字段 */
  fieldIds: string[];
  /** 场景步骤断言的结果分区 */
  sectionIds: string[];
  /** 字段映射到的工作流输入；Agent 绑定为 `agent:message` */
  bindingInputs: string[];
  /** 分区来源的输出节点；Agent 绑定为 `agent:reply` */
  bindingOutputs: string[];
}

export interface GeneratedAppCoveragePlan {
  requirements: GeneratedAppRequirementCoverage[];
  /** 没有被任何 requirement 场景断言的结果分区 */
  unassertedSectionIds: string[];
  /** 没有被任何 requirement 场景填写的字段（可选字段允许为空） */
  untouchedFieldIds: string[];
}

// ─── Gate 2：静态合约 ────────────────────────────────────────────

export interface GeneratedAppPublicInputContract {
  /** 由表单字段生成的 JSON Schema（draft 2020-12 子集），公开提交以它为准 */
  jsonSchema: Record<string, unknown>;
  fields: Array<{
    fieldId: string;
    type: GeneratedAppFieldType;
    required: boolean;
    /** 映射到的工作流输入 id；Agent 绑定为 null（整体作为用户消息） */
    workflowInputFieldId: string | null;
  }>;
}

export interface GeneratedAppResultContract {
  sections: Array<{
    sectionId: string;
    format: 'text' | 'markdown' | 'citations' | 'json';
    source:
      | {
          kind: 'workflow-output';
          nodeId: string;
          nodeType: 'text-output' | 'json-output';
          path: string | null;
        }
      | { kind: 'agent-reply' };
  }>;
}

export interface GeneratedAppStaticContractsV2 {
  publicInput: GeneratedAppPublicInputContract;
  result: GeneratedAppResultContract;
  /** 与固定版本快照的兼容性检查结论（逐条） */
  bindingCompatibility: Array<{
    check: string;
    passed: boolean;
    detail: string;
  }>;
  /** Agent 绑定的包装工作流图结构校验；工作流绑定为 null */
  wrapperWorkflow: {
    nodeIds: string[];
    edgeCount: number;
    structureErrors: string[];
  } | null;
}

// ─── Gate 3：工作区物化与 contract 测试 ─────────────────────────────

export interface GeneratedAppWorkspaceFile {
  path: string;
  kind: 'source' | 'test' | 'report' | 'manifest';
  sha256: string;
  sizeBytes: number;
}

export interface GeneratedAppContractCaseResult {
  caseId: string;
  scenarioId: string | null;
  kind:
    'scenario-submission' | 'reject-unknown-field' | 'reject-missing-required';
  passed: boolean;
  detail: string;
}

export interface GeneratedAppBuildUnitPlanV2 {
  executionLevel: GeneratedAppGateExecutionLevel;
  workspace: {
    /**
     * 工作区在对象存储中的前缀（`tenants/<t>/generated-apps/<a>/runs/<r>/gate-3`，不带结尾 `/`），
     * 文件对象 key 为 `<relativePath>/<files[].path>`。只作展示：读取时按租户、应用与运行重新推导前缀。
     */
    relativePath: string;
    files: GeneratedAppWorkspaceFile[];
  } | null;
  contractCases: GeneratedAppContractCaseResult[];
}

// ─── Gate 4：绑定复核 ───────────────────────────────────────────

export interface GeneratedAppIntegrationPlanV2 {
  executionLevel: GeneratedAppGateExecutionLevel;
  checks: Array<{ check: string; passed: boolean; detail: string }>;
}

// ─── Gate 5：浏览器验收（runner 由 browser-runner 切片实现） ────────

export interface GeneratedAppBrowserAcceptancePlanV2 {
  planVersion: 2;
  executionLevel: GeneratedAppGateExecutionLevel;
  scenarioIds: string[];
  viewports: GeneratedAppBrowserViewportId[];
  artifactPrefix: string;
  jobId: string | null;
  /** browser-runner 原样返回的结果；未执行时为 null */
  result: GeneratedAppBrowserAcceptanceResult | null;
}

// ─── Gate 6：确定性复核 ─────────────────────────────────────────

export interface GeneratedAppVerificationFinding {
  findingId: string;
  severity: 'blocking';
  message: string;
  scenarioId: string | null;
  viewportId: GeneratedAppBrowserViewportId | null;
}

export interface GeneratedAppIndependentVerificationPlanV2 {
  executionLevel: GeneratedAppGateExecutionLevel;
  verifiedRequirementIds: string[];
  verifiedArtifactKeys: string[];
  findings: GeneratedAppVerificationFinding[];
}

// ─── Gate 7：发布候选 manifest ──────────────────────────────────

export interface GeneratedAppPublishCandidatePlanV2 {
  executionLevel: GeneratedAppGateExecutionLevel;
  manifest: {
    appSpecSha256: string;
    generationRunId: string;
    binding: GeneratedAppPinnedBinding;
    /** 公开提交实际执行的工作流：工作流绑定即被绑定工作流，Agent 绑定为包装工作流 */
    runtimeWorkflow: {
      workflowDefinitionId: string;
      workflowVersionId: string;
    } | null;
    gateEvidenceIds: Record<string, string[]>;
    artifactKeys: string[];
  };
}

export interface GeneratedAppGenerationPlanV2 {
  planVersion: 2;
  generationRunId: string;
  appSpecSha256: string;
  binding: GeneratedAppPinnedBinding;
  coverage: GeneratedAppCoveragePlan;
  staticContracts?: GeneratedAppStaticContractsV2;
  buildUnitPlan?: GeneratedAppBuildUnitPlanV2;
  integrationPlan?: GeneratedAppIntegrationPlanV2;
  browserAcceptancePlan?: GeneratedAppBrowserAcceptancePlanV2;
  independentVerificationPlan?: GeneratedAppIndependentVerificationPlanV2;
  publishCandidatePlan?: GeneratedAppPublishCandidatePlanV2;
}
