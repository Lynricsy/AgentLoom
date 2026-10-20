// 生成应用 v2 门禁流水线的依赖注入边界：各实现切片的 provider 经 useExisting 绑定到这些 token，
// 流水线与 Gate runner 只依赖 generation-v2.ports.ts 的接口；单测与 e2e 用 token 换入替身。

import type { ReactFlowEdge, ReactFlowNode } from '../../database/schema';
import type { WorkflowInputSchema } from '../workflow/dto/workflow-input-schema.dto';
import type {
  GeneratedAppGateEvidence,
  GeneratedAppGateRunFailure,
} from './types/generated-app.types';
import type { GeneratedAppSpecV2 } from './types/app-spec-v2.schema';
import type {
  GeneratedAppBindingTargetRef,
  GeneratedAppGateContextV2,
  GeneratedAppGateEvaluationV2,
  ResolvedGeneratedAppBinding,
} from './types/generation-v2.ports';
import type {
  GeneratedAppBrowserAcceptancePlanV2,
  GeneratedAppGateExecutionLevel,
} from './types/generation-plan-v2.types';

export const GENERATED_APP_GATE0_EVALUATOR = Symbol(
  'GeneratedAppGate0Evaluator',
);
export const GENERATED_APP_BINDING_RESOLVER = Symbol(
  'GeneratedAppBindingResolver',
);
export const GENERATED_APP_RUNTIME_FORM_BUILDER = Symbol(
  'GeneratedAppRuntimeFormBuilder',
);
export const GENERATED_APP_RUNTIME_BINDING_ADAPTER = Symbol(
  'GeneratedAppRuntimeBindingAdapter',
);
export const GENERATED_APP_AGENT_WRAPPER_BUILDER = Symbol(
  'GeneratedAppAgentWrapperBuilder',
);
export const GENERATED_APP_GATE5_RUNNER = Symbol('GeneratedAppGate5Runner');

/** Gate 0：按需生成 AppSpec、校验并解析绑定；模型调用期间不持有事务 */
export interface GeneratedAppGate0Evaluator {
  evaluate(params: {
    tenantId: string;
    userId: string;
    app: {
      id: string;
      prompt: string;
      appSpec: unknown;
      generationModelConfigId: string | null;
      bindingTarget: GeneratedAppBindingTargetRef | null;
    };
    generationRunId: string;
    regenerate: boolean;
    signal?: AbortSignal;
  }): Promise<{
    evaluation: {
      status: 'passed' | 'failed';
      summary: string;
      evidence: GeneratedAppGateEvidence[];
      failure: GeneratedAppGateRunFailure | null;
      repairInstructions: string | null;
    };
    appSpec: GeneratedAppSpecV2 | null;
    resolvedBinding: ResolvedGeneratedAppBinding | null;
    generated: boolean;
  }>;
}

/** Agent 绑定的包装工作流图（manual-trigger → agent → text-output），Gate 2 静态校验与 Gate 3 投影校验共用 */
export interface GeneratedAppAgentWrapperBuilder {
  buildAgentWrapperWorkflowGraph(
    appSpec: GeneratedAppSpecV2,
    params: { appId: string },
  ): {
    nodes: ReactFlowNode[];
    edges: ReactFlowEdge[];
    inputSchema: WorkflowInputSchema;
  };
}

export interface GeneratedAppGate5Runner {
  getExecutionLevel(): GeneratedAppGateExecutionLevel;
  run(
    context: GeneratedAppGateContextV2,
  ): Promise<GeneratedAppGateEvaluationV2<GeneratedAppBrowserAcceptancePlanV2>>;
}
