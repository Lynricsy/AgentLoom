import { describe, it, expect, vi, afterEach } from 'vitest';
import { generateSlug, appendSlugSuffix } from './slug.utils';

// 固定 randomBytes 返回值以便断言
vi.mock('node:crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:crypto')>();
  return {
    ...actual,
    randomBytes: vi.fn((size: number) =>
      Buffer.from('a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6'.slice(0, size * 2), 'hex'),
    ),
  };
});

describe('slug.utils', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('generateSlug', () => {
    it('英文名称转为小写连字符格式', () => {
      expect(generateSlug('My Organization')).toBe('my-organization');
    });

    it('特殊字符替换为连字符', () => {
      expect(generateSlug('Hello@World#2024!')).toBe('hello-world-2024');
    });

    it('连续连字符合并为单个', () => {
      expect(generateSlug('foo---bar___baz')).toBe('foo-bar-baz');
    });

    it('去除首尾连字符', () => {
      expect(generateSlug('  --hello--  ')).toBe('hello');
    });

    it('超过100字符截断', () => {
      const longName = 'a'.repeat(120);
      const slug = generateSlug(longName);
      expect(slug.length).toBeLessThanOrEqual(100);
    });

    it('纯中文名称回退为 org-{hex}', () => {
      const slug = generateSlug('测试组织');
      expect(slug).toMatch(/^org-[a-f0-9]{8}$/);
    });

    it('中英混合保留拉丁字母部分', () => {
      const slug = generateSlug('测试team');
      expect(slug).toContain('team');
      expect(slug).not.toMatch(/^org-/);
    });
  });

  describe('appendSlugSuffix', () => {
    it('在 slug 后追加随机后缀', () => {
      const result = appendSlugSuffix('my-org');
      expect(result).toMatch(/^my-org-[a-f0-9]{4}$/);
    });

    it('过长 slug 截断后再追加后缀', () => {
      const longSlug = 'a'.repeat(100);
      const result = appendSlugSuffix(longSlug);
      expect(result.length).toBeLessThanOrEqual(100);
      expect(result).toMatch(/-[a-f0-9]{4}$/);
    });
  });
});
