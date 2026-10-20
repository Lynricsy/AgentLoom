import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createPluginProject,
  runCreateCommand,
  type CreatePromptRunner,
} from './create';

const tempDirs: string[] = [];

function createTempRoot(): string {
  const directory = mkdtempSync(join(tmpdir(), 'agentloom-plugin-cli-create-'));
  tempDirs.push(directory);
  return directory;
}

function readJson<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, 'utf8')) as T;
}

afterEach(() => {
  vi.restoreAllMocks();

  while (tempDirs.length > 0) {
    const directory = tempDirs.pop();
    if (directory) {
      rmSync(directory, { recursive: true, force: true });
    }
  }
});

describe('createPluginProject', () => {
  it('creates the expected directory structure', () => {
    const targetDir = createTempRoot();
    const result = createPluginProject({
      name: 'demo-plugin',
      author: 'AgentLoom Team',
      description: 'Demo plugin',
      license: 'MIT',
      targetDir,
    });

    expect(existsSync(result.projectDir)).toBe(true);
    expect(existsSync(join(result.projectDir, 'manifest.json'))).toBe(true);
    expect(existsSync(join(result.projectDir, 'package.json'))).toBe(true);
    expect(existsSync(join(result.projectDir, 'tsconfig.json'))).toBe(true);
    expect(existsSync(join(result.projectDir, 'src', 'index.ts'))).toBe(true);
    expect(existsSync(join(result.projectDir, 'tests', 'index.test.ts'))).toBe(
      true,
    );
  });

  it('generates a valid manifest with the required fields', () => {
    const targetDir = createTempRoot();
    const result = createPluginProject({
      name: 'text-transformer',
      author: 'Wine Fox',
      description: 'Transforms text',
      license: 'MIT',
      targetDir,
    });

    const manifest = readJson<Record<string, unknown>>(result.manifestPath);

    expect(manifest.id).toBe('com.agentloom.text-transformer');
    expect(manifest.name).toBe('text-transformer');
    expect(manifest.author).toBe('Wine Fox');
    expect(manifest.description).toBe('Transforms text');
    expect(manifest.license).toBe('MIT');
    expect(manifest.minPlatformVersion).toBe('0.1.0');
    expect(manifest.permissions).toEqual([]);
  });

  it('writes package.json with the SDK dependency and expected scripts', () => {
    const targetDir = createTempRoot();
    const result = createPluginProject({
      name: 'sdk-consumer',
      author: 'AgentLoom Team',
      description: 'Consumes SDK',
      license: 'MIT',
      targetDir,
    });

    const packageJson = readJson<Record<string, Record<string, string>>>(
      result.packageJsonPath,
    );

    expect(packageJson.dependencies?.['@agentloom/plugin-sdk']).toBe(
      'file:../agentloom-plugin-sdk',
    );
    expect(packageJson.scripts?.build).toBe('tsc');
    expect(packageJson.scripts?.test).toBe('vitest run');
    expect(packageJson.scripts?.dev).toBe('agentloom-plugin dev');
  });

  it('normalizes the plugin name into the reverse-domain plugin id', () => {
    const targetDir = createTempRoot();
    const result = createPluginProject({
      name: 'Fancy Plugin!!!',
      author: 'AgentLoom Team',
      description: 'Fancy',
      license: 'MIT',
      targetDir,
    });

    expect(result.pluginId).toBe('com.agentloom.fancy-plugin');
    expect(result.projectDir).toBe(join(targetDir, 'fancy-plugin'));
  });

  it('throws when the target directory already exists', () => {
    const targetDir = createTempRoot();

    createPluginProject({
      name: 'duplicate-plugin',
      author: 'AgentLoom Team',
      description: 'First project',
      license: 'MIT',
      targetDir,
    });

    expect(() =>
      createPluginProject({
        name: 'duplicate-plugin',
        author: 'AgentLoom Team',
        description: 'Second project',
        license: 'MIT',
        targetDir,
      }),
    ).toThrow(/目标目录已存在/);
  });

  it('create --wasm 生成 Rust/Extism 文件与 WASM 清单', () => {
    const targetDir = createTempRoot();
    const result = createPluginProject({
      name: 'Wasm Echo',
      author: 'AgentLoom Team',
      description: 'WASM echo plugin',
      license: 'MIT',
      targetDir,
      wasm: true,
    });

    const expectedFiles = [
      'Cargo.toml',
      'README.md',
      'manifest.json',
      'node-definitions.json',
      'package.json',
      join('src', 'lib.rs'),
    ];
    for (const relativePath of expectedFiles) {
      expect(existsSync(join(result.projectDir, relativePath))).toBe(true);
    }
    expect(existsSync(join(result.projectDir, 'tsconfig.json'))).toBe(false);
    expect(existsSync(join(result.projectDir, 'src', 'index.ts'))).toBe(false);

    const manifest = readJson<Record<string, unknown>>(result.manifestPath);
    const nodeDefinitions = readJson<Array<Record<string, unknown>>>(
      join(result.projectDir, 'node-definitions.json'),
    );
    const cargoToml = readFileSync(
      join(result.projectDir, 'Cargo.toml'),
      'utf8',
    );
    const rustSource = readFileSync(
      join(result.projectDir, 'src', 'lib.rs'),
      'utf8',
    );
    const readme = readFileSync(join(result.projectDir, 'README.md'), 'utf8');

    expect(manifest.wasmEntry).toBe('dist/plugin.wasm');
    expect(nodeDefinitions).toHaveLength(1);
    expect(nodeDefinitions[0]?.inputPorts).toEqual([
      { id: 'text', label: '文本', dataType: 'text', required: true },
    ]);
    expect(cargoToml).toContain('extism-pdk = "1"');
    expect(cargoToml).toContain('crate-type = ["cdylib"]');
    expect(rustSource).toContain('#[plugin_fn]');
    expect(rustSource).toContain(
      'pub fn execute(input: String) -> FnResult<String>',
    );
    expect(rustSource).toContain('json!({ "result":');
    // 精确锁死 .into()：漏掉它会让模板以 E0308 编译失败，
    // 而这个失败只有在真跑 cargo 时才暴露，单测必须替它把关。
    expect(rustSource).toContain(
      'Err(Error::msg(format!("不支持的 nodeType: {node_type}")).into()),',
    );
    // README 必须给 cargo 口径；wasm-pack 与 Extism raw cdylib 不兼容。
    expect(readme).toContain(
      'cargo build --target wasm32-unknown-unknown --release',
    );
    expect(readme).not.toContain('wasm-pack');
    expect(readme).toContain('agentloom-plugin build --wasm');
    expect(readme).toContain('agentloom-plugin publish -k <key>');
    expect(readme).toContain('Studio');
  });

  it('create --runtime 生成 dsh runtime 插件脚手架与 runtime 清单', () => {
    const targetDir = createTempRoot();
    const result = createPluginProject({
      name: 'Demo RT',
      author: 'AgentLoom Team',
      description: 'Runtime plugin',
      license: 'MIT',
      targetDir,
      runtime: true,
    });

    for (const relativePath of [
      'README.md',
      'cordis.patch.yml',
      'manifest.json',
      'package.json',
      'tsconfig.json',
      join('src', 'index.ts'),
    ]) {
      expect(existsSync(join(result.projectDir, relativePath))).toBe(true);
    }
    expect(existsSync(join(result.projectDir, 'node-definitions.json'))).toBe(
      false,
    );

    const manifest = readJson<Record<string, unknown>>(result.manifestPath);
    const packageJson = readJson<Record<string, unknown>>(
      result.packageJsonPath,
    );
    const patch = readFileSync(
      join(result.projectDir, 'cordis.patch.yml'),
      'utf8',
    );
    const source = readFileSync(
      join(result.projectDir, 'src', 'index.ts'),
      'utf8',
    );

    expect(manifest.kind).toBe('runtime');
    expect(manifest.wasmEntry).toBeUndefined();
    expect(manifest.runtime).toEqual({
      dshVersion: '0.2.0-rc.2',
      patch: './cordis.patch.yml',
      entry: './dist/index.js',
    });
    expect(packageJson.peerDependencies).toEqual({
      '@deepseek-ai/cordis': '~4.0.4',
      '@deepseek-ai/dsh-tools': '0.2.0-rc.2',
    });
    expect(patch).toContain('name: __PLUGIN_ROOT__/dist/index.js');
    expect(source).toContain("export const inject = ['tools'];");
    expect(source).toContain("name: 'demo_rt_echo'");
    expect(source).not.toContain('console.log');
  });

  it('--wasm 与 --runtime 互斥', () => {
    expect(() =>
      createPluginProject({
        name: 'both',
        author: 'AgentLoom Team',
        description: 'Both',
        license: 'MIT',
        targetDir: createTempRoot(),
        wasm: true,
        runtime: true,
      }),
    ).toThrow('--wasm 与 --runtime 不能同时使用。');
  });
});

