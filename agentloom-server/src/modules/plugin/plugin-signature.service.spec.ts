import { beforeAll, describe, expect, it } from 'vitest';
import { generateKeyPairSync, type KeyPairKeyObjectResult } from 'node:crypto';

import JSZip from 'jszip';
import {
  computeContentHash,
  signArchive,
  updateArchiveManifest,
} from '@agentloom/plugin-sdk';

import {
  PluginDeveloperKeyInvalidException,
  PluginSignatureInvalidException,
  PluginSignatureMissingException,
} from './plugin.exceptions';
import { PluginSignatureService } from './plugin-signature.service';

const baseManifest = {
  id: 'com.agentloom.server-signature-fixture',
  name: 'Server Signature Fixture',
  version: '1.0.0',
  author: 'AgentLoom',
  description: 'Server signature test fixture',
  license: 'MIT',
  minPlatformVersion: '1.0.0',
  permissions: ['network:outbound'],
};

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

async function createUnsignedArchive(): Promise<Buffer> {
  const zip = new JSZip();
  zip.file('manifest.json', `${JSON.stringify(baseManifest, null, 2)}\n`);
  zip.file('dist/index.js', 'export default { nodes: [] };\n');
  zip.file(
    'package.json',
    JSON.stringify({
      name: 'server-signature-fixture',
      version: '1.0.0',
      type: 'module',
    }),
  );

  return zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 },
  });
}

async function createSignedArchive(
  privateKeyPem: string,
): Promise<{ archiveBuffer: Buffer; signature: string; contentHash: string }> {
  const unsignedArchive = await createUnsignedArchive();
  const signature = await signArchive(unsignedArchive, privateKeyPem);
  const contentHash = await computeContentHash(unsignedArchive);
  const archiveBuffer = await updateArchiveManifest(unsignedArchive, {
    ...baseManifest,
    signature,
    contentHash,
    developerKeyFingerprint: 'a'.repeat(64),
  });

  expect(await computeContentHash(archiveBuffer)).toBe(contentHash);

  return { archiveBuffer, signature, contentHash };
}

async function tamperArchive(
  archiveBuffer: Buffer,
  path: string,
  contents: string,
): Promise<Buffer> {
  const archive = await JSZip.loadAsync(archiveBuffer);
  archive.file(path, contents);
  return archive.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 },
  });
}

describe('PluginSignatureService', () => {
  let service: PluginSignatureService;
  let publicKeyPem: string;
  let privateKeyPem: string;

  beforeAll(() => {
    service = new PluginSignatureService();

    const keyPair = createRsaKeyPair(2048);
    publicKeyPem = exportPublicKeyPem(keyPair);
    privateKeyPem = exportPrivateKeyPem(keyPair);
  });

  describe('verifyArchiveSignature', () => {
    it('应验证最终归档中的 canonical 签名', async () => {
      const { archiveBuffer, signature, contentHash } =
        await createSignedArchive(privateKeyPem);

      const result = await service.verifyArchiveSignature(
        archiveBuffer,
        signature,
        publicKeyPem,
        'test-plugin',
      );

      expect(result).toEqual({ valid: true, contentHash });
    });

    it('缺少签名时应抛出 PluginSignatureMissingException', async () => {
      await expect(
        service.verifyArchiveSignature(
          await createUnsignedArchive(),
          undefined,
          publicKeyPem,
          'test-plugin',
        ),
      ).rejects.toThrow(PluginSignatureMissingException);
    });

    it('空字符串签名应视为缺失', async () => {
      await expect(
        service.verifyArchiveSignature(
          await createUnsignedArchive(),
          '',
          publicKeyPem,
          'test-plugin',
        ),
      ).rejects.toThrow(PluginSignatureMissingException);
    });

    it('篡改归档内容时应抛出 PluginSignatureInvalidException', async () => {
      const { archiveBuffer, signature } =
        await createSignedArchive(privateKeyPem);
      const tamperedArchive = await tamperArchive(
        archiveBuffer,
        'dist/index.js',
        'export default { nodes: ["tampered"] };\n',
      );

      await expect(
        service.verifyArchiveSignature(
          tamperedArchive,
          signature,
          publicKeyPem,
          'test-plugin',
        ),
      ).rejects.toThrow(PluginSignatureInvalidException);
    });

    it('使用错误私钥签名时应抛出 PluginSignatureInvalidException', async () => {
      const otherKeyPair = createRsaKeyPair(2048);
      const { archiveBuffer, signature } = await createSignedArchive(
        exportPrivateKeyPem(otherKeyPair),
      );

      await expect(
        service.verifyArchiveSignature(
          archiveBuffer,
          signature,
          publicKeyPem,
          'test-plugin',
        ),
      ).rejects.toThrow(PluginSignatureInvalidException);
    });

    it('垃圾签名应抛出 PluginSignatureInvalidException', async () => {
      await expect(
        service.verifyArchiveSignature(
          await createUnsignedArchive(),
          Buffer.from('not-a-signature').toString('base64'),
          publicKeyPem,
          'test-plugin',
        ),
      ).rejects.toThrow(PluginSignatureInvalidException);
    });

    it('开发者公钥无效时应抛出 PluginDeveloperKeyInvalidException', async () => {
      const ecKeyPair = generateKeyPairSync('ec', {
        namedCurve: 'P-256',
      });
      const ecPublicKeyPem = ecKeyPair.publicKey
        .export({ type: 'spki', format: 'pem' })
        .toString();
      const { archiveBuffer, signature } =
        await createSignedArchive(privateKeyPem);

      await expect(
        service.verifyArchiveSignature(
          archiveBuffer,
          signature,
          ecPublicKeyPem,
          'test-plugin',
        ),
      ).rejects.toThrow(PluginDeveloperKeyInvalidException);
    });
  });

  describe('computeContentHash', () => {
    it('应返回稳定的 canonical SHA-256 十六进制哈希', async () => {
      const archive = await createUnsignedArchive();
      const hash1 = await service.computeContentHash(archive);
      const hash2 = await service.computeContentHash(archive);

      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^[a-f0-9]{64}$/);
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

      expect(() =>
        service.validatePublicKey(exportPublicKeyPem(weakKeyPair)),
      ).toThrow(PluginDeveloperKeyInvalidException);
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
