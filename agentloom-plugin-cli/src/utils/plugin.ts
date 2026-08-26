import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  CustomNodeDefinitionSchema,
  PluginManifestSchema,
  type PluginManifest,
} from '@agentloom/plugin-sdk';
export interface RuntimeNodeDefinition {
  type: string;
  label: string;
  category: string;
  description: string;
  inputPorts: unknown[];
  outputPorts: unknown[];
  configSchema?: Record<string, unknown>;
  execute: (context: Record<string, unknown>) => Promise<unknown> | unknown;
  [key: string]: unknown;
}

export interface RuntimePlugin {
  manifest: PluginManifest;
  nodes: RuntimeNodeDefinition[];
  activate(): Promise<void>;
  deactivate(): Promise<void>;
}

interface PackageJsonLike {
  main?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function resolveEntryCandidates(cwd: string): string[] {
  const packageJsonPath = resolve(cwd, 'package.json');
  const defaultCandidates = [
    resolve(cwd, 'dist/index.js'),
    resolve(cwd, 'src/index.js'),
  ];

  if (!existsSync(packageJsonPath)) {
    return defaultCandidates;
  }

  const packageJson = JSON.parse(
    readFileSync(packageJsonPath, 'utf8'),
  ) as PackageJsonLike;
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

function describeNode(value: unknown, index: number): string {
  const type =
    isRecord(value) && typeof value.type === 'string'
      ? value.type
      : '<unknown>';
  return `节点 index=${index}, type=${type}`;
}

export function validateNodeDefinitions(
  candidates: unknown,
): Array<Record<string, unknown>> {
  if (!Array.isArray(candidates)) {
    throw new Error('节点定义必须是 JSON 数组。');
  }

  const nodes: Array<Record<string, unknown>> = [];
  const seenTypes = new Set<string>();
  for (const [index, candidate] of candidates.entries()) {
    const descriptor = describeNode(candidate, index);
    const result = CustomNodeDefinitionSchema.safeParse(candidate);
    if (!result.success) {
      throw new Error(`${descriptor} 校验失败：${result.error.message}`);
    }
    if (seenTypes.has(result.data.type)) {
      throw new Error(`${descriptor} 与更早的节点定义使用了重复 type。`);
    }

    seenTypes.add(result.data.type);
    nodes.push(result.data);
  }

  return nodes;
}

let importRevision = 0;

export async function loadPlugin(cwd: string): Promise<RuntimePlugin> {
  const entryPath = resolvePluginEntry(cwd);
  const entryUrl = pathToFileURL(entryPath);
  entryUrl.searchParams.set('revision', String(++importRevision));

  const importedModule = (await import(entryUrl.href)) as Record<
    string,
    unknown
  >;
  const pluginCandidate = extractPluginCandidate(importedModule);

  if (!isRecord(pluginCandidate) || !Array.isArray(pluginCandidate.nodes)) {
    throw new Error(
      '插件入口必须默认导出包含 manifest、nodes 与生命周期钩子的插件对象。',
    );
  }

  const manifestResult = PluginManifestSchema.safeParse(
    pluginCandidate.manifest,
  );
  if (!manifestResult.success) {
    throw new Error(`插件 manifest 无效：${manifestResult.error.message}`);
  }
  if (
    typeof pluginCandidate.activate !== 'function' ||
    typeof pluginCandidate.deactivate !== 'function'
  ) {
    throw new Error('插件必须提供 activate 与 deactivate 生命周期钩子。');
  }

  const serializableNodes: unknown[] = [];
  const executableNodes: RuntimeNodeDefinition['execute'][] = [];
  for (const [index, candidate] of pluginCandidate.nodes.entries()) {
    const descriptor = describeNode(candidate, index);
    if (!isRecord(candidate) || typeof candidate.execute !== 'function') {
      throw new Error(`${descriptor} 无效：execute 必须是函数。`);
    }

    const { execute, ...serializableDefinition } = candidate;
    serializableNodes.push(serializableDefinition);
    executableNodes.push(execute as RuntimeNodeDefinition['execute']);
  }

  const validatedNodes = validateNodeDefinitions(serializableNodes);
  const nodes = validatedNodes.map((node, index) => ({
    ...node,
    execute: executableNodes[index],
  })) as RuntimeNodeDefinition[];

  return {
    manifest: manifestResult.data,
    nodes,
    activate: pluginCandidate.activate.bind(
      pluginCandidate,
    ) as () => Promise<void>,
    deactivate: pluginCandidate.deactivate.bind(
      pluginCandidate,
    ) as () => Promise<void>,
  };
}

export function serializeNodes(
  nodes: RuntimeNodeDefinition[],
): Array<Record<string, unknown>> {
  return validateNodeDefinitions(
    nodes.map(({ execute: _execute, ...node }) => node),
  );
}
