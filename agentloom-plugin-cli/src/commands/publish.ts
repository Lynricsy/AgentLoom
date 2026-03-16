import { createPublicKey, createHash } from 'node:crypto';
import { createWriteStream, existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import archiver from 'archiver';
import chalk from 'chalk';
import { Command } from 'commander';
import {
  computeContentHash,
  signArchive,
  type PluginManifest,
} from '@agentloom/plugin-sdk';

import { buildPluginArchive } from './build';

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

function computeKeyFingerprint(publicKeyPem: string): string {
  const keyObject = createPublicKey(publicKeyPem);
  const der = keyObject.export({ type: 'spki', format: 'der' });
  return createHash('sha256').update(der).digest('hex');
}

async function writeArchiveWithManifest(
  cwd: string,
  archivePath: string,
  manifest: PluginManifest,
): Promise<void> {
  await new Promise<void>((resolveArchive, rejectArchive) => {
    const output = createWriteStream(archivePath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', () => resolveArchive());
    output.on('error', rejectArchive);
    archive.on('error', rejectArchive);

    archive.pipe(output);
    archive.append(`${JSON.stringify(manifest, null, 2)}\n`, { name: 'manifest.json' });
    archive.directory(resolve(cwd, 'dist'), 'dist');
    archive.file(resolve(cwd, 'package.json'), { name: 'package.json' });

    const readmePath = resolve(cwd, 'README.md');
    if (existsSync(readmePath)) {
      archive.file(readmePath, { name: 'README.md' });
    }

    void archive.finalize();
  });
}

export async function publishPlugin(
  options: PublishPluginOptions,
): Promise<PublishPluginResult> {
  if (!options.key) {
    throw new Error('必须提供私钥路径 (--key)。使用 `agentloom-plugin keys generate` 生成密钥对。');
  }

  const cwd = resolve(options.cwd ?? process.cwd());
  const keyPath = resolve(options.key);
  const privateKeyPem = readFileSync(keyPath, 'utf8');

  const buildResult = await buildPluginArchive({
    cwd,
    outputDir: options.outputDir,
  });

  const archiveBuffer = readFileSync(buildResult.archivePath);
  const signatureForManifest = signArchive(archiveBuffer, privateKeyPem);
  const contentHashForManifest = computeContentHash(archiveBuffer);

  const publicKey = createPublicKey(privateKeyPem);
  const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }) as string;
  const developerKeyFingerprint = computeKeyFingerprint(publicKeyPem);

  await writeArchiveWithManifest(cwd, buildResult.archivePath, {
    ...buildResult.manifest,
    signature: signatureForManifest,
    contentHash: contentHashForManifest,
    developerKeyFingerprint,
  });

  const signedArchiveBuffer = readFileSync(buildResult.archivePath);
  const signature = signArchive(signedArchiveBuffer, privateKeyPem);
  const contentHash = computeContentHash(signedArchiveBuffer);

  return {
    archivePath: buildResult.archivePath,
    signature,
    contentHash,
    developerKeyFingerprint,
  };
}

export const publishCommand = new Command('publish')
  .description('签名并发布插件到 AgentLoom Marketplace')
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
    console.info(chalk.yellow('\n📋 V1: 请通过 Web 界面上传已签名的 .alp 文件'));
  });
