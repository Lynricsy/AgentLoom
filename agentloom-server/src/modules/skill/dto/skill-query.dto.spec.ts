import { describe, expect, it } from 'vitest';

import { SkillQuerySchema } from './skill-query.dto';

describe('SkillQuerySchema', () => {
  it.each([
    ['true', true],
    ['false', false],
  ])('isBuiltin=%s 解析为 %s', (raw, expected) => {
    expect(SkillQuerySchema.parse({ isBuiltin: raw }).isBuiltin).toBe(expected);
  });

  it('未传 isBuiltin 时不过滤', () => {
    expect(SkillQuerySchema.parse({}).isBuiltin).toBeUndefined();
  });

  it('拒绝非布尔字面值', () => {
    expect(SkillQuerySchema.safeParse({ isBuiltin: 'yes' }).success).toBe(
      false,
    );
  });
});
