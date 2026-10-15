import { describe, expect, it } from 'vitest';
import { routingModelChoiceDefinition } from '../definitions/routing-model-choice.definition';
import { teamMessageRelevanceDefinition } from '../definitions/team-message-relevance.definition';
import type {
  RoutingModelChoiceInput,
  TeamMessageRelevanceInput,
} from '../decision.types';

describe('teamMessageRelevanceDefinition', () => {
  const input: TeamMessageRelevanceInput = {
    recipient: {
      role: 'implementer',
      instructions: '整合负责人',
      recentOutput: 'x'.repeat(3000),
    },
    message: {
      fromRole: 'locator',
      kind: 'observation',
      content: 'y'.repeat(5000),
      refs: ['src/a.ts'],
    },
  };

  it('state 截断接收者近期输出到 1500、消息正文到 4000 字符', () => {
    const state = teamMessageRelevanceDefinition.buildState(input) as {
      recipient: { role: string; recentOutput: string };
      message: { fromRole: string; content: string; refs: string[] };
    };

    expect(state.recipient.role).toBe('implementer');
    expect(state.recipient.recentOutput).toHaveLength(1500);
    expect(state.recipient.recentOutput.endsWith('…')).toBe(true);
    expect(state.message.content).toHaveLength(4000);
    expect(state.message.refs).toEqual(['src/a.ts']);
  });

  it('接收者尚无输出时 recentOutput 为空串', () => {
    const state = teamMessageRelevanceDefinition.buildState({
      ...input,
      recipient: { ...input.recipient, recentOutput: null },
    }) as { recipient: { recentOutput: string } };

    expect(state.recipient.recentOutput).toBe('');
  });

  it('规则恒为投递', () => {
    expect(teamMessageRelevanceDefinition.rule(input)).toEqual({
      type: 'noul',
      value: 1,
    });
    expect(teamMessageRelevanceDefinition).toMatchObject({
      type: 'noul',
      shadow: true,
      criteria: { true: expect.any(String), false: expect.any(String) },
    });
  });
});

describe('routingModelChoiceDefinition', () => {
  const input: RoutingModelChoiceInput = {
    queryText: 'q'.repeat(5000),
    taskCategory: 'code',
    inputTokenCount: 321,
    candidates: [
      {
        id: 'model-a',
        name: 'gpt-4o',
        provider: 'openai',
        qualityRank: 1,
        avgLatencyMs: 800,
        costs: { input: 0.0025, output: 0.01 },
      },
      {
        id: 'model-b',
        name: 'claude-sonnet',
        provider: 'anthropic',
        qualityRank: 2,
        avgLatencyMs: 600,
        costs: { input: 0.003, output: 0.015 },
      },
    ],
    selectedModelId: 'model-b',
  };

  it('options 以候选 id 为键并描述质量、延迟与价格', () => {
    expect(routingModelChoiceDefinition.buildOptions?.(input)).toEqual({
      'model-a':
        'gpt-4o (openai) quality=1 latency=800ms in=$0.0025/1k out=$0.01/1k',
      'model-b':
        'claude-sonnet (anthropic) quality=2 latency=600ms in=$0.003/1k out=$0.015/1k',
    });
  });

  it('state 截断任务文本到 4000 字符并保留候选元数据', () => {
    const state = routingModelChoiceDefinition.buildState(input) as {
      task: {
        queryText: string;
        taskCategory: string;
        inputTokenCount: number;
      };
      candidates: Array<{ id: string }>;
    };

    expect(state.task.queryText).toHaveLength(4000);
    expect(state.task).toMatchObject({
      taskCategory: 'code',
      inputTokenCount: 321,
    });
    expect(state.candidates.map((candidate) => candidate.id)).toEqual([
      'model-a',
      'model-b',
    ]);
  });

  it('规则结果即实际选中的模型', () => {
    expect(routingModelChoiceDefinition.rule(input)).toEqual({
      type: 'choice',
      choice: 'model-b',
      probabilities: { 'model-b': 1 },
      confidence: 1,
    });
  });
});
