import { mkdirSync, mkdtempSync, readFileSync, readlinkSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import YAML from 'yaml';

import {
  providerApiKeyEnv,
  writeDshProfile,
  type NpmInstallRequest,
} from '../src/dsh/profile-writer.js';
import type { CreateSessionRequest } from '../src/types.js';

const BRIDGE_ENTRY = '/opt/agentloom-sandbox/dist/dsh-bridge/index.js';

let agentDir: string;

function writeFiles(root: string, files: Record<string, string>): void {
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
}

function writeDemoPackagePlugin(pluginId = 'com.example.demo'): string {
  const root = join(agentDir, 'plugins', pluginId);
  writeFiles(root, {
    'manifest.json': JSON.stringify({
      id: pluginId,
      kind: 'runtime',
      runtime: { dshVersion: '0.2.0-rc.2', patch: 'cordis.patch.yml', entry: 'dist/index.js' },
    }),
    'package.json': JSON.stringify({ name: 'demo-rt', peerDependencies: { '@deepseek-ai/cordis': '~4.0.4' } }),
    'cordis.patch.yml': [
      '- insert:',
      '    - id: demo',
      '      name: ./dist/index.js',
      '      disabled: !!js "!ctx.get(\'tools\')"',
      '      config:',
      '        greeting: hello',
      '        assets: __PLUGIN_ROOT__/assets',
      '- id: tool-todo',
      '  disabled: true',
      '',
    ].join('\n'),
    'dist/index.js': 'export const name = "demo"; export function apply() {}\n',
  });
  return root;
}

function parsePatch(path: string): Array<Record<string, unknown>> {
  return YAML.parse(readFileSync(path, 'utf8'), { logLevel: 'error' }) as Array<
    Record<string, unknown>
  >;
}

function insertRows(patch: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  return patch.flatMap((item) =>
    Array.isArray(item.insert) ? (item.insert as Array<Record<string, unknown>>) : [],
  );
}

const baseRequest: CreateSessionRequest = {
  sessionId: 's1',
  systemPrompt: 'You are AgentLoom.',
  models: {
    providers: {
      openai: {
        api: 'openai-completions',
        apiKey: 'OPENAI_API_KEY',
        baseUrl: 'https://api.example.com/v1',
        compat: { supportsDeveloperRole: false },
        models: [{ id: 'gpt-x', name: 'GPT X' }],
      },
      private_cloud: {
        api: 'openai-completions',
        apiKey: '__agentloom_private_cloud_no_auth__',
        headers: { Authorization: '' },
        baseUrl: 'http://10.0.0.2/v1',
        models: [{ id: 'local-model' }],
      },
    },
  },
  runtimeApiKeys: { openai: 'sk-openai' },
};

beforeEach(() => {
  agentDir = mkdtempSync(join(tmpdir(), 'dsh-profile-'));
});

afterEach(() => {
  rmSync(agentDir, { recursive: true, force: true });
});

describe('writeDshProfile', () => {
  it('应生成平台层 patch：provider 路由、禁用条目、bridge 与 MCP 插入，并跳过 SSE MCP', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const profile = await writeDshProfile({
      agentDir,
      cwd: '/workspace/',
      provider: 'openai',
      model: 'gpt-x',
      bridgeEntry: BRIDGE_ENTRY,
      request: {
        ...baseRequest,
        mcpServers: {
          files: { transportType: 'stdio', command: 'mcp-files', args: ['--root', '/workspace'] },
          docs: { transportType: 'streamable_http', url: 'https://mcp.example.com', headers: { a: 'b' } },
          legacy: { transportType: 'sse', url: 'https://sse.example.com' },
        },
      },
    });

    expect(profile.dshHome).toBe(join(agentDir, 'dsh-home'));
    expect(profile.socketPath).toBe(join(agentDir, 'bridge.sock'));
    expect(JSON.parse(readFileSync(join(profile.profileDir, 'package.json'), 'utf8'))).toEqual({
      name: 'agentloom-profile',
      private: true,
      dsh: { profile: { bundles: ['@deepseek-ai/dsh-base'] } },
    });

    const patch = parsePatch(profile.patchPath);
    const byId = new Map(patch.filter((item) => 'id' in item).map((item) => [item.id, item]));
    expect(byId.get('sandbox-policy')).toEqual({
      id: 'sandbox-policy',
      config: { mode: 'danger-full-access', workspaceRoot: '/workspace/' },
    });
    expect(byId.get('approval')).toEqual({ id: 'approval', config: { policy: 'ask' } });
    expect(byId.get('system-prompt')).toEqual({
      id: 'system-prompt',
      config: { personaPrefix: 'You are AgentLoom.', includeHarnessIdentity: false },
    });
    expect(byId.get('agent-default-model')).toEqual({
      id: 'agent-default-model',
      config: { provider: 'openai', model: 'gpt-x' },
    });
    for (const id of ['llm-deepseek', 'otel', 'web', 'tool-web', 'plugin-manager']) {
      expect(byId.get(id)).toEqual({ id, disabled: true });
    }
    // 只含「danger-full-access + ask」一种预设，permissionPresets 服务才能挂载。
    expect(byId.get('permission')).toEqual({
      id: 'permission',
      config: {
        presets: {
          agentloom: {
            sandbox: 'danger-full-access',
            approval: 'ask',
            name: 'agentloom',
            description: expect.any(String),
          },
        },
      },
    });
    expect(profile.pluginEntries).toEqual([]);
    expect(byId.get('skill-filesystem')).toEqual({
      id: 'skill-filesystem',
      config: {
        includeDefaultRoots: false,
        customSkillDirs: [join(agentDir, 'skills')],
        watch: false,
      },
    });

    const providers = (byId.get('llm-pi-ai')?.config as { providers: Record<string, unknown> })
      .providers;
    expect(Object.keys(providers)).toEqual(['openai', 'private_cloud']);
    expect(providers.openai).toEqual({
      apiKeyEnv: 'AGENTLOOM_PROVIDER_OPENAI_API_KEY',
      api: 'openai-completions',
      baseURL: 'https://api.example.com/v1',
      models: [{ id: 'gpt-x', name: 'GPT X' }],
      compat: { supportsDeveloperRole: false },
    });
    expect(providers.private_cloud).toMatchObject({
      apiKeyEnv: 'AGENTLOOM_PROVIDER_PRIVATE_CLOUD_API_KEY',
      headers: { Authorization: '' },
      models: [{ id: 'local-model', name: 'local-model' }],
    });
    // 密钥只进环境变量，不进 patch 文件。
    expect(readFileSync(profile.patchPath, 'utf8')).not.toContain('sk-openai');
    expect(profile.env).toMatchObject({
      DSH_HOME: profile.dshHome,
      DSH_PERMISSION_MODE: 'danger-full-access',
      AGENTLOOM_PROVIDER_OPENAI_API_KEY: 'sk-openai',
      AGENTLOOM_PROVIDER_PRIVATE_CLOUD_API_KEY: '__agentloom_private_cloud_no_auth__',
    });

    expect(insertRows(patch)).toEqual([
      {
        id: 'agentloom-bridge',
        name: BRIDGE_ENTRY,
        config: { socketPath: profile.socketPath, workdir: '/workspace/' },
      },
      {
        id: 'mcp-files',
        name: '@deepseek-ai/dsh-mcp-client',
        config: {
          serverName: 'files',
          transport: 'stdio',
          command: 'mcp-files',
          args: ['--root', '/workspace'],
        },
      },
      {
        id: 'mcp-docs',
        name: '@deepseek-ai/dsh-mcp-client',
        config: {
          serverName: 'docs',
          transport: 'streamable-http',
          url: 'https://mcp.example.com',
          headers: { a: 'b' },
        },
      },
    ]);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('不支持 SSE transport'));
  });

  it('缺少 runtime key 且 apiKey 是环境变量名时不设变量（交给 dsh 报 MISSING_CREDENTIAL）', async () => {
    const profile = await writeDshProfile({
      agentDir,
      cwd: '/workspace/',
      provider: 'openai',
      model: 'gpt-x',
      bridgeEntry: BRIDGE_ENTRY,
      request: { ...baseRequest, runtimeApiKeys: {} },
    });

    expect(profile.env).not.toHaveProperty('AGENTLOOM_PROVIDER_OPENAI_API_KEY');
    expect(providerApiKeyEnv('my-provider.v2')).toBe('AGENTLOOM_PROVIDER_MY_PROVIDER_V2_API_KEY');
  });

  it('应按 平台层 → 插件层 → 用户 patch 顺序叠加，并链接 / 绝对化 / 合并插件条目', async () => {
    const pluginRoot = writeDemoPackagePlugin();
    const installNpmPackage = vi.fn(async (request: NpmInstallRequest) => {
      writeFiles(join(request.prefix, 'node_modules', request.name), {
        'package.json': JSON.stringify({
          name: request.name,
          dsh: { bundle: { patch: './cordis.patch.yml' } },
        }),
        'cordis.patch.yml': '- insert:\n    - id: npm-bundle\n      name: ./lib/index.js\n',
      });
    });

    const profile = await writeDshProfile({
      agentDir,
      cwd: '/workspace/',
      provider: 'openai',
      model: 'gpt-x',
      bridgeEntry: BRIDGE_ENTRY,
      installNpmPackage,
      request: {
        ...baseRequest,
        harness: {
          engine: 'dsh',
          profilePatch: '- id: tool-skill\n  disabled: true\n',
          plugins: [
            {
              nodeId: 'n1',
              source: 'package',
              ref: 'rp-1',
              pluginId: 'com.example.demo',
              enabled: true,
              config: { greeting: 'yo', extra: 1 },
            },
            {
              nodeId: 'n2',
              source: 'package',
              ref: 'rp-2',
              pluginId: 'com.example.disabled',
              enabled: false,
            },
            {
              nodeId: 'n3',
              source: 'npm',
              ref: '@acme/dsh-bundle',
              version: '1.2.3',
              enabled: true,
            },
          ],
        },
      },
    });

    const npmRoot = join(profile.dshHome, 'npm', 'node_modules', '@acme/dsh-bundle');
    expect(installNpmPackage).toHaveBeenCalledWith({
      prefix: join(profile.dshHome, 'npm'),
      home: profile.dshHome,
      name: '@acme/dsh-bundle',
      version: '1.2.3',
    });
    expect(readlinkSync(join(profile.profileDir, 'node_modules', 'demo-rt'))).toBe(pluginRoot);
    expect(readlinkSync(join(profile.profileDir, 'node_modules', '@acme/dsh-bundle'))).toBe(npmRoot);

    const raw = readFileSync(profile.patchPath, 'utf8');
    // !!js 标签必须原样保留给 dsh 的 Loader 求值。
    expect(raw).toContain(`disabled: !!js "!ctx.get('tools')"`);
    expect(raw).not.toContain('__PLUGIN_ROOT__');

    const patch = parsePatch(profile.patchPath);
    const tail = patch.slice(-4);
    expect(tail[0]).toEqual({
      insert: [
        {
          id: 'demo',
          name: join(pluginRoot, 'dist/index.js'),
          disabled: "!ctx.get('tools')",
          config: { greeting: 'yo', assets: `${pluginRoot}/assets`, extra: 1 },
        },
      ],
    });
    expect(tail[1]).toEqual({ id: 'tool-todo', disabled: true });
    expect(tail[2]).toEqual({ insert: [{ id: 'npm-bundle', name: join(npmRoot, 'lib/index.js') }] });
    expect(tail[3]).toEqual({ id: 'tool-skill', disabled: true });
    expect(insertRows(patch).map((row) => row.id)).toEqual(['agentloom-bridge', 'demo', 'npm-bundle']);
    // 停用节点不参与；bridge 据此核对每个插件条目是否激活。
    expect(profile.pluginEntries).toEqual([
      { id: 'demo', plugin: 'com.example.demo' },
      { id: 'npm-bundle', plugin: '@acme/dsh-bundle@1.2.3' },
    ]);
  });

  it('npm 包不是 dsh bundle 时应作为单个插件条目挂载', async () => {
    const profile = await writeDshProfile({
      agentDir,
      cwd: '/workspace/',
      provider: 'openai',
      model: 'gpt-x',
      bridgeEntry: BRIDGE_ENTRY,
      installNpmPackage: async (request) => {
        writeFiles(join(request.prefix, 'node_modules', request.name), {
          'package.json': JSON.stringify({ name: request.name, main: 'lib/index.js' }),
        });
      },
      request: {
        ...baseRequest,
        harness: {
          engine: 'dsh',
          plugins: [
            {
              nodeId: 'node:7',
              source: 'npm',
              ref: '@deepseek-ai/dsh-tool-todo',
              version: '0.2.0-rc.2',
              enabled: true,
              config: { allowParallelInProgress: false },
            },
          ],
        },
      },
    });

    expect(insertRows(parsePatch(profile.patchPath)).at(-1)).toEqual({
      id: 'runtime-plugin-node-7',
      name: '@deepseek-ai/dsh-tool-todo',
      config: { allowParallelInProgress: false },
    });
  });

  it('npm 安装失败时应带包名与版本抛错', async () => {
    await expect(
      writeDshProfile({
        agentDir,
        cwd: '/workspace/',
        provider: 'openai',
        model: 'gpt-x',
        bridgeEntry: BRIDGE_ENTRY,
        installNpmPackage: async () => {
          throw new Error('runtime 插件 bad-pkg@9.9.9 安装失败: 404 Not Found');
        },
        request: {
          ...baseRequest,
          harness: {
            engine: 'dsh',
            plugins: [{ nodeId: 'n1', source: 'npm', ref: 'bad-pkg', version: '9.9.9', enabled: true }],
          },
        },
      }),
    ).rejects.toThrow('runtime 插件 bad-pkg@9.9.9 安装失败');
  });

  it.each([
    [{ nodeId: 'n1', source: 'npm' as const, ref: 'Bad Name', version: '1.0.0', enabled: true }, 'npm 包名无效'],
    [{ nodeId: 'n1', source: 'npm' as const, ref: 'ok-name', enabled: true }, '缺少 npm 版本'],
    [{ nodeId: 'n1', source: 'npm' as const, ref: 'ok-name', version: '--registry=x', enabled: true }, '缺少 npm 版本'],
    [{ nodeId: 'n1', source: 'package' as const, ref: 'rp', enabled: true }, '缺少有效的 pluginId'],
    [{ nodeId: 'n1', source: 'package' as const, ref: 'rp', pluginId: '../x', enabled: true }, '缺少有效的 pluginId'],
    [{ nodeId: 'n1', source: 'package' as const, ref: 'rp', pluginId: 'com.missing', enabled: true }, '缺少或无法解析 manifest.json'],
  ])('插件引用无效时应拒绝：%o', async (plugin, message) => {
    await expect(
      writeDshProfile({
        agentDir,
        cwd: '/workspace/',
        provider: 'openai',
        model: 'gpt-x',
        bridgeEntry: BRIDGE_ENTRY,
        installNpmPackage: vi.fn(),
        request: { ...baseRequest, harness: { engine: 'dsh', plugins: [plugin] } },
      }),
    ).rejects.toThrow(message);
  });

  it('用户 profile patch 不是 YAML 列表时应拒绝', async () => {
    await expect(
      writeDshProfile({
        agentDir,
        cwd: '/workspace/',
        provider: 'openai',
        model: 'gpt-x',
        bridgeEntry: BRIDGE_ENTRY,
        request: { ...baseRequest, harness: { engine: 'dsh', profilePatch: 'id: x\n', plugins: [] } },
      }),
    ).rejects.toThrow('必须是 YAML 列表');
  });
});
