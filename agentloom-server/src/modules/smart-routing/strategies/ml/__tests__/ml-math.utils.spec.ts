import { describe, expect, it } from 'vitest';

import {
  cosineSimilarity,
  eloExpectedScore,
  eloUpdateRating,
  matmul,
  relu,
  softmax,
} from '../ml-math.utils';

describe('ml-math.utils', () => {
  it('matmul 应该返回手工可验证的矩阵乘积', () => {
    expect(
      matmul(
        [
          [1, 2],
          [3, 4],
        ],
        [
          [5, 6],
          [7, 8],
        ],
      ),
    ).toEqual([
      [19, 22],
      [43, 50],
    ]);
  });

  it('relu 应该只保留正数', () => {
    expect(relu([-3, 0, 2.5, 7])).toEqual([0, 0, 2.5, 7]);
  });

  it('softmax 应该返回手工计算的概率分布', () => {
    const result = softmax([1, 2, 3]);

    expect(result[0]).toBeCloseTo(0.09003057317038046, 12);
    expect(result[1]).toBeCloseTo(0.24472847105479764, 12);
    expect(result[2]).toBeCloseTo(0.6652409557748218, 12);
    expect(result.reduce((sum, value) => sum + value, 0)).toBeCloseTo(1, 12);
  });

  it('cosineSimilarity 应该返回手工��算的余弦相似度', () => {
    expect(cosineSimilarity([1, 0, 1], [1, 1, 0])).toBeCloseTo(0.5, 12);
  });

  it('eloExpectedScore 应该返回标准 Elo 期望分', () => {
    expect(eloExpectedScore(1600, 1500)).toBeCloseTo(0.6400649998028851, 12);
  });

  it('eloUpdateRating 应该按 K 因子更新评分', () => {
    const expected = eloExpectedScore(1600, 1500);
    expect(eloUpdateRating(1600, expected, 1, 32)).toBeCloseTo(
      1611.5179200063076,
      12,
    );
  });
});
