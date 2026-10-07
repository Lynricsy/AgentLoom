/**
 * 为单个 AgentLoom 会话生成 dsh home 与 `agentloom` profile：
 * - profile 只挂 `@deepseek-ai/dsh-base` bundle，平台层用 cordis.patch.yml 覆盖；
 * - agentloom-bridge 以绝对路径 insert（它的依赖按原生解析命中同一份安装）；
 * - runtime 插件（已签名包 / npm 包）链接进 profile node_modules，使其
 *   peerDependencies 经 dsh 运行时解析命中同一份 dsh 包；
 * - patch 叠加顺序：平台层 → 插件层（按画布顺序）→ 用户 profile patch。
 */
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import YAML, { isMap, isScalar, isSeq, type Document, type YAMLMap } from 'yaml';
import { normalizeBundledMcpServerConfig } from '../mcp-client.js';
import { isRecord } from '../type-guards.js';
import type { CreateSessionRequest, HarnessPluginRef, McpServerConfig } from '../types.js';

export const DSH_PROFILE_NAME = 'agentloom';
export const DSH_BRIDGE_ROW_ID = 'agentloom-bridge';
export const NPM_INSTALL_TIMEOUT_MS = 180_000;
/** 与 server RUNTIME_PLUGIN_NPM_NAME_PATTERN 同款 */
export const RUNTIME_PLUGIN_NPM_NAME_PATTERN =
  /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/;

const MCP_SERVER_NAME_PATTERN = /^[A-Za-z0-9_-]{1,32}$/;
const PLUGIN_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const RUNTIME_PLUGIN_LINK_SCOPE = '@agentloom-runtime-plugins';
const PLUGIN_ROOT_PLACEHOLDER = '__PLUGIN_ROOT__';
const STDERR_TAIL_BYTES = 2048;

/**
 * dsh-base 中与 AgentLoom 部署无关或会外连 DeepSeek 服务的条目：DeepSeek 原生
 * 适配器 / 账号、遥测、web 工具、live-config 与插件管理（profile 由 guest 生成，
 * 不允许运行期改写）、首问标题（额外模型调用）。
 * `permission` 预设表没有「danger-full-access + ask」组合，挂载即报错，同样禁用。
 */
const DISABLED_BASE_ROWS = [
  'llm-deepseek',
  'llm-deepseek-account',
  'deepseek-account',
  'session-log-deepseek',
  'plugin-package-inventory-deepseek',
  'otel',
  'session-telemetry-otel',
  'web',
  'web-search-deepseek',
  'web-fetch-http',
  'tool-web',
  'hmr',
  'settings',
  'config-editor',
  'plugin-manager',
  'session-title-llm',
  'permission',
] as const;

export interface NpmInstallRequest {
  /** npm 安装前缀目录（其下生成 node_modules/） */
  prefix: string;
  /** 安装进程的 HOME 与 npm cache 所在目录 */
  home: string;
  name: string;
  version: string;
}

export type NpmInstaller = (request: NpmInstallRequest) => Promise<void>;

export interface WriteDshProfileParams {
  /** 会话一次性目录（prepareSessionConfig 的产物，含 files 下发的 skills/ 与 plugins/） */
  agentDir: string;
  cwd: string;
  /** 已合并静态配置的会话请求 */
  request: CreateSessionRequest;
  /** llm-pi-ai 路由与模型 */
  provider: string;
  model: string;
  /** dist/dsh-bridge/index.js 的绝对路径 */
  bridgeEntry: string;
  installNpmPackage?: NpmInstaller;
}

export interface DshProfile {
  dshHome: string;
  profileDir: string;
  patchPath: string;
  socketPath: string;
  /** 追加给 dsh 子进程的环境变量（含 provider API key） */
  env: Record<string, string>;
}

export function providerApiKeyEnv(provider: string): string {
  return `AGENTLOOM_PROVIDER_${provider.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_API_KEY`;
}

