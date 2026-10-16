import { OPTIMIZATION_BUDGET_GROWTH_FACTOR } from '../optimization-proposal.constants';
import { createTeamBudgetAnalyzer } from './team-analyzer.factory';

const MAX_DEADLINE_MINUTES = 1440;

/** 超过截止时间 → 截止分钟数 × 1.5，封顶 1440 */
export const teamDeadlineAnalyzer = createTeamBudgetAnalyzer({
  proposalType: 'team_deadline',
  field: 'deadlineMinutes',
  fieldLabel: '截止时间（分钟）',
  reasonLabel: '超过截止时间',
  matches: (row) =>
    row.status === 'failed' && row.failureReason === 'deadline_exceeded',
  propose: (current) =>
    current >= MAX_DEADLINE_MINUTES
      ? null
      : Math.min(
          MAX_DEADLINE_MINUTES,
          Math.ceil(current * OPTIMIZATION_BUDGET_GROWTH_FACTOR),
        ),
});
