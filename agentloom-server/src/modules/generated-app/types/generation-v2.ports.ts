/**
 * 生成应用 v2 各层之间的接口（ADR-0007）。只有类型，没有实现；各实现切片按这里的签名交付，
 * 集成切片据此组装。改签名必须同步通知其他切片。
 */
import type { WorkflowInputSchema } from '../../workflow/dto/workflow-input-schema.dto';
import type {
  GeneratedAppGateEvidence,
  GeneratedAppGateRunFailure,
} from './generated-app.types';
import type {
  AppSpecReferenceIssue,
  GeneratedAppBinding,
  GeneratedAppField,
  GeneratedAppResultView,
  GeneratedAppSpecV2,
} from './app-spec-v2.schema';
import type { GeneratedAppGenerationPlanV2 } from './generation-plan-v2.types';
import type {
  GeneratedAppBrowserAcceptanceJob,
  GeneratedAppBrowserAcceptanceResult,
} from './browser-acceptance-job.schema';

// ─── 1. AppSpec 生成（Gate 0 第一步） ─────────────────────────────

/** 创建者在创建应用时可指定的绑定目标；省略时由模型在租户候选中选择 */
export type GeneratedAppBindingTargetRef =
  | { kind: 'workflow'; workflowDefinitionId: string }
  | { kind: 'agent'; agentDefinitionId: string };

export interface AppSpecRepairFeedback {
  /** 上一次尝试的问题列表（Zod issue、引用规则、绑定解析失败），原样交给模型 */
  issues: string[];
  previousAttempt: number;
}

export interface AppSpecGenerationInput {
  tenantId: string;
  userId: string;
  prompt: string;
  /** 创建时指定；为 null 时用租户默认 chat 模型 */
  modelConfigId: string | null;
  bindingTarget: GeneratedAppBindingTargetRef | null;
  feedback: AppSpecRepairFeedback | null;
  /** 取自 APP_GENERATED_APP_SPEC_TIMEOUT_MS */
  signal: AbortSignal;
}

export interface AppSpecGenerationUsage {
  promptTokens: number;
  completionTokens: number;
}

export type AppSpecGenerationFailureCode =
  | 'app-spec-model-unavailable'
  | 'app-spec-binding-candidates-empty'
  | 'app-spec-model-output-invalid'
  | 'app-spec-binding-invalid'
  | 'app-spec-generation-timeout';

export type AppSpecGenerationResult =
  | {
      status: 'generated';
      appSpec: GeneratedAppSpecV2;
      resolvedBinding: ResolvedGeneratedAppBinding;
      modelConfigId: string;
      attempts: number;
      usage: AppSpecGenerationUsage;
    }
  | {
      status: 'failed';
      code: AppSpecGenerationFailureCode;
      message: string;
      issues: string[];
      modelConfigId: string | null;
      attempts: number;
      usage: AppSpecGenerationUsage;
      /** 最后一次模型输出的前 2000 字符（已脱敏），用于排查 */
      rawOutputPreview: string | null;
    };

/** 内部做「生成 → 解析 → 引用检查 → 绑定解析 → 带反馈重试」，最多 GENERATED_APP_SPEC_MAX_ATTEMPTS 次 */
export interface GeneratedAppSpecGenerator {
  generate(input: AppSpecGenerationInput): Promise<AppSpecGenerationResult>;
}

// ─── 2. 绑定候选与解析 ───────────────────────────────────────────

export interface WorkflowBindingCandidate {
  kind: 'workflow';
  workflowDefinitionId: string;
  /** 当前已发布版本 */
  workflowVersionId: string;
  name: string;
  description: string | null;
  /** 已发布版本快照中的 inputSchema；null 表示无声明，按顶层 inputParams 键传入 */
  inputSchema: WorkflowInputSchema | null;
  outputNodes: Array<{
    nodeId: string;
    nodeType: 'text-output' | 'json-output';
    label: string;
  }>;
}

export interface AgentBindingCandidate {
  kind: 'agent';
  agentDefinitionId: string;
  agentVersionId: string;
  name: string;
  description: string | null;
}

export type GeneratedAppBindingCandidate =
  WorkflowBindingCandidate | AgentBindingCandidate;

