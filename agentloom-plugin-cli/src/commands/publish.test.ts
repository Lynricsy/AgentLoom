import * as childProcess from 'node:child_process';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  computeContentHash,
  readArchiveManifest,
  verifyArchiveSignature,
} from '@agentloom/plugin-sdk';

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
import { publishPlugin } from './publish';

const tempDirs: string[] = [];

function createTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'agentloom-publish-'));
  tempDirs.push(dir);
  return dir;
}

function writeJson(filePath: string, value: Record<string, unknown>): void {
  writeFileSync(filePath, JSON.stringify(value, null, 2) + '\n', 'utf8');
}

function createBuildableProject(root: string): { keyPath: string; publicKeyPem: string } {
  mkdirSync(join(root, 'src'), { recursive: true });

  writeJson(join(root, 'manifest.json'), {
    id: 'com.agentloom.publish-test',
    name: 'Publish Test',
    version: '1.0.0',
    author: 'Test Author',
    description: 'Test plugin for publish',
    license: 'MIT',
    minPlatformVersion: '1.0.0',
    permissions: [],
  });

  writeJson(join(root, 'package.json'), {
    name: 'publish-test',
    version: '1.0.0',
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

  writeFileSync(join(root, 'src', 'index.ts'), 'export default { nodes: [] };\n', 'utf8');

  const { publicKey, privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  const keyPath = join(root, 'private.pem');
  writeFileSync(keyPath, privateKey, 'utf8');

  return { keyPath, publicKeyPem: publicKey as string };
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
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
    id: 'com.agentloom.publish-test',
    name: 'Publish Test',
    version: '1.0.0',
    author: 'Test Author',
    description: 'Test plugin for publish',
    license: 'MIT',
    minPlatformVersion: '1.0.0',
    permissions: [],
  },
  nodes: [],
  activate: async () => {},
  deactivate: async () => {},
};\n`,
        'utf8',
      );
      return Buffer.alloc(0);
    }

    throw new Error(`Unexpected command: ${command}`);
  });
});

describe('publishPlugin', () => {
  it('should throw without key option', async () => {
    await expect(publishPlugin({})).rejects.toThrow('必须提供私钥路径');
  });

  it('should throw when the archive has not been built yet', async () => {
    const root = createTempDir();
    const { keyPath } = createBuildableProject(root);

    await expect(publishPlugin({ key: keyPath, cwd: root })).rejects.toThrow(
      '未找到已构建的 .alp 归档',
    );
  });

  it('should sign an existing archive and return signature info', async () => {
    const root = createTempDir();
    const { keyPath } = createBuildableProject(root);

    await buildPluginArchive({ cwd: root });
    const result = await publishPlugin({ key: keyPath, cwd: root });

    expect(result.signature).toBeTruthy();
    expect(result.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.developerKeyFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(result.archivePath).toContain('.alp');
  });

  it('should embed verifiable signing metadata into manifest.json', async () => {
    const root = createTempDir();
    const { keyPath, publicKeyPem } = createBuildableProject(root);

    await buildPluginArchive({ cwd: root });
    const result = await publishPlugin({ key: keyPath, cwd: root });
    const archiveBuffer = readFileSync(result.archivePath);
    const manifest = await readArchiveManifest<Record<string, unknown>>(archiveBuffer);

    expect(manifest.signature).toBe(result.signature);
    expect(manifest.contentHash).toBe(result.contentHash);
    expect(manifest.developerKeyFingerprint).toBe(result.developerKeyFingerprint);
    expect(await computeContentHash(archiveBuffer)).toBe(result.contentHash);
    expect(
      await verifyArchiveSignature(archiveBuffer, result.signature, publicKeyPem),
    ).toBe(true);
  });
});
