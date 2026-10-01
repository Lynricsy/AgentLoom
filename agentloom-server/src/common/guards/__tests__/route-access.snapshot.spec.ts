import 'reflect-metadata';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { describe, expect, it } from 'vitest';

import { IS_PUBLIC_KEY } from '../../decorators/public.decorator';
import { resolveRequiredRoles } from '../roles.guard';

type ControllerClass = abstract new (...args: never[]) => unknown;

const MODULES_DIR = join(__dirname, '../../../modules');

async function loadControllerModules(): Promise<Record<string, unknown>[]> {
  const files = readdirSync(MODULES_DIR, { recursive: true, encoding: 'utf8' })
    .filter((file) => file.endsWith('.controller.ts'))
    .sort();
  return Promise.all(
    files.map(
      (file) =>
        import(join(MODULES_DIR, file)) as Promise<Record<string, unknown>>,
    ),
  );
}

function joinPaths(prefix: unknown, path: unknown): string[] {
  const prefixes = Array.isArray(prefix) ? prefix : [prefix ?? ''];
  const paths = Array.isArray(path) ? path : [path ?? ''];
  return prefixes.flatMap((p) =>
    paths.map(
      (q) =>
        `/${[p, q]
          .map((part) => String(part).replace(/^\/+|\/+$/g, ''))
          .filter(Boolean)
          .join('/')}`,
    ),
  );
}

/**
 * 每条 HTTP 路由的有效访问集合：`public`、`any-authenticated`（无角色限制）
 * 或排序后的角色列表。RolesGuard 用的正是同一个 resolveRequiredRoles。
 */
async function collectRouteAccess(): Promise<Record<string, string>> {
  const reflector = new Reflector();
  const access: Record<string, string> = {};

  for (const exports of await loadControllerModules()) {
    for (const candidate of Object.values(exports)) {
      if (typeof candidate !== 'function') continue;
      const controller = candidate as ControllerClass;
      const prefix = Reflect.getMetadata(PATH_METADATA, controller);
      if (prefix === undefined) continue;

      for (const name of Object.getOwnPropertyNames(controller.prototype)) {
        const handler = (controller.prototype as Record<string, unknown>)[name];
        if (typeof handler !== 'function') continue;
        const method = Reflect.getMetadata(METHOD_METADATA, handler);
        if (method === undefined) continue;

        const targets = [handler, controller];
        const isPublic = reflector.getAllAndOverride<boolean>(
          IS_PUBLIC_KEY,
          targets,
        );
        const roles = resolveRequiredRoles(reflector, targets);
        const value = isPublic
          ? 'public'
          : roles && roles.length > 0
            ? [...roles].sort().join(',')
            : 'any-authenticated';

        for (const path of joinPaths(
          prefix,
          Reflect.getMetadata(PATH_METADATA, handler),
        )) {
          access[`${RequestMethod[method as RequestMethod]} ${path}`] = value;
        }
      }
    }
  }

  return Object.fromEntries(
    Object.entries(access).sort(([a], [b]) => a.localeCompare(b)),
  );
}

describe('路由访问快照', () => {
  it('每条路由的有效角色集合与快照一致（任何放宽或收紧都必须显式更新快照并说明）', async () => {
    await expect(
      JSON.stringify(await collectRouteAccess(), null, 2),
    ).toMatchFileSnapshot('./__snapshots__/route-access.json');
    // 需要动态导入全部 controller 模块，冷启动在全量并发下超过默认 5s
  }, 60_000);
});
