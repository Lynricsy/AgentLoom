import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export interface RuntimeNodeDefinition {
  type: string;
  label?: string;
  category?: string;
  description?: string;
  inputPorts?: unknown[];
  outputPorts?: unknown[];
  configSchema?: unknown;
  execute?: (context: Record<string, unknown>) => Promise<unknown> | unknown;
  [key: string]: unknown;
}

export interface RuntimePlugin {
  nodes: RuntimeNodeDefinition[];
}

interface PackageJsonLike {
  main?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function resolveEntryCandidates(cwd: string): string[] {
  const packageJsonPath = resolve(cwd, 'package.json');
  const defaultCandidates = [resolve(cwd, 'dist/index.js'), resolve(cwd, 'src/index.js')];

  if (!existsSync(packageJsonPath)) {
    return defaultCandidates;
  }

  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as PackageJsonLike;
  const candidates = [
    packageJson.main ? resolve(cwd, packageJson.main) : undefined,
    ...defaultCandidates,
  ].filter((candidate): candidate is string => typeof candidate === 'string');

  return [...new Set(candidates)];
}

function resolvePluginEntry(cwd: string): string {
  const candidates = resolveEntryCandidates(cwd);
  const resolvedEntry = candidates.find((candidate) => existsSync(candidate));

  if (!resolvedEntry) {
    throw new Error(
      '未找到插件入口文件，请先构建插件（例如生成 dist/index.js）或确认 package.json.main 配置正确。',
    );
  }

  return resolvedEntry;
}

function extractPluginCandidate(moduleValue: Record<string, unknown>): unknown {
  if (isRecord(moduleValue.default)) {
    return moduleValue.default;
  }

  if (isRecord(moduleValue.plugin)) {
    return moduleValue.plugin;
  }

  return moduleValue;
}

function isRuntimeNodeDefinition(value: unknown): value is RuntimeNodeDefinition {
  return isRecord(value) && typeof value.type === 'string';
}

export async function loadPlugin(cwd: string): Promise<RuntimePlugin> {
  const entryPath = resolvePluginEntry(cwd);
  const entryUrl = pathToFileURL(entryPath);
  entryUrl.searchParams.set('t', Date.now().toString());

  const importedModule = (await import(entryUrl.href)) as Record<string, unknown>;
  const pluginCandidate = extractPluginCandidate(importedModule);

  if (!isRecord(pluginCandidate) || !Array.isArray(pluginCandidate.nodes)) {
    throw new Error('插件入口必须默认导出包含 nodes 数组的插件对象。');
  }

  const nodes = pluginCandidate.nodes;

  if (!nodes.every(isRuntimeNodeDefinition)) {
    throw new Error('插件 nodes 数组中存在无效节点定义，必须至少包含 type 字段。');
  }

  return { nodes };
}

export function serializeNodes(nodes: RuntimeNodeDefinition[]): Array<Record<string, unknown>> {
  return nodes.map(({ execute: _execute, ...node }) => node);
}
