import * as childProcess from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readArchiveManifest } from '@agentloom/plugin-sdk';

const mocks = vi.hoisted(() => ({
  execSync: vi.fn(),
}));

vi.mock('node:child_process', async () => {
  const actual =
    await vi.importActual<typeof import('node:child_process')>(
      'node:child_process',
    );
  return {
    ...actual,
    execSync: mocks.execSync,
  };
});

import { buildPluginArchive } from './build';

const tempDirs: string[] = [];

function createTempRoot(): string {
  const directory = mkdtempSync(join(tmpdir(), 'agentloom-plugin-cli-build-'));
  tempDirs.push(directory);
  return directory;
}

function writeJson(filePath: string, value: unknown): void {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function createBuildFixture(
  root: string,
  options?: { withReadme?: boolean; withCargo?: boolean },
): void {
  mkdirSync(join(root, 'src'), { recursive: true });

  writeJson(join(root, 'manifest.json'), {
    id: 'com.agentloom.archive-fixture',
    name: 'Archive Fixture',
    version: '1.2.3',
    author: 'AgentLoom Team',
    description: 'Fixture used in build command tests',
    license: 'MIT',
    minPlatformVersion: '1.0.0',
    permissions: [],
  });

  writeJson(join(root, 'package.json'), {
    name: 'archive-fixture',
    version: '1.2.3',
    type: 'module',
    main: './dist/index.js',
  });

  writeJson(join(root, 'tsconfig.json'), {
    compilerOptions: {
      target: 'ES2022',
      module: 'NodeNext',
      moduleResolution: 'NodeNext',
      outDir: 'dist',
      rootDir: 'src',
      strict: true,
      skipLibCheck: true,
    },
    include: ['src/**/*.ts'],
  });

  writeFileSync(
    join(root, 'src', 'index.ts'),
    `const plugin = {
  nodes: [
    {
      type: 'archive-node',
      label: 'Archive Node',
      async execute(context: { inputs?: Record<string, unknown> }) {
        return { outputs: context.inputs ?? {} };
      },
    },
  ],
};

export default plugin;
`,
    'utf8',
  );

  if (options?.withReadme) {
    writeFileSync(join(root, 'README.md'), '# Archive Fixture\n', 'utf8');
  }

  if (options?.withCargo) {
    writeFileSync(
      join(root, 'Cargo.toml'),
      `[package]\nname = "archive_fixture"\nversion = "0.1.0"\nedition = "2021"\n`,
      'utf8',
    );
    writeJson(join(root, 'node-definitions.json'), [
      {
        type: 'example.echo',
        label: 'Echo',
        category: 'utility',
        description: 'Echo input text',
        inputPorts: [
          { id: 'text', label: 'Text', dataType: 'text', required: true },
        ],
        outputPorts: [
          { id: 'result', label: 'Result', dataType: 'text', required: true },
        ],
      },
    ]);
  }
}

function listArchiveEntries(archivePath: string): string[] {
  const script = [
    'import json, sys, zipfile',
    'with zipfile.ZipFile(sys.argv[1]) as archive:',
    '    print(json.dumps(archive.namelist()))',
  ].join('\n');

  const output = childProcess.execFileSync(
    'python3',
    ['-c', script, archivePath],
    {
      encoding: 'utf8',
    },
  );
  return JSON.parse(output) as string[];
}

function readArchiveJson(archivePath: string, entryPath: string): unknown {
  const script = [
    'import json, sys, zipfile',
    'with zipfile.ZipFile(sys.argv[1]) as archive:',
    '    print(archive.read(sys.argv[2]).decode("utf-8"))',
  ].join('\n');

  const output = childProcess.execFileSync(
    'python3',
    ['-c', script, archivePath, entryPath],
    { encoding: 'utf8' },
  );
  return JSON.parse(output) as unknown;
}

function readArchiveText(archivePath: string, entryPath: string): string {
  const script = [
    'import sys, zipfile',
    'with zipfile.ZipFile(sys.argv[1]) as archive:',
    '    sys.stdout.write(archive.read(sys.argv[2]).decode("utf-8"))',
  ].join('\n');

  return childProcess.execFileSync(
    'python3',
    ['-c', script, archivePath, entryPath],
    { encoding: 'utf8' },
  );
}

function readExecCwd(options: unknown): string {
  if (
    options !== null &&
    typeof options === 'object' &&
    'cwd' in options &&
    typeof options.cwd === 'string'
  ) {
    return options.cwd;
  }
  throw new Error('缺少 cwd');
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const directory = tempDirs.pop();
    if (directory) {
      rmSync(directory, { recursive: true, force: true });
    }
  }
});

