import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export interface BasicPluginManifest {
  id: string;
  name: string;
  version: string;
  author: string;
  description: string;
  license: string;
  minPlatformVersion?: string;
  permissions?: string[];
  keywords?: string[];
}

const requiredManifestFields = [
  'id',
  'name',
  'version',
  'author',
  'description',
  'license',
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getRequiredStringField(
  value: Record<string, unknown>,
  field: (typeof requiredManifestFields)[number],
): string {
  const candidate = value[field];

  if (typeof candidate !== 'string' || candidate.trim().length === 0) {
    throw new Error(`manifest.json 缺少必填字符串字段 "${field}"。`);
  }

  return candidate;
}

function getOptionalStringField(
  value: Record<string, unknown>,
  field: 'minPlatformVersion',
): string | undefined {
  const candidate = value[field];

  if (candidate === undefined) {
    return undefined;
  }

  if (typeof candidate !== 'string' || candidate.trim().length === 0) {
    throw new Error(`manifest.json 字段 "${field}" 必须是非空字符串。`);
  }

  return candidate;
}

function getOptionalStringArrayField(
  value: Record<string, unknown>,
  field: 'permissions' | 'keywords',
): string[] | undefined {
  const candidate = value[field];

  if (candidate === undefined) {
    return undefined;
  }

  if (!Array.isArray(candidate) || !candidate.every((item) => typeof item === 'string')) {
    throw new Error(`manifest.json 字段 "${field}" 必须是字符串数组。`);
  }

  return candidate;
}

export function validateManifest(value: unknown): BasicPluginManifest {
  if (!isRecord(value)) {
    throw new Error('manifest.json 必须是 JSON 对象。');
  }

  const manifest: BasicPluginManifest = {
    id: getRequiredStringField(value, 'id'),
    name: getRequiredStringField(value, 'name'),
    version: getRequiredStringField(value, 'version'),
    author: getRequiredStringField(value, 'author'),
    description: getRequiredStringField(value, 'description'),
    license: getRequiredStringField(value, 'license'),
  };

  const minPlatformVersion = getOptionalStringField(value, 'minPlatformVersion');
  const permissions = getOptionalStringArrayField(value, 'permissions');
  const keywords = getOptionalStringArrayField(value, 'keywords');

  if (minPlatformVersion !== undefined) {
    manifest.minPlatformVersion = minPlatformVersion;
  }

  if (permissions !== undefined) {
    manifest.permissions = permissions;
  }

  if (keywords !== undefined) {
    manifest.keywords = keywords;
  }

  return manifest;
}

export function loadManifest(cwd: string): BasicPluginManifest {
  const manifestPath = resolve(cwd, 'manifest.json');
  const rawManifest = readFileSync(manifestPath, 'utf8');
  const parsedManifest = JSON.parse(rawManifest) as unknown;

  return validateManifest(parsedManifest);
}
