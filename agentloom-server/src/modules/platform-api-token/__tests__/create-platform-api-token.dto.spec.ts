import { describe, expect, it } from 'vitest';

import { CreatePlatformApiTokenSchema } from '../dto/create-platform-api-token.dto';

describe('CreatePlatformApiTokenSchema scopes', () => {
  it('兼容空格/逗号分隔，按词表顺序去重规范化为空格分隔', () => {
    expect(
      CreatePlatformApiTokenSchema.parse({
        name: 't',
        scopes: 'workflow:run, workflow:read workflow:run',
      }).scopes,
    ).toBe('workflow:read workflow:run');
  });

  it('留空表示继承所有者全部权限（存为 null）', () => {
    expect(
      CreatePlatformApiTokenSchema.parse({ name: 't', scopes: '  ' }).scopes,
    ).toBeUndefined();
  });

  it('拒绝词表外的作用域', () => {
    const result = CreatePlatformApiTokenSchema.safeParse({
      name: 't',
      scopes: 'workflow:read root:everything',
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain('root:everything');
  });
});
