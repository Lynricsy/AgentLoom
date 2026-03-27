import type { LlmModelRoutingMeta } from '../../llm/llm-provider-catalog';
import type {
  RoutingContext,
  ModelEvaluationResult,
} from '../dto/routing-context.dto';

export interface ModelCandidate {
  id: string;
  name: string;
  provider: string;
  routingMeta: LlmModelRoutingMeta;
}

export type StrategyFn = (
  candidates: ModelCandidate[],
  context: RoutingContext,
) => ModelEvaluationResult[];
