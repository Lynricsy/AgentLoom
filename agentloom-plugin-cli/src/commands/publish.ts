import { createPrivateKey, createPublicKey } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import chalk from 'chalk';
import { Command } from 'commander';
import {
  computeContentHash,
  computeKeyFingerprint,
  readArchiveManifest,
  signArchive,
  updateArchiveManifest,
  verifyArchiveSignature,
} from '@agentloom/plugin-sdk';

import { loadManifest } from '../utils/manifest';

export interface PublishPluginOptions {
  key?: string;
  cwd?: string;
  outputDir?: string;
}

export interface PublishPluginResult {
  archivePath: string;
  signature: string;
  contentHash: string;
  developerKeyFingerprint: string;
}

export async function publishPlugin(
  options: PublishPluginOptions,
): Promise<PublishPluginResult> {
  if (!options.key) {
    throw new Error(
      '必须提供私钥路径 (--key)。使用 `agentloom-plugin keys generate` 生成密钥对。',
    );
  }

  const cwd = resolve(options.cwd ?? process.cwd());
  // 先校验 -k 参数本身，再去找归档：密钥传错是最常见的误用，无需先 build 才能发现。
  const privateKeyPem = readPrivateKeyPem(resolve(options.key));
  const outputDir = resolve(cwd, options.outputDir ?? 'build');
  const manifest = loadManifest(cwd);
  const archivePath = resolve(
    outputDir,
    `${manifest.id}-${manifest.version}.alp`,
  );

  if (!existsSync(archivePath)) {
    throw new Error(
      `未找到已构建的 .alp 归档：${archivePath}。请先执行 \`agentloom-plugin build\`（WASM 插件请使用 \`agentloom-plugin build --wasm\`）。`,
    );
  }

  const archiveBuffer = readFileSync(archivePath);
  const archiveManifest =
    await readArchiveManifest<Record<string, unknown>>(archiveBuffer);
  const signature = await signArchive(archiveBuffer, privateKeyPem);
  const contentHash = await computeContentHash(archiveBuffer);

  const publicKey = createPublicKey(privateKeyPem);
  const publicKeyPem = publicKey.export({
    type: 'spki',
    format: 'pem',
  }) as string;
  const developerKeyFingerprint = computeKeyFingerprint(publicKeyPem);

  const signedArchiveBuffer = await updateArchiveManifest(archiveBuffer, {
    ...archiveManifest,
    signature,
    contentHash,
    developerKeyFingerprint,
  });

  const valid = await verifyArchiveSignature(
    signedArchiveBuffer,
    signature,
    publicKeyPem,
  );
  const finalContentHash = await computeContentHash(signedArchiveBuffer);

  if (!valid || finalContentHash !== contentHash) {
    throw new Error(
      '签名后的归档自验证失败。请检查签名元数据与归档内容是否一致。',
    );
  }

  writeFileSync(archivePath, signedArchiveBuffer);

  return {
    archivePath,
    signature,
    contentHash,
    developerKeyFingerprint,
  };
}

const PRIVATE_KEY_HINT =
  '签名需要 `agentloom-plugin keys generate` 生成的 PKCS#8 RSA 私钥（默认 keys/private.pem）';

/**
 * 读取并预检签名私钥，把 ENOENT 与 OpenSSL 的 `DECODER routines::unsupported`
 * 翻译成可行动的提示；最常见的误用是把 public.pem 传给 -k。
 */
function readPrivateKeyPem(keyPath: string): string {
  if (!existsSync(keyPath)) {
    throw new Error(`未找到私钥文件：${keyPath}。${PRIVATE_KEY_HINT}。`);
  }

  const pem = readFileSync(keyPath, 'utf8');
  if (pem.includes('PUBLIC KEY-----')) {
    throw new Error(
      `${keyPath} 是公钥。${PRIVATE_KEY_HINT}；公钥 public.pem 用于在 Studio「开发者密钥」中登记。`,
    );
  }

  let keyType: string | undefined;
  try {
    keyType = createPrivateKey(pem).asymmetricKeyType;
  } catch {
    throw new Error(`无法解析私钥 ${keyPath}。${PRIVATE_KEY_HINT}。`);
  }
  if (keyType !== 'rsa') {
    throw new Error(
      `私钥 ${keyPath} 的类型是 ${keyType ?? '未知'}，不是 RSA。${PRIVATE_KEY_HINT}。`,
    );
  }

  return pem;
}

export const publishCommand = new Command('publish')
  .description('签名插件包，生成可注册的 .alp（上传经 Studio 插件管理页）')
  .option('-k, --key <path>', '签名私钥路径')
  .option('-o, --output <dir>', 'Output directory', 'build')
  .action(async (options: { key?: string; output: string }) => {
    const result = await publishPlugin({
      key: options.key,
      outputDir: options.output,
    });

    console.info(chalk.green('✅ 插件签名完成'));
    console.info(`归档: ${result.archivePath}`);
    console.info(`签名: ${result.signature.slice(0, 32)}...`);
    console.info(`内容哈希: ${result.contentHash}`);
    console.info(`密钥指纹: ${result.developerKeyFingerprint}`);
    console.info(
      chalk.yellow('\n请通过 Studio 插件管理页上传已签名的 .alp 文件'),
    );
  });
