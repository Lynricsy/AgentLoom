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

describe('CreatePlatformApiTokenSchema expires_at', () => {
  it('拒绝未知键（camelCase expiresAt 不再被静默丢弃为永不过期）', () => {
    const result = CreatePlatformApiTokenSchema.safeParse({
      name: 't',
      expiresAt: '2099-01-01T00:00:00Z',
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.code).toBe('unrecognized_keys');
  });

  it('拒绝已过去的过期时间', () => {
    const result = CreatePlatformApiTokenSchema.safeParse({
      name: 't',
      expires_at: '2020-01-01T00:00:00Z',
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['expires_at']);
  });

  it('接受未来的过期时间', () => {
    expect(
      CreatePlatformApiTokenSchema.parse({
        name: 't',
        expires_at: '2099-01-01T00:00:00Z',
      }).expires_at,
    ).toBe('2099-01-01T00:00:00Z');
  });
});
