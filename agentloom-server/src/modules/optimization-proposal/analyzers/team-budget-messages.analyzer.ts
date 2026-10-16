import { OPTIMIZATION_BUDGET_GROWTH_FACTOR } from '../optimization-proposal.constants';
import { createTeamBudgetAnalyzer } from './team-analyzer.factory';

const MAX_MESSAGES_LIMIT = 1000;

/** 消息数达到上限（且 Token 未耗尽）→ 上限 × 1.5，封顶 1000 */
export const teamBudgetMessagesAnalyzer = createTeamBudgetAnalyzer({
  proposalType: 'team_budget_messages',
  field: 'maxMessages',
  fieldLabel: '消息数上限',
  reasonLabel: '消息数达到上限',
  matches: (row) =>
    row.status === 'failed' &&
    row.failureReason === 'budget_exhausted' &&
    row.messageCount >= row.budgetMaxMessages &&
    row.usedTotalTokens < row.budgetMaxTotalTokens,
  propose: (current) =>
    current >= MAX_MESSAGES_LIMIT
      ? null
      : Math.min(
          MAX_MESSAGES_LIMIT,
          Math.ceil(current * OPTIMIZATION_BUDGET_GROWTH_FACTOR),
        ),
});