beforeEach(() => {
  mocks.execSync.mockReset();
  mocks.execSync.mockImplementation((command, options) => {
    const cwd = (options as { cwd?: string } | undefined)?.cwd;
    if (!cwd) {
      throw new Error('缺少 cwd');
    }

    if (command === 'npx tsc') {
      mkdirSync(join(cwd, 'dist'), { recursive: true });
      writeFileSync(
        join(cwd, 'dist', 'index.js'),
        `export default {
  manifest: {
    id: 'com.agentloom.archive-fixture',
    name: 'Archive Fixture',
    version: '1.2.3',
    author: 'AgentLoom Team',
    description: 'Fixture used in build command tests',
    license: 'MIT',
    minPlatformVersion: '1.0.0',
    permissions: [],
  },
  nodes: [{
    type: 'archive-node',
    label: 'Archive Node',
    category: 'utility',
    description: 'Archive fixture node',
    inputPorts: [],
    outputPorts: [],
    execute: async () => ({ outputs: {} }),
  }],
  activate: async () => {},
  deactivate: async () => {},
};\n`,
        'utf8',
      );
      return Buffer.alloc(0);
    }

    // scaffold 是 Extism raw cdylib，构建走 cargo 交叉编译而非 wasm-pack。
    // 产物落在 target/<target>/release/<crate 下划线名>.wasm。
    if (command === 'cargo build --target wasm32-unknown-unknown --release') {
      mkdirSync(join(cwd, 'target', 'wasm32-unknown-unknown', 'release'), {
        recursive: true,
      });
      writeFileSync(
        join(
          cwd,
          'target',
          'wasm32-unknown-unknown',
          'release',
          'archive_fixture.wasm',
        ),
        Buffer.from([0, 97, 115, 109]),
      );
      return Buffer.alloc(0);
    }

    throw new Error(`Unexpected command: ${command}`);
  });
});

