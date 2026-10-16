import type { RoutingAnalyzer, TeamAnalyzer } from './optimization-analyzer.types';
import { routingFallbackModelAnalyzer } from './routing-fallback-model.analyzer';
import { teamBudgetMessagesAnalyzer } from './team-budget-messages.analyzer';
import { teamBudgetTokensAnalyzer } from './team-budget-tokens.analyzer';
import { teamDeadlineAnalyzer } from './team-deadline.analyzer';

export const TEAM_ANALYZERS: TeamAnalyzer[] = [
  teamBudgetTokensAnalyzer,
  teamBudgetMessagesAnalyzer,
  teamDeadlineAnalyzer,
];

export const ROUTING_ANALYZERS: RoutingAnalyzer[] = [
  routingFallbackModelAnalyzer,
];