export async function writeDshProfile(params: WriteDshProfileParams): Promise<DshProfile> {
  const { agentDir, cwd, request, provider, model, bridgeEntry } = params;
  const dshHome = path.join(agentDir, 'dsh-home');
  const profileDir = path.join(dshHome, 'profiles', DSH_PROFILE_NAME);
  const socketPath = path.join(agentDir, 'bridge.sock');
  await mkdir(path.join(profileDir, 'node_modules'), { recursive: true, mode: 0o700 });
  await writeFile(
    path.join(profileDir, 'package.json'),
    `${JSON.stringify({
      name: 'agentloom-profile',
      private: true,
      dsh: { profile: { bundles: ['@deepseek-ai/dsh-base'] } },
    })}\n`,
    { mode: 0o600 },
  );

  const { providers, env } = buildProviderRoutes(request);
  const document = new YAML.Document(
    buildPlatformRows({
      agentDir,
      dshHome,
      cwd,
      request,
      provider,
      model,
      providers,
      bridge: { entry: bridgeEntry, socketPath },
    }),
  );
  const rows = document.contents;
  if (!isSeq(rows)) throw new Error('平台层 cordis patch 必须是 YAML 列表');

  for (const plugin of request.harness?.plugins ?? []) {
    if (!plugin.enabled) continue;
    rows.items.push(
      ...(await loadPluginRows(plugin, {
        agentDir,
        dshHome,
        profileDir,
        installNpmPackage: params.installNpmPackage ?? installNpmPackage,
      })),
    );
  }

  const userPatch = request.harness?.profilePatch;
  if (userPatch !== undefined && userPatch.trim().length > 0) {
    const userDocument = parsePatchDocument(userPatch, '用户 profile patch');
    if (userDocument) rows.items.push(...userDocument.items);
  }

  const patchPath = path.join(profileDir, 'cordis.patch.yml');
  await writeFile(patchPath, document.toString({ lineWidth: 0 }), { mode: 0o600 });

  return {
    dshHome,
    profileDir,
    patchPath,
    socketPath,
    env: {
      DSH_HOME: dshHome,
      DSH_PERMISSION_MODE: 'danger-full-access',
      DSH_TELEMETRY_DISABLED: '1',
      ...env,
    },
  };
}

/**
 * models.json 的 providers → llm-pi-ai providers。密钥只经环境变量
 * （apiKeyEnv）传入，不写进 patch 文件。
 */
function buildProviderRoutes(request: CreateSessionRequest): {
  providers: Record<string, Record<string, unknown>>;
  env: Record<string, string>;
} {
  const providers: Record<string, Record<string, unknown>> = {};
  const env: Record<string, string> = {};

  for (const [slug, entry] of Object.entries(request.models?.providers ?? {})) {
    const apiKeyEnv = providerApiKeyEnv(slug);
    const models = Array.isArray(entry.models)
      ? entry.models.flatMap((value) => {
          if (!isRecord(value) || typeof value.id !== 'string') return [];
          return [
            {
              id: value.id,
              name: typeof value.name === 'string' ? value.name : value.id,
              ...(typeof value.contextWindow === 'number'
                ? { contextWindow: value.contextWindow }
                : {}),
              ...(typeof value.maxTokens === 'number' ? { maxTokens: value.maxTokens } : {}),
            },
          ];
        })
      : undefined;
    providers[slug] = {
      apiKeyEnv,
      ...(typeof entry.api === 'string' ? { api: entry.api } : {}),
      ...(typeof entry.baseUrl === 'string' ? { baseURL: entry.baseUrl } : {}),
      ...(models ? { models } : {}),
      ...(isRecord(entry.compat) ? { compat: entry.compat } : {}),
      ...(isRecord(entry.headers) ? { headers: entry.headers } : {}),
    };

    const apiKey = request.runtimeApiKeys?.[slug] ?? readInlineApiKey(entry.apiKey);
    if (apiKey) env[apiKeyEnv] = apiKey;
  }

  return { providers, env };
}

/**
 * models.json 的 apiKey 字段在 server 侧要么是环境变量名（密钥另经
 * runtimeApiKeys 下发），要么是免鉴权私有云的字面占位值；只有后者可直接使用。
 * 缺密钥时不设变量，dsh 以 MISSING_CREDENTIAL 失败。
 */
function readInlineApiKey(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length === 0) return undefined;
  return /^[A-Z][A-Z0-9_]*$/.test(value) ? undefined : value;
}