export type ResolvedGeneratedAppBinding =
  | {
      kind: 'workflow';
      binding: Extract<GeneratedAppBinding, { kind: 'workflow' }>;
      candidate: WorkflowBindingCandidate;
    }
  | {
      kind: 'agent';
      binding: Extract<GeneratedAppBinding, { kind: 'agent' }>;
      candidate: AgentBindingCandidate;
    };

export interface GeneratedAppBindingResolver {
  /**
   * target 非空时只返回该目标（不存在、未发布或无权访问返回空数组）；
   * 否则返回租户内最近更新的已发布工作流（排除生成应用运行时工作流）与已发布 Agent，最多 20 个。
   */
  listCandidates(
    tenantId: string,
    target: GeneratedAppBindingTargetRef | null,
  ): Promise<GeneratedAppBindingCandidate[]>;
  /**
   * 校验 AppSpec 的绑定（Gate 0 与 Gate 4 复用）：目标存在、已发布、版本仍是固定版本或可重新固定；
   * 工作流：每个 required 输入被映射、类型兼容（text/textarea→text、number→number、
   * single/multi_select→同类型且选项是工作流 options 的子集）、输出节点存在于固定版本快照。
   */
  resolve(
    tenantId: string,
    appSpec: Pick<GeneratedAppSpecV2, 'binding' | 'inputForm'>,
  ): Promise<
    | { ok: true; resolved: ResolvedGeneratedAppBinding }
    | { ok: false; issues: AppSpecReferenceIssue[] }
  >;
}

// ─── 3. 公开运行：表单与提交 ─────────────────────────────────────

/** 公开端（Studio 公开页、Playwright）看到的表单；取代 v1 的固定字段表单 */
export interface PublicGeneratedAppRuntimeFormV2 {
  formId: string;
  title: string;
  description: string;
  submitLabel: string;
  fields: GeneratedAppField[];
  resultView: GeneratedAppResultView;
}

export type GeneratedAppSubmissionValidation =
  | { ok: true; values: Record<string, string | number | string[]> }
  | { ok: false; errors: Array<{ field: string; message: string }> };

export interface GeneratedAppRuntimeFormBuilder {
  buildPublicForm(appSpec: GeneratedAppSpecV2): PublicGeneratedAppRuntimeFormV2;
  /** 严格校验：未知字段、类型、必填、长度、范围、选项 */
  validateSubmission(
    appSpec: GeneratedAppSpecV2,
    input: unknown,
  ): GeneratedAppSubmissionValidation;
}

// ─── 4. 运行时绑定：提交 → 执行 → 结果 ────────────────────────────

export interface GeneratedAppRunRequest {
  /** 工作流绑定为被绑定的工作流；Agent 绑定为 Gate 7 创建的包装工作流 */
  workflowDefinitionId: string;
  workflowVersionId: string;
  inputParams: Record<string, unknown>;
  /** 固定版本快照 inputSchema.version；无 inputSchema 时省略 */
  schemaVersion: number | undefined;
}

export interface GeneratedAppRuntimeResultSection {
  sectionId: string;
  label: string;
  format: GeneratedAppResultView['sections'][number]['format'];
  /** 已经公开脱敏；citations 为数组，json 为对象 */
  value: unknown;
}

export interface GeneratedAppRuntimeResult {
  status: 'running' | 'completed' | 'failed';
  sections: GeneratedAppRuntimeResultSection[];
  /** 公开可见的失败原因（不含内部节点/错误细节） */
  publicError: string | null;
}

export interface GeneratedAppRuntimeBindingAdapter {
  /**
   * 运行时工作流：工作流绑定返回被绑定工作流 + 固定版本；Agent 绑定构建并发布
   * trigger → agent → text-output 包装工作流（inputSchema 由表单字段生成，metadata 标记 generatedAppId）。
   */
  ensureRuntimeWorkflow(params: {
    tenantId: string;
    userId: string;
    appId: string;
    appSpec: GeneratedAppSpecV2;
    generationRunId: string;
  }): Promise<{ workflowDefinitionId: string; workflowVersionId: string }>;
  mapSubmission(
    appSpec: GeneratedAppSpecV2,
    runtime: {
      workflowDefinitionId: string;
      workflowVersionId: string;
      inputSchemaVersion: number | undefined;
    },
    values: Record<string, string | number | string[]>,
  ): GeneratedAppRunRequest;
  /** 按 outputMapping 从执行步骤结果中取出结果分区 */
  extractResult(
    appSpec: GeneratedAppSpecV2,
    execution: {
      status: string;
      steps: Array<{
        nodeId: string;
        status: string;
        result: Record<string, unknown> | null;
      }>;
    },
  ): GeneratedAppRuntimeResult;
}

