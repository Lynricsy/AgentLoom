import { PORT_DATA_TYPE_TRANSFORM_RULES } from '@agentloom/contracts';
import { describe, expect, it } from 'vitest';

import {
  PORT_VALUE_TRANSFORMS,
  STRICT_PORT_VALUE_TRANSFORMS,
} from '../port-value-transform.util';

describe('PORT_VALUE_TRANSFORMS', () => {
  it.each(PORT_DATA_TYPE_TRANSFORM_RULES.map((rule) => [rule.transformFn]))(
    'contracts 变换规则 %s 在 server 有执行期实现',
    (transformFn) => {
      expect(PORT_VALUE_TRANSFORMS[transformFn]).toBeTypeOf('function');
    },
  );

  it('parse_json 对已结构化的上游值原样透传', () => {
    expect(PORT_VALUE_TRANSFORMS.parse_json({ a: 1 })).toEqual({ a: 1 });
  });

  it('stringify_json 对字符串原样透传，不加引号', () => {
    expect(PORT_VALUE_TRANSFORMS.stringify_json('plain')).toBe('plain');
  });

  it('ensure_array 只放行数组与输入预处理器的 { result: [...] } 信封', () => {
    expect(PORT_VALUE_TRANSFORMS.ensure_array([1, 2])).toEqual([1, 2]);
    expect(PORT_VALUE_TRANSFORMS.ensure_array({ result: [1, 2] })).toEqual([
      1, 2,
    ]);
    expect(() =>
      PORT_VALUE_TRANSFORMS.ensure_array({ result: [1], other: true }),
    ).toThrow('上游实际值不是数组（实际为 object）');
    expect(() => PORT_VALUE_TRANSFORMS.ensure_array({ items: [1] })).toThrow(
      '实际为 object',
    );
    expect(() => PORT_VALUE_TRANSFORMS.ensure_array(null)).toThrow(
      '实际为 null',
    );
    expect(() => PORT_VALUE_TRANSFORMS.ensure_array('x')).toThrow(
      '实际为 string',
    );
  });

  it('运行期校验型变换都有实现', () => {
    for (const transformFn of Object.keys(STRICT_PORT_VALUE_TRANSFORMS)) {
      expect(PORT_VALUE_TRANSFORMS[transformFn]).toBeTypeOf('function');
    }
  });
});