function buildPlatformRows(options: {
  agentDir: string;
  dshHome: string;
  cwd: string;
  request: CreateSessionRequest;
  provider: string;
  model: string;
  providers: Record<string, Record<string, unknown>>;
  bridge: { entry: string; socketPath: string };
}): unknown[] {
  const { agentDir, dshHome, cwd, request, provider, model, providers, bridge } = options;
  return [
    // microVM 本身就是隔离边界；审批策略保持 ask，由 bridge 应答者转给 AgentLoom。
    { id: 'sandbox-policy', config: { mode: 'danger-full-access', workspaceRoot: cwd } },
    { id: 'approval', config: { policy: 'ask' } },
    {
      id: 'system-prompt',
      config: { personaPrefix: request.systemPrompt ?? '', includeHarnessIdentity: false },
    },
    {
      id: 'session-persistence-jsonl',
      config: { root: path.join(dshHome, 'sessions'), compression: 'none' },
    },
    // 子 Agent 等未显式选模型的入口回落到默认模型，保持与会话模型一致。
    { id: 'agent-default-model', config: { provider, model } },
    { id: 'llm-pi-ai', config: { providers } },
    ...DISABLED_BASE_ROWS.map((id) => ({ id, disabled: true })),
    {
      id: 'skill-filesystem',
      config: {
        includeDefaultRoots: false,
        customSkillDirs: [path.join(agentDir, 'skills')],
        watch: false,
      },
    },
    {
      insert: [
        {
          id: DSH_BRIDGE_ROW_ID,
          name: bridge.entry,
          config: { socketPath: bridge.socketPath, workdir: cwd },
        },
        ...buildMcpRows(request.mcpServers ?? {}),
      ],
    },
  ];
}

function buildMcpRows(servers: Record<string, McpServerConfig>): unknown[] {
  const rows: unknown[] = [];
  for (const [name, rawConfig] of Object.entries(servers)) {
    if (rawConfig.transportType === 'sse') {
      console.error(`dsh-mcp-client 不支持 SSE transport，已跳过 MCP server ${name}`);
      continue;
    }
    const serverName = MCP_SERVER_NAME_PATTERN.test(name)
      ? name
      : name.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 32);
    if (serverName !== name) {
      console.error(`MCP server 名 ${name} 不符合 dsh 命名规则，已改为 ${serverName}`);
    }
    const config = normalizeBundledMcpServerConfig(rawConfig);
    rows.push({
      id: `mcp-${serverName}`,
      name: '@deepseek-ai/dsh-mcp-client',
      config:
        config.transportType === 'stdio'
          ? {
              serverName,
              transport: 'stdio',
              command: config.command,
              ...(config.args ? { args: config.args } : {}),
              ...(config.env ? { env: config.env } : {}),
            }
          : {
              serverName,
              transport: 'streamable-http',
              url: config.url,
              ...(config.headers ? { headers: config.headers } : {}),
            },
    });
  }
  return rows;
}

interface PluginLoadContext {
  agentDir: string;
  dshHome: string;
  profileDir: string;
  installNpmPackage: NpmInstaller;
}

