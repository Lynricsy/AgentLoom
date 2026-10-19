import { describe, expect, it } from 'vitest';

import { CreateMemoryVersionSchema } from '../dto';

function issuePaths(body: unknown): string[] {
  const result = CreateMemoryVersionSchema.safeParse(body);
  if (result.success) {
    return [];
  }
  return result.error.issues.map((issue) => issue.path.join('.'));
}

describe('CreateMemoryVersionSchema', () => {
  it('省略 mode 时按 create 处理', () => {
    expect(CreateMemoryVersionSchema.parse({ content: '用户偏好' })).toEqual({
      mode: 'create',
      content: '用户偏好',
    });
  });

  it('create 缺 content 时应拒绝（之前落到数据库 NOT NULL 返回 500）', () => {
    expect(issuePaths({})).toEqual(['content']);
    expect(issuePaths({ mode: 'create' })).toEqual(['content']);
  });

  it('append 缺 content 时应拒绝', () => {
    expect(issuePaths({ mode: 'append' })).toEqual(['content']);
  });

  it('patch 缺 oldString/newString 时应拒绝（之前返回 409 old_string not found）', () => {
    expect(issuePaths({ mode: 'patch' })).toEqual(['oldString', 'newString']);
    expect(
      issuePaths({ mode: 'patch', oldString: '', newString: 'x' }),
    ).toEqual(['oldString']);
  });

  it('patch 允许 newString 为空字符串（删除片段）', () => {
    expect(
      CreateMemoryVersionSchema.parse({
        mode: 'patch',
        oldString: '旧',
        newString: '',
      }),
    ).toEqual({ mode: 'patch', oldString: '旧', newString: '' });
  });

  it('未知 mode 应拒绝', () => {
    expect(issuePaths({ mode: 'replace', content: 'x' })).toEqual(['mode']);
  });
});
