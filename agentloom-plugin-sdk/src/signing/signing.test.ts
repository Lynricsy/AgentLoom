import { generateKeyPairSync } from 'node:crypto';

import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';

import {
  computeKeyFingerprint,
  readArchiveManifest,
  updateArchiveManifest,
} from './archive';
import { computeContentHash, signArchive } from './sign';
import { verifyArchiveSignature } from './verify';

const baseManifest = {
  id: 'com.agentloom.signing-fixture',
  name: 'Signing Fixture',
  version: '1.0.0',
  author: 'AgentLoom',
  description: 'Signing test fixture',
  license: 'MIT',
  minPlatformVersion: '1.0.0',
  permissions: ['network:outbound'],
};

async function createArchive(
  order: Array<{ path: string; contents: string | Buffer }>,
): Promise<Buffer> {
  const zip = new JSZip();

  for (const entry of order) {
    zip.file(entry.path, entry.contents);
  }

  return zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 },
  });
}

async function createUnsignedArchive(): Promise<Buffer> {
  return createArchive([
    {
      path: 'manifest.json',
      contents: `${JSON.stringify(baseManifest, null, 2)}\n`,
    },
    {
      path: 'dist/index.js',
      contents: 'export default { nodes: [] };\n',
    },
    {
      path: 'package.json',
      contents: JSON.stringify({
        name: 'signing-fixture',
        version: '1.0.0',
        type: 'module',
      }),
    },
  ]);
}

async function createSignedArchive(
  privateKeyPem: string,
  publicKeyPem: string,
): Promise<{
  archiveBuffer: Buffer;
  signature: string;
  contentHash: string;
  developerKeyFingerprint: string;
}> {
  const unsignedArchive = await createUnsignedArchive();
  const signature = await signArchive(unsignedArchive, privateKeyPem);
  const contentHash = await computeContentHash(unsignedArchive);
  const developerKeyFingerprint = computeKeyFingerprint(publicKeyPem);

  const archiveBuffer = await updateArchiveManifest(unsignedArchive, {
    ...baseManifest,
    signature,
    contentHash,
    developerKeyFingerprint,
  });

  return {
    archiveBuffer,
    signature,
    contentHash,
    developerKeyFingerprint,
  };
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

describe('signing utilities', () => {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  describe('computeContentHash', () => {
    it('应该返回 SHA-256 hex 字符串', async () => {
      const hash = await computeContentHash(await createUnsignedArchive());
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('相同逻辑内容但不同 zip 顺序时应得到相同哈希', async () => {
      const packageJson = JSON.stringify({ name: 'a', version: '1.0.0' });
      const archiveA = await createArchive([
        {
          path: 'manifest.json',
          contents: `${JSON.stringify(baseManifest, null, 2)}\n`,
        },
        { path: 'dist/index.js', contents: 'export default { nodes: [] };\n' },
        { path: 'package.json', contents: packageJson },
      ]);
      const archiveB = await createArchive([
        { path: 'package.json', contents: packageJson },
        { path: 'dist/index.js', contents: 'export default { nodes: [] };\n' },
        {
          path: 'manifest.json',
          contents: JSON.stringify({ ...baseManifest, description: 'Signing test fixture' }),
        },
      ]);

      expect(await computeContentHash(archiveA)).toBe(await computeContentHash(archiveB));
    });

    it('签名元数据嵌入后 canonical 哈希应保持不变', async () => {
      const unsignedArchive = await createUnsignedArchive();
      const contentHash = await computeContentHash(unsignedArchive);
      const signature = await signArchive(unsignedArchive, privateKey as string);
      const signedArchive = await updateArchiveManifest(unsignedArchive, {
        ...baseManifest,
        signature,
        contentHash,
        developerKeyFingerprint: computeKeyFingerprint(publicKey as string),
      });

      expect(await computeContentHash(signedArchive)).toBe(contentHash);
    });
  });

  describe('signArchive / verifyArchiveSignature', () => {
    it('最终归档中的签名元数据应可被验证', async () => {
      const { archiveBuffer, signature, contentHash, developerKeyFingerprint } =
        await createSignedArchive(privateKey as string, publicKey as string);

      expect(await verifyArchiveSignature(archiveBuffer, signature, publicKey as string)).toBe(
        true,
      );

      const manifest = await readArchiveManifest<Record<string, unknown>>(archiveBuffer);
      expect(manifest.signature).toBe(signature);
      expect(manifest.contentHash).toBe(contentHash);
      expect(manifest.developerKeyFingerprint).toBe(developerKeyFingerprint);
    });

    it('篡改 dist 内容后应验证失败', async () => {
      const { archiveBuffer, signature } = await createSignedArchive(
        privateKey as string,
        publicKey as string,
      );
      const tamperedArchive = await tamperArchive(
        archiveBuffer,
        'dist/index.js',
        'export default { nodes: ["tampered"] };\n',
      );

      expect(
        await verifyArchiveSignature(tamperedArchive, signature, publicKey as string),
      ).toBe(false);
    });

    it('使用其他密钥对的签名应返回 false', async () => {
      const otherKeys = generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      });
      const unsignedArchive = await createUnsignedArchive();
      const signature = await signArchive(unsignedArchive, otherKeys.privateKey as string);

      expect(
        await verifyArchiveSignature(unsignedArchive, signature, publicKey as string),
      ).toBe(false);
    });

    it('无效公钥应返回 false', async () => {
      const unsignedArchive = await createUnsignedArchive();
      const signature = await signArchive(unsignedArchive, privateKey as string);

      expect(await verifyArchiveSignature(unsignedArchive, signature, 'not-a-key')).toBe(false);
    });
  });
});