describe('runCreateCommand', () => {
  it('collects prompt answers and prints the next steps', async () => {
    const targetDir = createTempRoot();
    const promptRunner: CreatePromptRunner = vi.fn(async () => ({
      author: 'AgentLoom Team',
      description: 'Prompted plugin',
      license: 'Apache-2.0',
    }));
    const consoleSpy = vi
      .spyOn(console, 'info')
      .mockImplementation(() => undefined);

    const result = await runCreateCommand({
      name: 'Prompt Plugin',
      cwd: targetDir,
      interactive: true,
      promptRunner,
    });

    expect(promptRunner).toHaveBeenCalledTimes(1);
    expect(result.pluginId).toBe('com.agentloom.prompt-plugin');
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('cd prompt-plugin && pnpm install && pnpm dev'),
    );
  });

  it('--wasm 与 --runtime 冲突时在提示之前报错', async () => {
    const promptRunner: CreatePromptRunner = vi.fn();

    await expect(
      runCreateCommand({
        name: 'both',
        cwd: createTempRoot(),
        wasm: true,
        runtime: true,
        interactive: true,
        promptRunner,
      }),
    ).rejects.toThrow('--wasm 与 --runtime 不能同时使用。');
    expect(promptRunner).not.toHaveBeenCalled();
  });

  it('目标目录已存在时在提示之前报错', async () => {
    const targetDir = createTempRoot();
    mkdirSync(join(targetDir, 'taken'));
    const promptRunner: CreatePromptRunner = vi.fn();

    await expect(
      runCreateCommand({
        name: 'taken',
        cwd: targetDir,
        interactive: true,
        promptRunner,
      }),
    ).rejects.toThrow(`目标目录已存在：${join(targetDir, 'taken')}`);
    expect(promptRunner).not.toHaveBeenCalled();
  });

  it('非交互终端缺少 --author/--description 时报错且不创建目录', async () => {
    const targetDir = createTempRoot();
    const promptRunner: CreatePromptRunner = vi.fn();

    await expect(
      runCreateCommand({
        name: 'ci-plugin',
        cwd: targetDir,
        interactive: false,
        promptRunner,
      }),
    ).rejects.toThrow(
      '当前不是交互终端，无法提示输入作者、描述。请通过 --author <author> --description <description> 提供',
    );
    expect(promptRunner).not.toHaveBeenCalled();
    expect(existsSync(join(targetDir, 'ci-plugin'))).toBe(false);
  });

  it('非交互参数齐全时跳过提示并默认 MIT 许可证', async () => {
    const targetDir = createTempRoot();
    const promptRunner: CreatePromptRunner = vi.fn();
    vi.spyOn(console, 'info').mockImplementation(() => undefined);

    const result = await runCreateCommand({
      name: 'ci-plugin',
      cwd: targetDir,
      wasm: true,
      author: ' CI Bot ',
      description: 'Built in CI',
      interactive: false,
      promptRunner,
    });
    const manifest = readJson<Record<string, unknown>>(result.manifestPath);

    expect(promptRunner).not.toHaveBeenCalled();
    expect(manifest.author).toBe('CI Bot');
    expect(manifest.description).toBe('Built in CI');
    expect(manifest.license).toBe('MIT');
  });

  it('交互终端只提示未通过参数提供的字段', async () => {
    const targetDir = createTempRoot();
    const promptRunner = vi.fn(async () => ({ description: 'Prompted' }));
    vi.spyOn(console, 'info').mockImplementation(() => undefined);

    const result = await runCreateCommand({
      name: 'partial',
      cwd: targetDir,
      author: 'Flag Author',
      license: 'Apache-2.0',
      interactive: true,
      promptRunner: promptRunner as unknown as CreatePromptRunner,
    });
    const questions = (promptRunner.mock.calls[0] as unknown[] | undefined)?.[0] as
      | Array<{ name: string }>
      | undefined;

    expect(questions?.map((question) => question.name)).toEqual(['description']);
    expect(readJson<Record<string, unknown>>(result.manifestPath)).toMatchObject({
      author: 'Flag Author',
      description: 'Prompted',
      license: 'Apache-2.0',
    });
  });

  it('提示提前结束（未拿到答案）时报错而不是静默成功', async () => {
    const targetDir = createTempRoot();
    const promptRunner = vi.fn(async () => ({}));

    await expect(
      runCreateCommand({
        name: 'eof-plugin',
        cwd: targetDir,
        interactive: true,
        promptRunner: promptRunner as unknown as CreatePromptRunner,
      }),
    ).rejects.toThrow('已取消插件创建');
    expect(existsSync(join(targetDir, 'eof-plugin'))).toBe(false);
  });
});
