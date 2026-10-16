import { OPTIMIZATION_BUDGET_GROWTH_FACTOR } from '../optimization-proposal.constants';
import { createTeamBudgetAnalyzer } from './team-analyzer.factory';

/** Token 预算耗尽（用量达到上限）→ 上限 × 1.5，向上取整到千 */
export const teamBudgetTokensAnalyzer = createTeamBudgetAnalyzer({
  proposalType: 'team_budget_tokens',
  field: 'maxTotalTokens',
  fieldLabel: 'Token 上限',
  reasonLabel: 'Token 预算耗尽',
  matches: (row) =>
    row.status === 'failed' &&
    row.failureReason === 'budget_exhausted' &&
    row.usedTotalTokens >= row.budgetMaxTotalTokens,
  propose: (current) =>
    Math.ceil((current * OPTIMIZATION_BUDGET_GROWTH_FACTOR) / 1000) * 1000,
});
