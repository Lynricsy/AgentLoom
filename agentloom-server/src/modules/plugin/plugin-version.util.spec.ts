import { describe, expect, it } from 'vitest';

import { comparePluginVersions } from './plugin-version.util';

describe('comparePluginVersions', () => {
  it.each([
    ['1.0.1', '1.0.0', 1],
    ['1.10.0', '1.9.9', 1],
    ['2.0.0', '10.0.0', -1],
    ['1.0.0', '1.0.0', 0],
    ['1.0.0+build.2', '1.0.0+build.1', 0],
    ['v1.2.3', '1.2.3', 0],
    ['1.0.0', '1.0.0-rc.1', 1],
    ['1.0.0-alpha', '1.0.0-alpha.1', -1],
    ['1.0.0-alpha.1', '1.0.0-alpha.beta', -1],
    ['1.0.0-beta.11', '1.0.0-beta.2', 1],
    ['1.0.0-rc.1', '1.0.0-beta.11', 1],
  ])('%s 对 %s 的比较结果为 %i', (left, right, expected) => {
    expect(comparePluginVersions(left, right)).toBe(expected);
  });

  it('非法版本号直接抛错', () => {
    expect(() => comparePluginVersions('1.0', '1.0.0')).toThrow();
  });
});
