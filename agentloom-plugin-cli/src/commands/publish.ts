import { createPublicKey } from 'node:crypto';
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
  const keyPath = resolve(options.key);
  const outputDir = resolve(cwd, options.outputDir ?? 'build');
  const manifest = loadManifest(cwd);
  const archivePath = resolve(
    outputDir,
    `${manifest.id}-${manifest.version}.alp`,
  );

  if (!existsSync(archivePath)) {
    throw new Error(
      '未找到已构建的 .alp 归档。请先执行 `agentloom-plugin build`（WASM 插件请使用 `agentloom-plugin build --wasm`）。',
    );
  }

  const privateKeyPem = readFileSync(keyPath, 'utf8');
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

export const publishCommand = new Command('publish')
  .description('签名插件包，生成可注册的 .alp（上传经 Studio 插件管理页）')
  .option('-k, --key <path>', '签名私钥路径')
  .option('-o, --output <dir>', 'Output directory', 'build')
  .action(async (options: { key?: string; output: string }) => {
    if (!options.key) {
      console.info(
        chalk.yellow('请使用 --key 参数指定签名私钥路径。\n') +
          '使用 `agentloom-plugin keys generate` 生成密钥对。',
      );
      process.exitCode = 1;
      return;
    }

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
