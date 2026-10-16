import { describe, expect, it } from 'vitest';

import { getConfigPathValue, setConfigPathValue } from '../config-path.util';

describe('config-path.util', () => {
  it('不可变写入：只替换路径上的对象，其余字段与入参保持不变', () => {
    const data = {
      label: '团队',
      config: { objective: 'x', budget: { maxMessages: 1, maxTotalTokens: 9 } },
    };
    const next = setConfigPathValue(data, 'config.budget.maxMessages', 2);
    expect(next).toEqual({
      label: '团队',
      config: { objective: 'x', budget: { maxMessages: 2, maxTotalTokens: 9 } },
    });
    expect(data.config.budget.maxMessages).toBe(1);
    expect(getConfigPathValue(next, 'config.budget.maxMessages')).toBe(2);
  });

  it('缺失中间层创建为对象；undefined 删除末级键', () => {
    const created = setConfigPathValue({}, 'strategyConfig.fallbackModelId', 'm');
    expect(created).toEqual({ strategyConfig: { fallbackModelId: 'm' } });
    expect(
      setConfigPathValue(created, 'strategyConfig.fallbackModelId', undefined),
    ).toEqual({ strategyConfig: {} });
  });

  it('中间层不是对象时抛错；读取时返回 undefined', () => {
    expect(() => setConfigPathValue({ config: 'x' }, 'config.budget', 1)).toThrow();
    expect(getConfigPathValue({ config: 'x' }, 'config.budget')).toBeUndefined();
  });
});
