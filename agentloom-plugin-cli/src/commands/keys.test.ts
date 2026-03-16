import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createPublicKey } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { generateKeyPair } from './keys';

const tempDirs: string[] = [];

function createTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'agentloom-keys-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe('generateKeyPair', () => {
  it('should generate RSA-2048 key pair files', () => {
    const dir = createTempDir();
    const result = generateKeyPair({ outputDir: dir });

    expect(existsSync(result.publicKeyPath)).toBe(true);
    expect(existsSync(result.privateKeyPath)).toBe(true);

    const publicKey = readFileSync(result.publicKeyPath, 'utf8');
    expect(publicKey).toContain('BEGIN PUBLIC KEY');

    const privateKey = readFileSync(result.privateKeyPath, 'utf8');
    expect(privateKey).toContain('BEGIN PRIVATE KEY');
  });

  it('should generate valid RSA-2048 keys', () => {
    const dir = createTempDir();
    const result = generateKeyPair({ outputDir: dir });

    const publicKeyPem = readFileSync(result.publicKeyPath, 'utf8');
    const keyObject = createPublicKey(publicKeyPem);

    expect(keyObject.type).toBe('public');
    expect(keyObject.asymmetricKeyType).toBe('rsa');
  });

  it('should throw if keys already exist', () => {
    const dir = createTempDir();
    generateKeyPair({ outputDir: dir });
    expect(() => generateKeyPair({ outputDir: dir })).toThrow('密钥已存在');
  });

  it('should create output directory recursively', () => {
    const dir = createTempDir();
    const nested = join(dir, 'deep', 'nested');
    const result = generateKeyPair({ outputDir: nested });
    expect(existsSync(result.publicKeyPath)).toBe(true);
  });
});
