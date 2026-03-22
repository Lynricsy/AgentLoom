export interface ModelScore {
  modelId: string;
  modelName: string;
  provider: string;
  score: number;
  reasoning: string;
}

export interface RoutingDecision {
  selectedModelId: string | null;
  scores: ModelScore[];
  reasoning: string;
  routerType: string;
  latencyMs: number;
}