async function loadPluginRows(
  plugin: HarnessPluginRef,
  context: PluginLoadContext,
): Promise<unknown[]> {
  if (plugin.source === 'package') {
    const pluginId = plugin.pluginId;
    if (!pluginId || !PLUGIN_ID_PATTERN.test(pluginId)) {
      throw new Error(`runtime 插件节点 ${plugin.nodeId} 缺少有效的 pluginId`);
    }
    const root = path.join(context.agentDir, 'plugins', pluginId);
    const manifest = await readJsonFile(path.join(root, 'manifest.json'), `runtime 插件 ${pluginId}`);
    const runtime = isRecord(manifest.runtime) ? manifest.runtime : {};
    if (typeof runtime.patch !== 'string') {
      throw new Error(`runtime 插件 ${pluginId} 的 manifest 缺少 runtime.patch`);
    }
    const packageJson = existsSync(path.join(root, 'package.json'))
      ? await readJsonFile(path.join(root, 'package.json'), `runtime 插件 ${pluginId}`)
      : {};
    const linkName =
      typeof packageJson.name === 'string' && RUNTIME_PLUGIN_NPM_NAME_PATTERN.test(packageJson.name)
        ? packageJson.name
        : `${RUNTIME_PLUGIN_LINK_SCOPE}/${pluginId}`;
    await linkPlugin(context.profileDir, linkName, root);
    return loadPatchRows(resolveInside(root, runtime.patch, pluginId), root, plugin, pluginId);
  }

  const name = plugin.ref;
  const version = plugin.version;
  if (!RUNTIME_PLUGIN_NPM_NAME_PATTERN.test(name) || name.length > 214) {
    throw new Error(`runtime 插件节点 ${plugin.nodeId} 的 npm 包名无效: ${name}`);
  }
  if (!version || version.trim().length === 0 || version.startsWith('-')) {
    throw new Error(`runtime 插件节点 ${plugin.nodeId} 缺少 npm 版本`);
  }
  const prefix = path.join(context.dshHome, 'npm');
  await context.installNpmPackage({ prefix, home: context.dshHome, name, version });
  const root = path.join(prefix, 'node_modules', name);
  const packageJson = await readJsonFile(path.join(root, 'package.json'), `npm 包 ${name}`);
  await linkPlugin(context.profileDir, name, root);

  const bundle = isRecord(packageJson.dsh) && isRecord(packageJson.dsh.bundle)
    ? packageJson.dsh.bundle
    : undefined;
  if (!bundle) {
    // 普通 Cordis 插件包：作为单个条目挂载，按包名经 profile node_modules 解析。
    return [
      new YAML.Document({
        insert: [
          {
            id: `runtime-plugin-${plugin.nodeId.replace(/[^A-Za-z0-9_-]/g, '-')}`,
            name,
            ...(plugin.config && Object.keys(plugin.config).length > 0
              ? { config: plugin.config }
              : {}),
          },
        ],
      }).contents,
    ];
  }
  const patchFiles = typeof bundle.patch === 'string' ? [bundle.patch] : bundle.patch;
  if (!Array.isArray(patchFiles) || patchFiles.some((file) => typeof file !== 'string')) {
    throw new Error(`npm 包 ${name} 的 package.json dsh.bundle.patch 无效`);
  }
  const rows: unknown[] = [];
  for (const file of patchFiles as string[]) {
    rows.push(...(await loadPatchRows(resolveInside(root, file, name), root, plugin, name)));
  }
  return rows;
}

/**
 * 读出插件的一份 patch：替换 __PLUGIN_ROOT__、把 insert 条目里相对 patch 文件的
 * name 绝对化（合并进 profile patch 后基准目录会变），并把节点 config 浅合并到
 * 每个顶层 insert 条目的 config 上。保留 `!!js` 等标签原样。
 */
async function loadPatchRows(
  patchFile: string,
  pluginRoot: string,
  plugin: HarnessPluginRef,
  label: string,
): Promise<unknown[]> {
  const raw = await readFile(patchFile, 'utf8').catch(() => {
    throw new Error(`runtime 插件 ${label} 缺少 patch 文件 ${path.relative(pluginRoot, patchFile)}`);
  });
  const parsed = parsePatchDocument(
    raw.replaceAll(PLUGIN_ROOT_PLACEHOLDER, pluginRoot),
    `runtime 插件 ${label}`,
  );
  if (!parsed) return [];
  const baseDir = path.dirname(patchFile);

  for (const item of parsed.items) {
    if (!isMap(item)) continue;
    const insert = item.get('insert', true);
    if (!isSeq(insert)) continue;
    absolutizeRowNames(insert.items, baseDir);
    if (plugin.config && Object.keys(plugin.config).length > 0) {
      for (const row of insert.items) {
        if (isMap(row)) mergeRowConfig(parsed.document, row, plugin.config, label);
      }
    }
  }
  return parsed.items;
}

function absolutizeRowNames(rows: unknown[], baseDir: string): void {
  for (const row of rows) {
    if (!isMap(row)) continue;
    const name = row.get('name', true);
    if (isScalar(name) && typeof name.value === 'string' && /^\.\.?\//.test(name.value)) {
      name.value = path.resolve(baseDir, name.value);
    }
    // cordis:group 条目的 config 是子条目列表。
    const children = row.get('config', true);
    if (isSeq(children)) absolutizeRowNames(children.items, baseDir);
  }
}

