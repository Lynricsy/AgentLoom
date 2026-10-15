export interface ModelScore {
  modelId: string;
  modelName: string;
  provider: string;
  score: number;
  reasoning: string;
}

/** 路由回退原因：策略本身失败后走确定性回退时记录 */
export const ROUTING_FALLBACK_REASONS = [
  'llm_timeout',
  'llm_invalid_response',
  'llm_http_error',
  'llm_config_error',
  'router_error',
] as const;

export type RoutingFallbackReason = (typeof ROUTING_FALLBACK_REASONS)[number];

/** 回退后的模型来源：已配置回退模型 / 规则路由 / 候选首位 */
export const ROUTING_FALLBACK_SOURCES = [
  'configured_model',
  'rules',
  'first_candidate',
] as const;

export type RoutingFallbackSource = (typeof ROUTING_FALLBACK_SOURCES)[number];

export interface RoutingFallback {
  reason: RoutingFallbackReason;
  source: RoutingFallbackSource;
}

export interface RoutingDecision {
  selectedModelId: string | null;
  scores: ModelScore[];
  reasoning: string;
  routerType: string;
  latencyMs: number;
  /** 仅在策略失败、走确定性回退时存在 */
  fallback?: RoutingFallback;
}
