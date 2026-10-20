import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  PluginManifestSchema,
  validateManifest as validatePluginManifest,
  type PluginManifest,
} from '@agentloom/plugin-sdk';

export type { PluginManifest } from '@agentloom/plugin-sdk';

export function validateManifest(value: unknown): PluginManifest {
  const result = validatePluginManifest(value);

  if (!result.valid) {
    throw new Error(`manifest.json 校验失败：\n${result.errors.join('\n')}`);
  }

  return PluginManifestSchema.parse(value);
}

export function loadManifest(cwd: string): PluginManifest {
  const manifestPath = resolve(cwd, 'manifest.json');
  if (!existsSync(manifestPath)) {
    throw new Error(
      `未找到 ${manifestPath}。请在插件项目根目录执行，或先用 \`agentloom-plugin create <name>\` 创建项目。`,
    );
  }

  let parsedManifest: unknown;
  try {
    parsedManifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as unknown;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${manifestPath} 不是有效 JSON：${message}`);
  }

  return validateManifest(parsedManifest);
}

/**
 * 节点插件是否为 Rust/Extism WASM 项目：存在 Cargo.toml 或清单声明了 wasmEntry。
 * build（不带 --wasm）与 dev 只服务 TypeScript 节点插件，遇到 WASM 项目需在动手前拦下。
 */
export function isWasmPluginProject(
  cwd: string,
  manifest: PluginManifest,
): boolean {
  return (
    manifest.wasmEntry !== undefined || existsSync(resolve(cwd, 'Cargo.toml'))
  );
}
