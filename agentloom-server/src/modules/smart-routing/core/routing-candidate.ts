export interface ExtendedRoutingMeta {
  contextWindow: number;
  costs: {
    input: number;
    output: number;
  };
  qualityRank: number;
  avgLatencyMs: number;
  maxInputTokens: number;
  eloRating: number;
}

export interface RoutingCandidate {
  id: string;
  modelConfigId: string;
  name: string;
  provider: string;
  routingMeta: ExtendedRoutingMeta;
  healthStatus: 'healthy' | 'degraded' | 'open';
}
