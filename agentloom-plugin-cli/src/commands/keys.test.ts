import { createPublicKey } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
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
  it('should generate RSA-2048 key pair files and fingerprint', () => {
    const dir = createTempDir();
    const result = generateKeyPair({ outputDir: dir });

    expect(existsSync(result.publicKeyPath)).toBe(true);
    expect(existsSync(result.privateKeyPath)).toBe(true);
    expect(result.fingerprint).toMatch(/^[a-f0-9]{64}$/);

    const publicKey = readFileSync(result.publicKeyPath, 'utf8');
    expect(publicKey).toContain('BEGIN PUBLIC KEY');

    const privateKey = readFileSync(result.privateKeyPath, 'utf8');
    expect(privateKey).toContain('BEGIN PRIVATE KEY');
  });

  it('should generate valid RSA-3072 keys when bits are specified', () => {
    const dir = createTempDir();
    const result = generateKeyPair({ outputDir: dir, bits: 3072 });

    const publicKeyPem = readFileSync(result.publicKeyPath, 'utf8');
    const keyObject = createPublicKey(publicKeyPem);

    expect(keyObject.type).toBe('public');
    expect(keyObject.asymmetricKeyType).toBe('rsa');
    expect(keyObject.asymmetricKeyDetails?.modulusLength).toBe(3072);
  });

  it('should use ./keys as the default output directory', () => {
    const dir = createTempDir();
    const previousCwd = process.cwd();
    process.chdir(dir);

    try {
      const result = generateKeyPair();
      expect(result.publicKeyPath).toBe(join(dir, 'keys', 'public.pem'));
      expect(result.privateKeyPath).toBe(join(dir, 'keys', 'private.pem'));
    } finally {
      process.chdir(previousCwd);
    }
  });

  it('should throw if keys already exist', () => {
    const dir = createTempDir();
    generateKeyPair({ outputDir: dir });
    expect(() => generateKeyPair({ outputDir: dir })).toThrow('密钥已存在');
  });

  it('should create output directory recursively', () => {
    const dir = createTempDir();
    const nested = join(dir, 'deep', 'nested');
    const result = generateKeyPair({ outputDir: nested, bits: 4096 });
    expect(existsSync(result.publicKeyPath)).toBe(true);
  });
});
