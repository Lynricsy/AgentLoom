import { generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { computeContentHash, signArchive } from './sign';
import { verifyArchiveSignature } from './verify';

describe('signing utilities', () => {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  const testData = Buffer.from('test plugin archive content');

  describe('computeContentHash', () => {
    it('应该返回 SHA-256 hex 字符串', () => {
      const hash = computeContentHash(testData);
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('相同数据应该返回相同哈希', () => {
      const hash1 = computeContentHash(testData);
      const hash2 = computeContentHash(testData);
      expect(hash1).toBe(hash2);
    });

    it('不同数据应该返回不同哈希', () => {
      const hash1 = computeContentHash(testData);
      const hash2 = computeContentHash(Buffer.from('different data'));
      expect(hash1).not.toBe(hash2);
    });

    it('应该接受 Uint8Array', () => {
      const hash = computeContentHash(new Uint8Array([1, 2, 3]));
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe('signArchive', () => {
    it('应该返回 base64 签名', () => {
      const signature = signArchive(testData, privateKey as string);
      expect(signature).toBeTruthy();
      expect(() => Buffer.from(signature, 'base64')).not.toThrow();
    });

    it('相同数据和密钥的签名应该可以验证', () => {
      const signature = signArchive(testData, privateKey as string);
      const valid = verifyArchiveSignature(testData, signature, publicKey as string);
      expect(valid).toBe(true);
    });
  });

  describe('verifyArchiveSignature', () => {
    it('有效签名应该返回 true', () => {
      const signature = signArchive(testData, privateKey as string);
      expect(verifyArchiveSignature(testData, signature, publicKey as string)).toBe(true);
    });

    it('篡改数据后应该返回 false', () => {
      const signature = signArchive(testData, privateKey as string);
      const tampered = Buffer.from('tampered data');
      expect(verifyArchiveSignature(tampered, signature, publicKey as string)).toBe(false);
    });

    it('错误签名应该返回 false', () => {
      const fakeSignature = Buffer.from('invalid signature').toString('base64');
      expect(verifyArchiveSignature(testData, fakeSignature, publicKey as string)).toBe(false);
    });

    it('使用其他密钥对的签名应该返回 false', () => {
      const otherKeys = generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      });
      const signature = signArchive(testData, otherKeys.privateKey as string);
      expect(verifyArchiveSignature(testData, signature, publicKey as string)).toBe(false);
    });

    it('无效公钥应该返回 false', () => {
      const signature = signArchive(testData, privateKey as string);
      expect(verifyArchiveSignature(testData, signature, 'not-a-key')).toBe(false);
    });
  });
});
