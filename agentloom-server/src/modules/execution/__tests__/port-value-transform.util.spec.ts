import { PORT_DATA_TYPE_TRANSFORM_RULES } from '@agentloom/contracts';
import { describe, expect, it } from 'vitest';

import { PORT_VALUE_TRANSFORMS } from '../port-value-transform.util';

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
});
