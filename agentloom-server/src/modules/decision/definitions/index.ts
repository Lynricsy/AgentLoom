import type {
  DecisionDefinition,
  DecisionInputByKind,
  DecisionKind,
} from '../decision.types';
import { routingModelChoiceDefinition } from './routing-model-choice.definition';
import { teamMessageRelevanceDefinition } from './team-message-relevance.definition';

/** 决策种类 → 定义；新增种类时在 DECISION_KINDS 与此处同时登记 */
export const DECISION_DEFINITIONS: {
  [K in DecisionKind]: DecisionDefinition<DecisionInputByKind[K]>;
} = {
  'team.message_relevance': teamMessageRelevanceDefinition,
  'routing.model_choice': routingModelChoiceDefinition,
};
