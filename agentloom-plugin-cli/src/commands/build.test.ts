import * as childProcess from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readArchiveManifest } from '@agentloom/plugin-sdk';

const mocks = vi.hoisted(() => ({
  execSync: vi.fn(),
}));

vi.mock('node:child_process', async () => {
  const actual = await vi.importActual<typeof import('node:child_process')>('node:child_process');
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

function writeJson(filePath: string, value: Record<string, unknown>): void {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function createBuildFixture(root: string, options?: { withReadme?: boolean; withCargo?: boolean }): void {
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
  }
}

function listArchiveEntries(archivePath: string): string[] {
  const script = [
    'import json, sys, zipfile',
    'with zipfile.ZipFile(sys.argv[1]) as archive:',
    '    print(json.dumps(archive.namelist()))',
  ].join('\n');

  const output = childProcess.execFileSync('python3', ['-c', script, archivePath], {
    encoding: 'utf8',
  });
  return JSON.parse(output) as string[];
}

function readArchiveJson(
  archivePath: string,
  entryPath: string,
): unknown {
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

    if (command === 'npx wasm-pack build --target bundler --release') {
      mkdirSync(join(cwd, 'pkg'), { recursive: true });
      writeFileSync(join(cwd, 'pkg', 'archive_fixture_bg.wasm'), Buffer.from([0, 97, 115, 109]));
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

    expect(result.archivePath).toBe(join(root, 'build', 'com.agentloom.archive-fixture-1.2.3.alp'));
  });

  it('creates the output directory automatically', async () => {
    const root = createTempRoot();
    createBuildFixture(root);

    const result = await buildPluginArchive({ cwd: root, outputDir: 'artifacts' });

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
      writeFileSync(join(cwd, 'dist', 'index.js'), 'throw new Error("fixture load exploded");\n');
      return Buffer.alloc(0);
    });

    await expect(buildPluginArchive({ cwd: root })).rejects.toThrow('fixture load exploded');
  });

  it('build --wasm 应将 pkg 中的 .wasm 复制到 dist/plugin.wasm 并写回 manifest.wasmEntry', async () => {
    const root = createTempRoot();
    createBuildFixture(root, { withCargo: true });

    const result = await buildPluginArchive({ cwd: root, wasm: true });
    const entries = listArchiveEntries(result.archivePath);
    const manifest = await readArchiveManifest<Record<string, unknown>>(
      readFileSync(result.archivePath),
    );

    expect(entries).toContain('dist/plugin.wasm');
    expect(manifest.wasmEntry).toBe('dist/plugin.wasm');
  });

  it('build --wasm 在缺少 Cargo.toml 时应抛出清晰错误', async () => {
    const root = createTempRoot();
    createBuildFixture(root);

    await expect(buildPluginArchive({ cwd: root, wasm: true })).rejects.toThrow(
      '未找到 Cargo.toml',
    );
  });
});