// ─── 5. Gate 计划构建器 ─────────────────────────────────────────

export interface GeneratedAppGateContextV2 {
  tenantId: string;
  userId: string;
  appId: string;
  generationRunId: string;
  appSpec: GeneratedAppSpecV2;
  resolvedBinding: ResolvedGeneratedAppBinding;
  /** 本次运行中已完成的前序门禁 */
  previousGates: ReadonlyArray<{
    gateId: string;
    status: 'passed' | 'failed' | 'warning' | 'skipped';
    evidence: GeneratedAppGateEvidence[];
  }>;
  /** 前序 Gate 已写入的计划（Gate 1 起逐步补全）；Gate 6/7 据此复核证据 */
  generationPlan: GeneratedAppGenerationPlanV2;
  /** 运行级截止（maxRuntimeSeconds）：超时后取消等待中的执行 */
  signal: AbortSignal;
}

export interface GeneratedAppGateEvaluationV2<TPlan = unknown> {
  status: 'passed' | 'failed';
  summary: string;
  evidence: GeneratedAppGateEvidence[];
  failure: GeneratedAppGateRunFailure | null;
  repairInstructions: string | null;
  /** 写入 generationPlan 对应键的计划（Gate 1–4、6、7） */
  plan: TPlan | null;
}

/** Gate 1–4、6、7 的统一签名；Gate 0 由生成器 + 解析器组成，Gate 5 见 BrowserAcceptanceExecutor */
export type GeneratedAppGateRunnerV2<TPlan = unknown> = (
  context: GeneratedAppGateContextV2,
) => Promise<GeneratedAppGateEvaluationV2<TPlan>>;

// ─── 6. Gate 5 浏览器执行器 ─────────────────────────────────────

/**
 * browser-runner 进程中的执行器（`PlaywrightBrowserAcceptanceExecutor`）：Playwright 执行 job 并返回结果，
 * 浏览器启动失败、总超时、证据上传失败写进 runnerError，不抛异常。
 *
 * worker 侧不实现本接口：任务里的验收令牌要由 worker 签发，`GeneratedAppBrowserAcceptanceDispatcher`
 * 负责「确认有在线 runner → 签发令牌 → 投递（jobId `gate5-<runId>`）→ 等待返回值（总超时 + 30s）
 * → 撤销令牌」，并把 runner 不可用 / 超时 / 处理失败区分为不同结局交给 Gate 5。
 */
export interface GeneratedAppBrowserAcceptanceExecutor {
  execute(
    job: GeneratedAppBrowserAcceptanceJob,
  ): Promise<GeneratedAppBrowserAcceptanceResult>;
}

// ─── 7. 仓储新增方法（由 SpecGen 切片在 GeneratedAppRepository 中实现） ──

export interface GeneratedAppRepositoryV2Additions {
  /** 签发 Gate 5 验收令牌（只存 sha256），TTL 到期或撤销后失效 */
  issueAcceptanceToken(params: {
    tenantId: string;
    appId: string;
    generationRunId: string;
    ttlMs: number;
  }): Promise<{ token: string; expiresAt: Date }>;
  revokeAcceptanceToken(tenantId: string, appId: string): Promise<void>;
  /** 公开路由按令牌取应用：先按 publicShareToken（已发布），再按未过期的验收令牌 */
  findByPublicOrAcceptanceToken(token: string): Promise<
    | { access: 'public'; appId: string; tenantId: string }
    | {
        access: 'acceptance';
        appId: string;
        tenantId: string;
        generationRunId: string;
      }
    | null
  >;
  saveGeneratedAppSpec(params: {
    tenantId: string;
    userId: string;
    appId: string;
    appSpec: GeneratedAppSpecV2;
    generationModelConfigId: string;
  }): Promise<void>;
}