function mergeRowConfig(
  document: Document,
  row: YAMLMap,
  config: Record<string, unknown>,
  label: string,
): void {
  const current = row.get('config', true);
  if (current === undefined) {
    row.set('config', document.createNode(config));
    return;
  }
  if (!isMap(current)) {
    throw new Error(
      `runtime 插件 ${label} 的条目 ${String(row.get('id'))} 的 config 不是映射，无法合并节点配置`,
    );
  }
  for (const [key, value] of Object.entries(config)) {
    current.set(key, document.createNode(value));
  }
}

/** 解析一份 cordis patch：必须是列表，每项含 insert 或 id；空文档返回 null */
function parsePatchDocument(
  source: string,
  label: string,
): { document: Document; items: unknown[] } | null {
  const document = YAML.parseDocument(source);
  if (document.errors.length > 0) {
    throw new Error(`${label} 的 cordis patch 解析失败: ${document.errors[0]?.message}`);
  }
  if (document.contents === null) return null;
  const contents = document.contents;
  if (
    !isSeq(contents) ||
    contents.items.some((item) => !isMap(item) || (!item.has('insert') && !item.has('id')))
  ) {
    throw new Error(`${label} 的 cordis patch 必须是 YAML 列表，且每项包含 insert 或 id`);
  }
  return { document, items: contents.items };
}

async function linkPlugin(profileDir: string, linkName: string, target: string): Promise<void> {
  const linkPath = path.join(profileDir, 'node_modules', linkName);
  if (existsSync(linkPath)) {
    throw new Error(`runtime 插件 ${linkName} 重复挂载`);
  }
  await mkdir(path.dirname(linkPath), { recursive: true, mode: 0o700 });
  await symlink(target, linkPath, 'dir');
}

function resolveInside(root: string, relativePath: string, label: string): string {
  const resolved = path.resolve(root, relativePath);
  if (!resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error(`runtime 插件 ${label} 的路径越界: ${relativePath}`);
  }
  return resolved;
}

async function readJsonFile(file: string, label: string): Promise<Record<string, unknown>> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(file, 'utf8'));
  } catch {
    throw new Error(`${label} 缺少或无法解析 ${path.basename(file)}`);
  }
  if (!isRecord(parsed)) throw new Error(`${label} 的 ${path.basename(file)} 不是 JSON 对象`);
  return parsed;
}

/** 默认 npm 安装器：在会话目录内在线安装，不跑安装脚本，不自动装 peer 依赖 */
async function installNpmPackage(request: NpmInstallRequest): Promise<void> {
  await mkdir(request.prefix, { recursive: true, mode: 0o700 });
  const manifestPath = path.join(request.prefix, 'package.json');
  if (!existsSync(manifestPath)) {
    await writeFile(manifestPath, '{"private":true}\n', { mode: 0o600 });
  }
  try {
    await promisify(execFile)(
      'npm',
      [
        'install',
        '--omit=dev',
        '--no-audit',
        '--no-fund',
        '--ignore-scripts',
        // peer（@deepseek-ai/*）必须解析到平台安装的那一份，不能再装一份副本。
        '--legacy-peer-deps',
        '--no-package-lock',
        `${request.name}@${request.version}`,
      ],
      {
        cwd: request.prefix,
        timeout: NPM_INSTALL_TIMEOUT_MS,
        maxBuffer: 16 * 1024 * 1024,
        env: {
          ...process.env,
          HOME: request.home,
          npm_config_cache: path.join(request.home, 'npm-cache'),
          npm_config_update_notifier: 'false',
        },
      },
    );
  } catch (error) {
    const stderr =
      typeof error === 'object' && error !== null && 'stderr' in error ? error.stderr : undefined;
    const detail =
      typeof stderr === 'string' && stderr.length > 0
        ? stderr.slice(-STDERR_TAIL_BYTES)
        : error instanceof Error
          ? error.message
          : String(error);
    throw new Error(`runtime 插件 ${request.name}@${request.version} 安装失败: ${detail}`);
  }
}
