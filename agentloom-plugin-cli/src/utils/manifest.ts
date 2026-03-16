import { readFileSync } from 'node:fs';
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
  const rawManifest = readFileSync(manifestPath, 'utf8');
  const parsedManifest = JSON.parse(rawManifest) as unknown;

  return validateManifest(parsedManifest);
}
