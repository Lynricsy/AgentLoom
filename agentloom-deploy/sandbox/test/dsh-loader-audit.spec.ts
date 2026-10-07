import { describe, expect, it, vi } from 'vitest';

import {
  findInactiveEntries,
  type LoaderEntryLike,
  type LoaderLike,
} from '../src/dsh-bridge/loader-audit.js';

type Fiber = NonNullable<LoaderEntryLike['fiber']>;

function entry(
  id: string,
  options: { fiber?: Fiber; disabled?: () => boolean; importError?: Error } = {},
): LoaderEntryLike {
  return {
    options: { id, name: `/plugins/${id}/dist/index.js` },
    get disabled() {
      return options.disabled?.() ?? false;
    },
    fiber: options.fiber,
    parent: {
      tree: {
        import: vi.fn(async () => {
          if (options.importError) throw options.importError;
          return {};
        }),
      },
    },
  };
}

function fiber(state: number, extra: Partial<Fiber> = {}): Fiber {
  return {
    state,
    inject: {},
    ctx: { get: () => undefined },
    await: async () => undefined,
    ...extra,
  };
}

function loaderOf(entries: LoaderEntryLike[]): LoaderLike {
  return { entries: () => entries };
}

describe('findInactiveEntries', () => {
  it('应按 dsh 启动审计判据报告导入失败、激活失败与缺服务的条目，并跳过激活 / 禁用 / 无关条目', async () => {
    const loader = loaderOf([
      entry('active', { fiber: fiber(2) }),
      entry('disabled', { disabled: () => true }),
      entry('unrelated', { fiber: fiber(3) }),
      entry('throws', {
        fiber: fiber(3, {
          await: async () => {
            throw new Error('PM-THROWS-BOOM');
          },
        }),
      }),
      entry('missing-dep', {
        importError: new Error("Cannot find package 'nanoid' imported from /plugins/x/dist/index.js"),
      }),
      entry('pending', {
        fiber: fiber(0, {
          inject: { tools: {}, permissionPresets: {} },
          ctx: { get: (name) => (name === 'tools' ? {} : undefined) },
        }),
      }),
      entry('bad-expression', {
        disabled: () => {
          throw new Error('ctx is not defined');
        },
      }),
    ]);

    const inactive = await findInactiveEntries(loader, [
      'active',
      'disabled',
      'throws',
      'missing-dep',
      'pending',
      'bad-expression',
    ]);

    expect(inactive).toEqual([
      { id: 'throws', module: '/plugins/throws/dist/index.js', reason: '插件激活失败: PM-THROWS-BOOM' },
      {
        id: 'missing-dep',
        module: '/plugins/missing-dep/dist/index.js',
        reason: "模块导入失败: Cannot find package 'nanoid' imported from /plugins/x/dist/index.js",
      },
      {
        id: 'pending',
        module: '/plugins/pending/dist/index.js',
        reason: '等待服务 permissionPresets，这些服务在当前 profile 中不存在或未激活',
      },
      {
        id: 'bad-expression',
        module: '/plugins/bad-expression/dist/index.js',
        reason: 'disabled 表达式求值失败: ctx is not defined',
      },
    ]);
  });
});
