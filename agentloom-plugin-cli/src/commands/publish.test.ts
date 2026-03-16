import { execFileSync } from 'node:child_process';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';
import { verifyArchiveSignature } from '@agentloom/plugin-sdk';

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

function readArchiveManifest(archivePath: string): Record<string, unknown> {
  const script = [
    'import json, sys, zipfile',
    'with zipfile.ZipFile(sys.argv[1]) as archive:',
    '    print(archive.read("manifest.json").decode())',
  ].join('\n');

  return JSON.parse(execFileSync('python3', ['-c', script, archivePath], { encoding: 'utf8' })) as Record<
    string,
    unknown
  >;
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

describe('publishPlugin', () => {
  it('should throw without key option', async () => {
    await expect(publishPlugin({})).rejects.toThrow('必须提供私钥路径');
  });

  it('should sign archive and return signature info', async () => {
    const root = createTempDir();
    const { keyPath } = createBuildableProject(root);

    const result = await publishPlugin({ key: keyPath, cwd: root });

    expect(result.signature).toBeTruthy();
    expect(result.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.developerKeyFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(result.archivePath).toContain('.alp');
  }, 30000);

  it('should produce a verifiable signature', async () => {
    const root = createTempDir();
    const { keyPath, publicKeyPem } = createBuildableProject(root);

    const result = await publishPlugin({ key: keyPath, cwd: root });
    const archiveBuffer = readFileSync(result.archivePath);

    const valid = verifyArchiveSignature(archiveBuffer, result.signature, publicKeyPem);
    expect(valid).toBe(true);
  }, 30000);

  it('should embed signing metadata into manifest.json', async () => {
    const root = createTempDir();
    const { keyPath } = createBuildableProject(root);

    const result = await publishPlugin({ key: keyPath, cwd: root });
    const manifest = readArchiveManifest(result.archivePath);

    expect(manifest.signature).toEqual(expect.any(String));
    expect(manifest.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(manifest.developerKeyFingerprint).toBe(result.developerKeyFingerprint);
  }, 30000);
});
