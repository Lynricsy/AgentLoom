import { generateKeyPairSync } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import chalk from 'chalk';
import { Command } from 'commander';

export interface GenerateKeysOptions {
  outputDir?: string;
}

export interface GeneratedKeyPair {
  publicKeyPath: string;
  privateKeyPath: string;
}

export function generateKeyPair(options: GenerateKeysOptions = {}): GeneratedKeyPair {
  const outputDir = resolve(options.outputDir ?? process.cwd(), '.agentloom-keys');
  mkdirSync(outputDir, { recursive: true });

  const publicKeyPath = resolve(outputDir, 'public.pem');
  const privateKeyPath = resolve(outputDir, 'private.pem');

  if (existsSync(privateKeyPath)) {
    throw new Error(`密钥已存在: ${privateKeyPath}。如需重新生成，请先删除已有密钥。`);
  }

  const { publicKey, privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  writeFileSync(publicKeyPath, publicKey, { mode: 0o644 });
  writeFileSync(privateKeyPath, privateKey, { mode: 0o600 });

  return { publicKeyPath, privateKeyPath };
}

const generateCommand = new Command('generate')
  .description('生成 RSA-2048 签名密钥对')
  .option('-o, --output <dir>', '密钥输出目录 (默认当前目录)')
  .action((options: { output?: string }) => {
    const result = generateKeyPair({ outputDir: options.output });
    console.info(chalk.green('🔑 签名密钥对已生成'));
    console.info(`公钥: ${result.publicKeyPath}`);
    console.info(`私钥: ${result.privateKeyPath}`);
    console.info(chalk.yellow('⚠️  请妥善保管私钥，不要提交到版本控制。'));
  });

export const keysCommand = new Command('keys')
  .description('管理插件签名密钥')
  .addCommand(generateCommand);