describe('buildPluginArchive', () => {
  it('creates an archive using the plugin id and version in the file name', async () => {
    const root = createTempRoot();
    createBuildFixture(root);

    const result = await buildPluginArchive({ cwd: root });

    expect(result.archivePath).toBe(
      join(root, 'build', 'com.agentloom.archive-fixture-1.2.3.alp'),
    );
  });

  it('creates the output directory automatically', async () => {
    const root = createTempRoot();
    createBuildFixture(root);

    const result = await buildPluginArchive({
      cwd: root,
      outputDir: 'artifacts',
    });

    expect(readFileSync(result.archivePath).length).toBeGreaterThan(0);
    expect(result.archivePath).toContain(join(root, 'artifacts'));
  });

  it('stores manifest.json、node-definitions.json at the archive root and includes package.json', async () => {
    const root = createTempRoot();
    createBuildFixture(root);

    const result = await buildPluginArchive({ cwd: root });
    const entries = listArchiveEntries(result.archivePath);
    const nodeDefinitions = readArchiveJson(
      result.archivePath,
      'node-definitions.json',
    );

    expect(entries).toContain('manifest.json');
    expect(entries).toContain('node-definitions.json');
    expect(entries).toContain('package.json');
    expect(entries.some((entry) => entry.startsWith('dist/'))).toBe(true);
    expect(nodeDefinitions).toEqual([
      {
        type: 'archive-node',
        label: 'Archive Node',
        category: 'utility',
        description: 'Archive fixture node',
        inputPorts: [],
        outputPorts: [],
      },
    ]);
  });

  it('includes README.md when it exists', async () => {
    const root = createTempRoot();
    createBuildFixture(root, { withReadme: true });

    const result = await buildPluginArchive({ cwd: root });
    const entries = listArchiveEntries(result.archivePath);

    expect(entries).toContain('README.md');
  });

  it('插件入口加载失败时保留原始错误并中止构建', async () => {
    const root = createTempRoot();
    createBuildFixture(root);
    mocks.execSync.mockImplementationOnce((_command, options) => {
      const cwd = (options as { cwd?: string } | undefined)?.cwd;
      if (!cwd) {
        throw new Error('缺少 cwd');
      }
      mkdirSync(join(cwd, 'dist'), { recursive: true });
      writeFileSync(
        join(cwd, 'dist', 'index.js'),
        'throw new Error("fixture load exploded");\n',
      );
      return Buffer.alloc(0);
    });

    await expect(buildPluginArchive({ cwd: root })).rejects.toThrow(
      'fixture load exploded',
    );
  });

  it('build --wasm 将节点定义与 WASM 产物写入归档', async () => {
    const root = createTempRoot();
    createBuildFixture(root, { withCargo: true });

    const result = await buildPluginArchive({ cwd: root, wasm: true });
    const entries = listArchiveEntries(result.archivePath);
    const manifest = await readArchiveManifest<Record<string, unknown>>(
      readFileSync(result.archivePath),
    );
    const nodeDefinitions = readArchiveJson(
      result.archivePath,
      'node-definitions.json',
    ) as Array<Record<string, unknown>>;

    expect(entries).toContain('dist/plugin.wasm');
    expect(entries).toContain('node-definitions.json');
    expect(manifest.wasmEntry).toBe('dist/plugin.wasm');
    expect(result.nodeCount).toBe(1);
    expect(nodeDefinitions[0]?.type).toBe('example.echo');
    expect(nodeDefinitions[0]?.outputPorts).toEqual([
      { id: 'result', label: 'Result', dataType: 'text', required: true },
    ]);
  });

  it('build --wasm 应调用 cargo 交叉编译并复制 target 产物到 dist/plugin.wasm', async () => {
    const root = createTempRoot();
    createBuildFixture(root, { withCargo: true });

    const result = await buildPluginArchive({ cwd: root, wasm: true });

    // 锁死命令本身：wasm-pack 与 Extism raw cdylib 不兼容，回退到它就是回归。
    expect(mocks.execSync).toHaveBeenCalledWith(
      'cargo build --target wasm32-unknown-unknown --release',
      expect.objectContaining({ cwd: root }),
    );
    expect(mocks.execSync).not.toHaveBeenCalledWith(
      expect.stringContaining('wasm-pack'),
      expect.anything(),
    );

    // 复制的必须是 cargo 的真实产物字节（WASM 魔术字 \0asm）。
    expect(
      readFileSync(join(root, 'dist', 'plugin.wasm')).subarray(0, 4),
    ).toEqual(Buffer.from([0, 97, 115, 109]));
    expect(listArchiveEntries(result.archivePath)).toContain(
      'dist/plugin.wasm',
    );
  });

  it('build --wasm 应按 [package] 段的 name 推导产物文件名而非依赖目录名', async () => {
    const root = createTempRoot();
    createBuildFixture(root, { withCargo: true });
    // crate 名带连字符时，cargo 产物文件名会把连字符换成下划线。
    writeFileSync(
      join(root, 'Cargo.toml'),
      `[package]\nname = "hyphen-crate"\nversion = "0.1.0"\nedition = "2021"\n\n[dependencies]\nname = "not-the-crate"\n`,
    );
    mocks.execSync.mockImplementation((_command, options) => {
      const cwd = (options as { cwd: string }).cwd;
      mkdirSync(join(cwd, 'target', 'wasm32-unknown-unknown', 'release'), {
        recursive: true,
      });
      writeFileSync(
        join(
          cwd,
          'target',
          'wasm32-unknown-unknown',
          'release',
          'hyphen_crate.wasm',
        ),
        Buffer.from([0, 97, 115, 109]),
      );
      return Buffer.alloc(0);
    });

    const result = await buildPluginArchive({ cwd: root, wasm: true });

    expect(listArchiveEntries(result.archivePath)).toContain(
      'dist/plugin.wasm',
    );
  });

  it('build --wasm 缺少 node-definitions.json 时给出可操作错误', async () => {
    const root = createTempRoot();
    createBuildFixture(root, { withCargo: true });
    unlinkSync(join(root, 'node-definitions.json'));

    await expect(buildPluginArchive({ cwd: root, wasm: true })).rejects.toThrow(
      /node-definitions\.json.*15 值 PortDataType/,
    );
    expect(mocks.execSync).not.toHaveBeenCalled();
  });

  it('build --wasm 可打包预先放入 wasmEntry 路径的 cargo 产物', async () => {
    const root = createTempRoot();
    createBuildFixture(root, { withCargo: true });
    mkdirSync(join(root, 'dist'), { recursive: true });
    writeFileSync(
      join(root, 'dist', 'plugin.wasm'),
      Buffer.from([0, 97, 115, 109]),
    );

    const result = await buildPluginArchive({ cwd: root, wasm: true });

    expect(listArchiveEntries(result.archivePath)).toContain(
      'dist/plugin.wasm',
    );
    expect(mocks.execSync).not.toHaveBeenCalled();
  });

  it('build --wasm 在缺少 Cargo.toml 时应抛出清晰错误', async () => {
    const root = createTempRoot();
    createBuildFixture(root);

    await expect(buildPluginArchive({ cwd: root, wasm: true })).rejects.toThrow(
      '未找到 Cargo.toml',
    );
  });

  it('runtime 插件打包 manifest、cordis.patch.yml、dist/ 且不产出 node-definitions.json', async () => {
    const root = createTempRoot();
    createBuildFixture(root);
    writeJson(join(root, 'manifest.json'), {
      id: 'com.agentloom.runtime-fixture',
      name: 'Runtime Fixture',
      version: '0.1.0',
      author: 'AgentLoom Team',
      description: 'Runtime plugin fixture',
      license: 'MIT',
      minPlatformVersion: '0.1.0',
      permissions: [],
      kind: 'runtime',
      runtime: {
        dshVersion: '0.2.0-rc.2',
        patch: './cordis.patch.yml',
        entry: './dist/index.js',
      },
    });
    writeFileSync(
      join(root, 'cordis.patch.yml'),
      '- insert:\n    - id: runtime-fixture\n      name: __PLUGIN_ROOT__/dist/index.js\n',
      'utf8',
    );

    const result = await buildPluginArchive({ cwd: root });
    const entries = listArchiveEntries(result.archivePath);
    const manifest = await readArchiveManifest<Record<string, unknown>>(
      readFileSync(result.archivePath),
    );

    expect(mocks.execSync).toHaveBeenCalledWith(
      'npx tsc',
      expect.objectContaining({ cwd: root }),
    );
    expect(result.archivePath).toBe(
      join(root, 'build', 'com.agentloom.runtime-fixture-0.1.0.alp'),
    );
    expect(result.nodeCount).toBe(0);
    expect(entries).toEqual(
      expect.arrayContaining([
        'manifest.json',
        'cordis.patch.yml',
        'dist/index.js',
        'package.json',
      ]),
    );
    expect(entries).not.toContain('node-definitions.json');
    expect(manifest.kind).toBe('runtime');
    expect(manifest.wasmEntry).toBeUndefined();
  });

  it('runtime 插件缺少 patch 文件时报错', async () => {
    const root = createTempRoot();
    createBuildFixture(root);
    writeJson(join(root, 'manifest.json'), {
      id: 'com.agentloom.runtime-fixture',
      name: 'Runtime Fixture',
      version: '0.1.0',
      author: 'AgentLoom Team',
      description: 'Runtime plugin fixture',
      license: 'MIT',
      minPlatformVersion: '0.1.0',
      permissions: [],
      kind: 'runtime',
      runtime: {
        dshVersion: '0.2.0-rc.2',
        patch: 'cordis.patch.yml',
        entry: 'dist/index.js',
      },
    });

    await expect(buildPluginArchive({ cwd: root })).rejects.toThrow(
      'runtime 插件缺少入口文件: cordis.patch.yml',
    );
  });

  it('runtime 插件把第三方依赖打包进 dist，解包后无需 node_modules 即可加载', async () => {
    const root = createTempRoot();
    createBuildFixture(root);
    writeJson(join(root, 'manifest.json'), {
      id: 'com.agentloom.runtime-deps',
      name: 'Runtime Deps',
      version: '0.1.0',
      author: 'AgentLoom Team',
      description: 'Runtime plugin with third-party dependencies',
      license: 'MIT',
      minPlatformVersion: '0.1.0',
      permissions: [],
      kind: 'runtime',
      runtime: {
        dshVersion: '0.2.0-rc.2',
        patch: './cordis.patch.yml',
        entry: './dist/index.js',
      },
    });
    writeJson(join(root, 'package.json'), {
      name: 'runtime-deps',
      type: 'module',
      dependencies: { 'esm-dep': '1.0.0', 'cjs-dep': '1.0.0' },
      peerDependencies: { '@deepseek-ai/dsh-tools': '0.2.0-rc.2' },
    });
    writeFileSync(
      join(root, 'cordis.patch.yml'),
      '- insert:\n    - id: runtime-deps\n      name: __PLUGIN_ROOT__/dist/index.js\n',
      'utf8',
    );
    const files: Record<string, string> = {
      'node_modules/esm-dep/package.json': '{"name":"esm-dep","type":"module","main":"index.js"}',
      'node_modules/esm-dep/index.js': 'export const esmValue = "esm-dep-value";\n',
      'node_modules/cjs-dep/package.json': '{"name":"cjs-dep","main":"index.js"}',
      'node_modules/cjs-dep/index.js':
        'const path = require("node:path");\nmodule.exports = { cjsValue: path.posix.join("cjs", "dep") };\n',
    };
    for (const [file, content] of Object.entries(files)) {
      mkdirSync(join(root, file, '..'), { recursive: true });
      writeFileSync(join(root, file), content, 'utf8');
    }
    mocks.execSync.mockImplementationOnce((_command, options) => {
      const cwd = readExecCwd(options);
      mkdirSync(join(cwd, 'dist'), { recursive: true });
      writeFileSync(
        join(cwd, 'dist', 'index.js'),
        [
          "import { esmValue } from 'esm-dep';",
          "import cjs from 'cjs-dep';",
          "export const name = 'runtime-deps';",
          'export function apply() { return `${esmValue}|${cjs.cjsValue}`; }',
          '',
        ].join('\n'),
        'utf8',
      );
      writeFileSync(
        join(cwd, 'dist', 'peer.js'),
        "import { defineTool } from '@deepseek-ai/dsh-tools';\nexport const tool = defineTool;\n",
        'utf8',
      );
      return Buffer.from('');
    });

    const result = await buildPluginArchive({ cwd: root });

    const entries = listArchiveEntries(result.archivePath);
    expect(entries).toEqual(
      expect.arrayContaining(['dist/index.js', 'dist/peer.js']),
    );
    expect(entries.some((entry) => entry.includes('node_modules'))).toBe(false);

    // 按 server 下发方式只落地包内文件，没有 node_modules。
    const unpacked = createTempRoot();
    for (const entry of entries.filter((name) => name.startsWith('dist/'))) {
      mkdirSync(join(unpacked, entry, '..'), { recursive: true });
      writeFileSync(join(unpacked, entry), readArchiveText(result.archivePath, entry));
    }
    // 这里要验证的正是「解包后的模块能否在没有 node_modules 的目录里被加载」，只能运行期导入。
    const plugin: unknown = await import(
      pathToFileURL(join(unpacked, 'dist', 'index.js')).href
    );
    expect(
      plugin !== null &&
        typeof plugin === 'object' &&
        'apply' in plugin &&
        typeof plugin.apply === 'function'
        ? plugin.apply()
        : undefined,
    ).toBe('esm-dep-value|cjs/dep');
    expect(readArchiveText(result.archivePath, 'dist/peer.js')).toMatch(
      /from\s*["']@deepseek-ai\/dsh-tools["']/,
    );
  });

  it('runtime 插件打包后的单个文件超过 1 MiB 时报错', async () => {
    const root = createTempRoot();
    createBuildFixture(root);
    writeJson(join(root, 'manifest.json'), {
      id: 'com.agentloom.runtime-large',
      name: 'Runtime Large',
      version: '0.1.0',
      author: 'AgentLoom Team',
      description: 'Runtime plugin exceeding the session file limit',
      license: 'MIT',
      minPlatformVersion: '0.1.0',
      permissions: [],
      kind: 'runtime',
      runtime: {
        dshVersion: '0.2.0-rc.2',
        patch: './cordis.patch.yml',
        entry: './dist/index.js',
      },
    });
    writeFileSync(
      join(root, 'cordis.patch.yml'),
      '- insert:\n    - id: runtime-large\n      name: __PLUGIN_ROOT__/dist/index.js\n',
      'utf8',
    );
    mocks.execSync.mockImplementationOnce((_command, options) => {
      const cwd = readExecCwd(options);
      mkdirSync(join(cwd, 'dist'), { recursive: true });
      writeFileSync(
        join(cwd, 'dist', 'index.js'),
        `export const blob = ${JSON.stringify('x'.repeat(1024 * 1024 + 1))};\n`,
        'utf8',
      );
      return Buffer.from('');
    });

    await expect(buildPluginArchive({ cwd: root })).rejects.toThrow(
      /runtime 插件文件 dist\/index\.js 为 \d+ 字节，超过会话下发通道的单文件上限 1 MiB/,
    );
  });
});
