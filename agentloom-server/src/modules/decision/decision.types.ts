/**
 * 可替换决策服务的类型：决策定义（规则 + 外部模型问题形状）、provider 端口与请求/结果。
 *
 * 规则 provider 的结果是主结果（决定行为）；Jev provider 只以影子模式记录，不控制任何行为。
 */

export const DECISION_KINDS = [
  'team.message_relevance',
  'routing.model_choice',
] as const;
export type DecisionKind = (typeof DECISION_KINDS)[number];

export const DECISION_SUBJECT_TYPES = [
  'team_message',
  'routing_decision',
] as const;
export type DecisionSubjectType = (typeof DECISION_SUBJECT_TYPES)[number];

export const DECISION_PROVIDER_NAMES = ['rule', 'jev'] as const;
export type DecisionProviderName = (typeof DECISION_PROVIDER_NAMES)[number];

export const DECISION_MODES = ['primary', 'shadow'] as const;
export type DecisionMode = (typeof DECISION_MODES)[number];

export type DecisionOutcome =
  | { type: 'noul'; value: number }
  | {
      type: 'choice';
      choice: string;
      probabilities: Record<string, number>;
      confidence: number;
    };

export interface DecisionDefinition<I> {
  kind: DecisionKind;
  type: 'noul' | 'choice';
  /** 定义变更（问题、state 形状、规则）时递增，落库便于按版本比较影子结果 */
  version: number;
  /** 是否在配置了 Jev 时运行影子评估 */
  shadow: boolean;
  instructions: string;
  /** noul 问题的真/假判据；choice 问题用 buildOptions */
  criteria?: { true: string; false: string };
  buildState(input: I): unknown;
  buildOptions?(input: I): Record<string, string>;
  rule(input: I): DecisionOutcome;
}

export interface DecisionRequest<I> {
  kind: DecisionKind;
  tenantId: string;
  subject: { type: DecisionSubjectType; id: string };
  input: I;
}

export interface DecisionResult {
  outcome: DecisionOutcome;
  /** 主记录（规则结果）在 decision_records 中的 id */
  recordId: string;
}

export interface DecisionProviderEvaluation {
  outcome: DecisionOutcome;
  model?: string;
  usage?: { inputTokens: number; outputTokens: number };
}

export interface DecisionProvider {
  readonly name: DecisionProviderName;
  evaluate<I>(
    def: DecisionDefinition<I>,
    input: I,
    signal: AbortSignal,
  ): Promise<DecisionProviderEvaluation>;
}

/** team.message_relevance 的输入：一条团队消息与它的接收者 */
export interface TeamMessageRelevanceInput {
  recipient: {
    role: string;
    instructions: string;
    /** 接收者最近一条 assistant 消息内容（调用方可不截断，定义内截断到 1500 字符） */
    recentOutput: string | null;
  };
  message: {
    fromRole: string | null;
    kind: string;
    content: string;
    refs: string[];
  };
}

/** routing.model_choice 的输入：一次路由节点决策的任务与候选 */
export interface RoutingModelChoiceInput {
  queryText: string | null;
  taskCategory: string | null;
  inputTokenCount: number;
  candidates: Array<{
    id: string;
    name: string;
    provider: string;
    qualityRank: number;
    avgLatencyMs: number;
    costs: { input: number; output: number };
  }>;
  /** 主策略（规则侧）实际选中的模型 */
  selectedModelId: string;
}

export interface DecisionInputByKind {
  'team.message_relevance': TeamMessageRelevanceInput;
  'routing.model_choice': RoutingModelChoiceInput;
}
