import { TeamNodeConfigSchema } from '@agentloom/contracts';
import { describe, expect, it } from 'vitest';

import type {
  TeamNodeEvidence,
  TeamRunEvidenceRow,
} from '../../analyzers/optimization-analyzer.types';
import { teamBudgetMessagesAnalyzer } from '../../analyzers/team-budget-messages.analyzer';
import { teamBudgetTokensAnalyzer } from '../../analyzers/team-budget-tokens.analyzer';
import { teamDeadlineAnalyzer } from '../../analyzers/team-deadline.analyzer';

const AGENT_ID = '019577a0-0000-7000-8000-000000000001';
const VERSION_ID = '019577a0-0000-7000-8000-000000000002';

function makeEvidence(
  budget: {
    maxTotalTokens?: number;
    maxMessages?: number;
    deadlineMinutes?: number;
  },
  runs: TeamRunEvidenceRow[],
): TeamNodeEvidence {
  const config = TeamNodeConfigSchema.parse({
    objective: '修复问题',
    members: [
      {
        role: 'lead',
        agentDefinitionId: AGENT_ID,
        isLead: true,
        canMessage: ['worker'],
      },
      { role: 'worker', agentDefinitionId: AGENT_ID, canMessage: ['lead'] },
    ],
    budget,
  });
  return {
    workflowDefinitionId: 'wf-1',
    nodeId: 'team-1',
    baseVersionId: VERSION_ID,
    nodeData: { config },
    config,
    runs,
    window: {
      start: new Date('2026-01-01T00:00:00Z'),
      end: new Date('2026-01-29T00:00:00Z'),
    },
  };
}

function run(
  overrides: Partial<TeamRunEvidenceRow> & { id: string },
): TeamRunEvidenceRow {
  return {
    status: 'failed',
    failureReason: 'budget_exhausted',
    usedTotalTokens: 1000,
    messageCount: 1,
    budgetMaxTotalTokens: 500_000,
    budgetMaxMessages: 1,
    deadlineMinutes: 60,
    ...overrides,
  };
}

describe('teamBudgetMessagesAnalyzer', () => {
  it('样本不足 3 次时不提案', () => {
    const evidence = makeEvidence({ maxMessages: 1 }, [
      run({ id: 'r1' }),
      run({ id: 'r2' }),
    ]);
    expect(teamBudgetMessagesAnalyzer(evidence)).toBeNull();
  });

  it('消息数耗尽占比达阈值时提议放大 1.5 倍（1 → 2）并带证据', () => {
    const evidence = makeEvidence({ maxMessages: 1 }, [
      run({ id: 'r1' }),
      run({ id: 'r2' }),
      run({ id: 'r3' }),
    ]);
    const candidate = teamBudgetMessagesAnalyzer(evidence);
    expect(candidate).toMatchObject({
      proposalType: 'team_budget_messages',
      configPath: 'config.budget.maxMessages',
      currentValue: 1,
      proposedValue: 2,
      evidence: {
        sampleCount: 3,
        matchedCount: 3,
        matchedRate: 1,
        sampleIds: ['r1', 'r2', 'r3'],
      },
    });
    expect(candidate?.rationale).toBe(
      '最近 28 天 3 次团队运行中 3 次因消息数达到上限失败（100%），建议把消息数上限从 1 提高到 2',
    );
  });

  it('200 → 300；已到 1000 上限不提案', () => {
    const rows = (max: number) =>
      ['r1', 'r2', 'r3'].map((id) =>
        run({ id, messageCount: max, budgetMaxMessages: max }),
      );
    expect(
      teamBudgetMessagesAnalyzer(makeEvidence({ maxMessages: 200 }, rows(200)))
        ?.proposedValue,
    ).toBe(300);
    expect(
      teamBudgetMessagesAnalyzer(
        makeEvidence({ maxMessages: 1000 }, rows(1000)),
      ),
    ).toBeNull();
  });

  it('Token 同时耗尽的失败归 Token 分析器，不计入消息数', () => {
    const rows = ['r1', 'r2', 'r3'].map((id) =>
      run({ id, usedTotalTokens: 500_000 }),
    );
    const evidence = makeEvidence({ maxMessages: 1 }, rows);
    expect(teamBudgetMessagesAnalyzer(evidence)).toBeNull();
    expect(teamBudgetTokensAnalyzer(evidence)).toMatchObject({
      configPath: 'config.budget.maxTotalTokens',
      currentValue: 500_000,
      proposedValue: 750_000,
    });
  });

  it('匹配占比低于 50% 不提案', () => {
    const evidence = makeEvidence({ maxMessages: 1 }, [
      run({ id: 'r1' }),
      run({ id: 'r2', status: 'completed', failureReason: null }),
      run({ id: 'r3', status: 'completed', failureReason: null }),
    ]);
    expect(teamBudgetMessagesAnalyzer(evidence)).toBeNull();
  });
});

describe('teamBudgetTokensAnalyzer', () => {
  it('提议值向上取整到千', () => {
    const rows = ['r1', 'r2', 'r3'].map((id) =>
      run({
        id,
        usedTotalTokens: 1001,
        budgetMaxTotalTokens: 1001,
        messageCount: 0,
      }),
    );
    expect(
      teamBudgetTokensAnalyzer(makeEvidence({ maxTotalTokens: 1001 }, rows))
        ?.proposedValue,
    ).toBe(2000);
  });
});

describe('teamDeadlineAnalyzer', () => {
  const deadlineRows = ['r1', 'r2', 'r3'].map((id) =>
    run({ id, failureReason: 'deadline_exceeded' }),
  );

  it('超时失败占比达阈值时 60 → 90', () => {
    expect(
      teamDeadlineAnalyzer(makeEvidence({ deadlineMinutes: 60 }, deadlineRows)),
    ).toMatchObject({
      configPath: 'config.budget.deadlineMinutes',
      proposedValue: 90,
    });
  });

  it('已到 1440 分钟上限不提案；1000 封顶到 1440', () => {
    expect(
      teamDeadlineAnalyzer(
        makeEvidence({ deadlineMinutes: 1440 }, deadlineRows),
      ),
    ).toBeNull();
    expect(
      teamDeadlineAnalyzer(
        makeEvidence({ deadlineMinutes: 1000 }, deadlineRows),
      )?.proposedValue,
    ).toBe(1440);
  });
});
