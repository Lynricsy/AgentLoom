import { beforeAll, describe, expect, it } from 'vitest';
import {
  constants,
  createSign,
  generateKeyPairSync,
  type KeyPairKeyObjectResult,
} from 'node:crypto';

import {
  PluginDeveloperKeyInvalidException,
  PluginSignatureInvalidException,
  PluginSignatureMissingException,
} from './plugin.exceptions';
import { PluginSignatureService } from './plugin-signature.service';

function createRsaKeyPair(modulusLength: number): KeyPairKeyObjectResult {
  return generateKeyPairSync('rsa', {
    modulusLength,
  });
}

function exportPublicKeyPem(keyPair: KeyPairKeyObjectResult): string {
  return keyPair.publicKey.export({ type: 'spki', format: 'pem' }).toString();
}

function exportPrivateKeyPem(keyPair: KeyPairKeyObjectResult): string {
  return keyPair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
}

function signData(data: Buffer, privateKeyPem: string): string {
  const sign = createSign('SHA256');
  sign.update(data);
  sign.end();

  return sign.sign(
    {
      key: privateKeyPem,
      padding: constants.RSA_PKCS1_PSS_PADDING,
      saltLength: constants.RSA_PSS_SALTLEN_DIGEST,
    },
    'base64',
  );
}

describe('PluginSignatureService', () => {
  let service: PluginSignatureService;
  let publicKeyPem: string;
  let privateKeyPem: string;
  let testData: Buffer;

  beforeAll(() => {
    service = new PluginSignatureService();

    const keyPair = createRsaKeyPair(2048);
    publicKeyPem = exportPublicKeyPem(keyPair);
    privateKeyPem = exportPrivateKeyPem(keyPair);
    testData = Buffer.from('test plugin archive content');
  });

  describe('verifyArchiveSignature', () => {
    it('应返回有效签名结果', () => {
      const signature = signData(testData, privateKeyPem);

      const result = service.verifyArchiveSignature(
        testData,
        signature,
        publicKeyPem,
        'test-plugin',
      );

      expect(result).toEqual({
        valid: true,
        contentHash: service.computeContentHash(testData),
      });
    });

    it('缺少签名时应抛出 PluginSignatureMissingException', () => {
      expect(() =>
        service.verifyArchiveSignature(
          testData,
          undefined,
          publicKeyPem,
          'test-plugin',
        ),
      ).toThrow(PluginSignatureMissingException);
    });

    it('空字符串签名应视为缺失', () => {
      expect(() =>
        service.verifyArchiveSignature(testData, '', publicKeyPem, 'test-plugin'),
      ).toThrow(PluginSignatureMissingException);
    });

    it('篡改归档内容时应抛出 PluginSignatureInvalidException', () => {
      const signature = signData(testData, privateKeyPem);
      const tamperedData = Buffer.from('tampered content');

      expect(() =>
        service.verifyArchiveSignature(
          tamperedData,
          signature,
          publicKeyPem,
          'test-plugin',
        ),
      ).toThrow(PluginSignatureInvalidException);
    });

    it('使用错误私钥签名时应抛出 PluginSignatureInvalidException', () => {
      const otherKeyPair = createRsaKeyPair(2048);
      const otherPrivateKeyPem = exportPrivateKeyPem(otherKeyPair);
      const signature = signData(testData, otherPrivateKeyPem);

      expect(() =>
        service.verifyArchiveSignature(
          testData,
          signature,
          publicKeyPem,
          'test-plugin',
        ),
      ).toThrow(PluginSignatureInvalidException);
    });

    it('垃圾签名应抛出 PluginSignatureInvalidException', () => {
      expect(() =>
        service.verifyArchiveSignature(
          testData,
          Buffer.from('not-a-signature').toString('base64'),
          publicKeyPem,
          'test-plugin',
        ),
      ).toThrow(PluginSignatureInvalidException);
    });

    it('开发者公钥无效时应抛出 PluginDeveloperKeyInvalidException', () => {
      const ecKeyPair = generateKeyPairSync('ec', {
        namedCurve: 'P-256',
      });
      const ecPublicKeyPem = ecKeyPair.publicKey
        .export({ type: 'spki', format: 'pem' })
        .toString();
      const signature = signData(testData, privateKeyPem);

      expect(() =>
        service.verifyArchiveSignature(
          testData,
          signature,
          ecPublicKeyPem,
          'test-plugin',
        ),
      ).toThrow(PluginDeveloperKeyInvalidException);
    });
  });

  describe('computeContentHash', () => {
    it('应返回稳定的 SHA-256 十六进制哈希', () => {
      const hash1 = service.computeContentHash(testData);
      const hash2 = service.computeContentHash(testData);

      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^[a-f0-9]{64}$/);
    });

    it('不同数据应返回不同哈希', () => {
      const hash1 = service.computeContentHash(testData);
      const hash2 = service.computeContentHash(Buffer.from('other'));

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('validatePublicKey', () => {
    it('应接受有效的 RSA-2048 公钥', () => {
      const key = service.validatePublicKey(publicKeyPem);

      expect(key.type).toBe('public');
      expect(key.asymmetricKeyType).toBe('rsa');
    });

    it('应接受 RSA-4096 公钥', () => {
      const keyPair = createRsaKeyPair(4096);
      const key = service.validatePublicKey(exportPublicKeyPem(keyPair));

      expect(key.type).toBe('public');
      expect(key.asymmetricKeyDetails?.modulusLength).toBe(4096);
    });

    it('应拒绝私钥', () => {
      expect(() => service.validatePublicKey(privateKeyPem)).toThrow(
        PluginDeveloperKeyInvalidException,
      );
    });

    it('应拒绝无效 PEM', () => {
      expect(() => service.validatePublicKey('not-a-pem')).toThrow(
        PluginDeveloperKeyInvalidException,
      );
    });

    it('应拒绝 EC 公钥', () => {
      const ecKeyPair = generateKeyPairSync('ec', {
        namedCurve: 'P-256',
      });
      const ecPublicKeyPem = ecKeyPair.publicKey
        .export({ type: 'spki', format: 'pem' })
        .toString();

      expect(() => service.validatePublicKey(ecPublicKeyPem)).toThrow(
        PluginDeveloperKeyInvalidException,
      );
    });

    it('应拒绝 RSA-1024 弱密钥', () => {
      const weakKeyPair = createRsaKeyPair(1024);

      expect(() => service.validatePublicKey(exportPublicKeyPem(weakKeyPair))).toThrow(
        PluginDeveloperKeyInvalidException,
      );
    });
  });

  describe('computeKeyFingerprint', () => {
    it('应返回 SHA-256 十六进制指纹', () => {
      const fingerprint = service.computeKeyFingerprint(publicKeyPem);

      expect(fingerprint).toMatch(/^[a-f0-9]{64}$/);
    });

    it('同一公钥应返回相同指纹', () => {
      const fingerprint1 = service.computeKeyFingerprint(publicKeyPem);
      const fingerprint2 = service.computeKeyFingerprint(publicKeyPem);

      expect(fingerprint1).toBe(fingerprint2);
    });

    it('不同公钥应返回不同指纹', () => {
      const otherKeyPair = createRsaKeyPair(2048);
      const fingerprint1 = service.computeKeyFingerprint(publicKeyPem);
      const fingerprint2 = service.computeKeyFingerprint(
        exportPublicKeyPem(otherKeyPair),
      );

      expect(fingerprint1).not.toBe(fingerprint2);
    });
  });
});
