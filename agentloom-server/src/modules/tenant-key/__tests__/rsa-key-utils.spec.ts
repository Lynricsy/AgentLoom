import { generateKeyPairSync, type KeyObject } from 'crypto';

import { describe, expect, it } from 'vitest';

import { TenantKeyInvalidException } from '../exceptions/tenant-key.exceptions';
import { computeKeyFingerprint, validateRsaPublicKey } from '../rsa-key-utils';

function exportPublicKeyPem(publicKey: KeyObject): string {
  return publicKey.export({ type: 'spki', format: 'pem' }).toString();
}

function exportPrivateKeyPem(privateKey: KeyObject): string {
  return privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
}

describe('rsa-key-utils', () => {
  const rsa4096 = generateKeyPairSync('rsa', {
    modulusLength: 4096,
  });
  const rsa2048 = generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });
  const ec256 = generateKeyPairSync('ec', {
    namedCurve: 'prime256v1',
  });

  const validRsaPublicKey = exportPublicKeyPem(rsa4096.publicKey);
  const shortRsaPublicKey = exportPublicKeyPem(rsa2048.publicKey);
  const ecPublicKey = exportPublicKeyPem(ec256.publicKey);
  const privateKeyPem = exportPrivateKeyPem(rsa4096.privateKey);

  it('应接受有效的 4096-bit RSA 公钥', () => {
    expect(() => validateRsaPublicKey(validRsaPublicKey)).not.toThrow();
  });

  it('应拒绝 2048-bit RSA 公钥', () => {
    expect(() => validateRsaPublicKey(shortRsaPublicKey)).toThrowError(
      TenantKeyInvalidException,
    );
  });

  it('应拒绝 EC 公钥', () => {
    expect(() => validateRsaPublicKey(ecPublicKey)).toThrowError(
      TenantKeyInvalidException,
    );
  });

  it('应拒绝无效 PEM 字符串', () => {
    expect(() => validateRsaPublicKey('not-a-valid-pem')).toThrowError(
      TenantKeyInvalidException,
    );
  });

  it('应拒绝私钥 PEM', () => {
    expect(() => validateRsaPublicKey(privateKeyPem)).toThrowError(
      TenantKeyInvalidException,
    );
  });

  it('应生成 64 位十六进制指纹', () => {
    const fingerprint = computeKeyFingerprint(validRsaPublicKey);

    expect(fingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  it('相同公钥应生成相同指纹', () => {
    const firstFingerprint = computeKeyFingerprint(validRsaPublicKey);
    const secondFingerprint = computeKeyFingerprint(validRsaPublicKey);

    expect(firstFingerprint).toBe(secondFingerprint);
  });
});
