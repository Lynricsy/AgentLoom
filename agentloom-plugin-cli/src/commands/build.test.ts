import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

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

function createBuildFixture(root: string, withReadme = false): void {
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

  if (withReadme) {
    writeFileSync(join(root, 'README.md'), '# Archive Fixture\n', 'utf8');
  }
}

function listArchiveEntries(archivePath: string): string[] {
  const script = [
    'import json, sys, zipfile',
    'with zipfile.ZipFile(sys.argv[1]) as archive:',
    '    print(json.dumps(archive.namelist()))',
  ].join('\n');

  const output = execFileSync('python3', ['-c', script, archivePath], { encoding: 'utf8' });
  return JSON.parse(output) as string[];
}

function readArchiveEntry(archivePath: string, entryName: string): string {
  const script = [
    'import sys, zipfile',
    'with zipfile.ZipFile(sys.argv[1]) as archive:',
    '    print(archive.read(sys.argv[2]).decode())',
  ].join('\n');

  return execFileSync('python3', ['-c', script, archivePath, entryName], {
    encoding: 'utf8',
  });
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const directory = tempDirs.pop();
    if (directory) {
      rmSync(directory, { recursive: true, force: true });
    }
  }
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

  it('stores manifest.json at the archive root and includes package.json', async () => {
    const root = createTempRoot();
    createBuildFixture(root);

    const result = await buildPluginArchive({ cwd: root });
    const entries = listArchiveEntries(result.archivePath);

    expect(entries).toContain('manifest.json');
    expect(entries).toContain('package.json');
    expect(entries.some((entry) => entry.startsWith('dist/'))).toBe(true);
  });

  it('includes README.md when it exists', async () => {
    const root = createTempRoot();
    createBuildFixture(root, true);

    const result = await buildPluginArchive({ cwd: root });
    const entries = listArchiveEntries(result.archivePath);

    expect(entries).toContain('README.md');
    expect(readArchiveEntry(result.archivePath, 'manifest.json')).toContain(
      'com.agentloom.archive-fixture',
    );
  });
});
