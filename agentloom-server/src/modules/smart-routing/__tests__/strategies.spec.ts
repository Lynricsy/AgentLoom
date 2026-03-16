import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { costOptimized } from '../strategies/cost-optimized';
import { fallbackChain } from '../strategies/fallback-chain';
import { historicalBest } from '../strategies/historical-best';
import { latencyFirst } from '../strategies/latency-first';
import { qualityFirst } from '../strategies/quality-first';
import { tokenOptimized } from '../strategies/token-optimized';
import type { ModelCandidate } from '../strategies/types';

const candidates: ModelCandidate[] = [
  {
    id: 'model-1',
    name: 'gpt-4o',
    provider: 'openai',
    routingMeta: {
      contextWindow: 128000,
      costPer1kInputTokens: 0.005,
      costPer1kOutputTokens: 0.015,
      qualityRank: 90,
      avgLatencyMs: 500,
    },
  },
  {
    id: 'model-2',
    name: 'claude-sonnet-4-20250514',
    provider: 'anthropic',
    routingMeta: {
      contextWindow: 200000,
      costPer1kInputTokens: 0.003,
      costPer1kOutputTokens: 0.015,
      qualityRank: 92,
      avgLatencyMs: 600,
    },
  },
  {
    id: 'model-3',
    name: 'deepseek-chat',
    provider: 'deepseek',
    routingMeta: {
      contextWindow: 64000,
      costPer1kInputTokens: 0.0003,
      costPer1kOutputTokens: 0.0009,
      qualityRank: 70,
      avgLatencyMs: 800,
    },
  },
];

function getResultById<T extends { modelId: string }>(
  results: T[],
  modelId: string,
): T {
  const result = results.find((item) => item.modelId === modelId);
  expect(result).toBeDefined();
  return result as T;
}

describe('smart-routing strategies', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-01T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('tokenOptimized', () => {
    it('当所有模型都无法容纳输入时回退选择最大上下文窗口并给出警告', () => {
      const results = tokenOptimized(candidates, { inputTokenCount: 250000 });

      expect(results[0]?.modelId).toBe('model-2');
      expect(getResultById(results, 'model-2').score).toBe(100);
      expect(getResultById(results, 'model-2').reasoning).toContain(
        '警告：所有模型的上下文窗口都不足以容纳 250000 tokens 输入',
      );
    });

    it('短文本会优先选择更贴合的上下文窗口', () => {
      const results = tokenOptimized(candidates, {
        inputTokenCount: 2000,
        tokenThreshold: 4096,
      });

      expect(results[0]?.modelId).toBe('model-3');
      expect(getResultById(results, 'model-3').score).toBeGreaterThan(
        getResultById(results, 'model-1').score,
      );
      expect(getResultById(results, 'model-3').reasoning).toContain(
        '短文本路由：输入 2000 tokens 未超过阈值 4096',
      );
    });

    it('长文本会优先选择更大的上下文余量', () => {
      const results = tokenOptimized(candidates, { inputTokenCount: 100000 });

      expect(getResultById(results, 'model-2').score).toBeGreaterThan(
        getResultById(results, 'model-1').score,
      );
      expect(getResultById(results, 'model-3').score).toBe(0);
      expect(results[0]?.modelId).toBe('model-2');
      expect(getResultById(results, 'model-2').reasoning).toContain(
        '长文本路由：输入 100000 tokens 超过阈值 4096',
      );
    });
  });

  describe('costOptimized', () => {
    it('为最便宜的模型给出最高分', () => {
      const results = costOptimized(candidates, { inputTokenCount: 2000 });

      expect(results[0]?.modelId).toBe('model-3');
      expect(getResultById(results, 'model-3').score).toBeGreaterThan(
        getResultById(results, 'model-2').score,
      );
    });

    it('对最昂贵模型归一化后给 0 分', () => {
      const results = costOptimized(candidates, { inputTokenCount: 2000 });

      expect(getResultById(results, 'model-1').score).toBe(0);
    });
  });

  describe('qualityFirst', () => {
    it('得分直接等于质量排名', () => {
      const results = qualityFirst(candidates, { inputTokenCount: 1000 });

      expect(getResultById(results, 'model-1').score).toBe(90);
      expect(getResultById(results, 'model-2').score).toBe(92);
      expect(getResultById(results, 'model-3').score).toBe(70);
    });

    it('按质量从高到低排序', () => {
      const results = qualityFirst(candidates, { inputTokenCount: 1000 });

      expect(results.map((result) => result.modelId)).toEqual([
        'model-2',
        'model-1',
        'model-3',
      ]);
    });
  });

  describe('latencyFirst', () => {
    it('最低延迟模型得分最高', () => {
      const results = latencyFirst(candidates, { inputTokenCount: 1000 });

      expect(results[0]?.modelId).toBe('model-1');
      expect(getResultById(results, 'model-1').score).toBeGreaterThan(
        getResultById(results, 'model-2').score,
      );
    });

    it('对 Infinity 延迟模型给 0 分', () => {
      const slowCandidates: ModelCandidate[] = [
        candidates[0],
        candidates[1],
        {
          ...candidates[2],
          routingMeta: {
            ...candidates[2].routingMeta,
            avgLatencyMs: Number.POSITIVE_INFINITY,
          },
        },
      ];
      const results = latencyFirst(slowCandidates, { inputTokenCount: 1000 });

      expect(getResultById(results, 'model-3').score).toBe(0);
    });
  });

  describe('historicalBest', () => {
    it('成功率相同时按最近使用时间排序', () => {
      const results = historicalBest(candidates, {
        inputTokenCount: 1000,
        historicalMetrics: {
          'model-1': {
            successRate: 0.95,
            avgLatencyMs: 400,
            avgTokenUsage: 2000,
            lastUsedAt: '2024-12-30T00:00:00.000Z',
          },
          'model-2': {
            successRate: 0.95,
            avgLatencyMs: 200,
            avgTokenUsage: 500,
            lastUsedAt: '2024-12-31T00:00:00.000Z',
          },
          'model-3': {
            successRate: 0.9,
            avgLatencyMs: 500,
            avgTokenUsage: 1500,
            lastUsedAt: '2024-12-29T00:00:00.000Z',
          },
        },
      });

      expect(results[0]?.modelId).toBe('model-2');
      expect(getResultById(results, 'model-2').score).toBeGreaterThan(
        getResultById(results, 'model-3').score,
      );
      expect(getResultById(results, 'model-2').reasoning).toContain(
        '最近一次使用 2024-12-31T00:00:00.000Z',
      );
    });

    it('缺少历史数据时回退为 qualityRank', () => {
      const results = historicalBest(candidates, { inputTokenCount: 1000 });

      expect(getResultById(results, 'model-1').score).toBe(90);
      expect(getResultById(results, 'model-3').score).toBe(70);
      expect(getResultById(results, 'model-3').reasoning).toContain(
        '无历史数据，回退使用质量排名',
      );
    });
  });

  describe('fallbackChain', () => {
    it('保持候选模型的原始顺序', () => {
      const results = fallbackChain(candidates, { inputTokenCount: 1000 });

      expect(results.map((result) => result.modelId)).toEqual([
        'model-1',
        'model-2',
        'model-3',
      ]);
    });

    it('按位置每次递减 10 分', () => {
      const results = fallbackChain(candidates, { inputTokenCount: 1000 });

      expect(results.map((result) => result.score)).toEqual([100, 90, 80]);
    });
  });
});
