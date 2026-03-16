import { generateKeyPairSync } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import chalk from 'chalk';
import { Command } from 'commander';
import { computeKeyFingerprint } from '@agentloom/plugin-sdk';

const SUPPORTED_KEY_BITS = [2048, 3072, 4096] as const;

type SupportedKeyBits = (typeof SUPPORTED_KEY_BITS)[number];

export interface GenerateKeysOptions {
  outputDir?: string;
  bits?: SupportedKeyBits;
}

export interface GeneratedKeyPair {
  publicKeyPath: string;
  privateKeyPath: string;
  fingerprint: string;
}

export function generateKeyPair(options: GenerateKeysOptions = {}): GeneratedKeyPair {
  const outputDir = options.outputDir
    ? resolve(options.outputDir)
    : resolve(process.cwd(), 'keys');
  const bits = normalizeKeyBits(options.bits);
  mkdirSync(outputDir, { recursive: true });

  const publicKeyPath = resolve(outputDir, 'public.pem');
  const privateKeyPath = resolve(outputDir, 'private.pem');

  if (existsSync(privateKeyPath)) {
    throw new Error(`密钥已存在: ${privateKeyPath}。如需重新生成，请先删除已有密钥。`);
  }

  const { publicKey, privateKey } = generateKeyPairSync('rsa', {
    modulusLength: bits,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  writeFileSync(publicKeyPath, publicKey, { mode: 0o644 });
  writeFileSync(privateKeyPath, privateKey, { mode: 0o600 });

  return {
    publicKeyPath,
    privateKeyPath,
    fingerprint: computeKeyFingerprint(publicKey),
  };
}

function normalizeKeyBits(bits: SupportedKeyBits | undefined): SupportedKeyBits {
  if (bits === undefined) {
    return 2048;
  }

  if ((SUPPORTED_KEY_BITS as readonly number[]).includes(bits)) {
    return bits;
  }

  throw new Error(`不支持的 RSA 密钥位数: ${bits}。仅支持 2048 / 3072 / 4096。`);
}

const generateCommand = new Command('generate')
  .description('生成 RSA 签名密钥对')
  .option('-o, --output <dir>', '密钥输出目录 (默认 ./keys)')
  .option('-b, --bits <bits>', 'RSA 密钥位数 (2048|3072|4096)', (value) => Number.parseInt(value, 10) as SupportedKeyBits)
  .action((options: { output?: string; bits?: SupportedKeyBits }) => {
    const result = generateKeyPair({ outputDir: options.output, bits: options.bits });
    console.info(chalk.green('🔑 签名密钥对已生成'));
    console.info(`公钥: ${result.publicKeyPath}`);
    console.info(`私钥: ${result.privateKeyPath}`);
    console.info(`指纹: ${result.fingerprint}`);
    console.info(chalk.cyan('📋 请将 public.pem 的内容注册到 AgentLoom 平台。'));
    console.info(chalk.yellow('⚠️  请妥善保管私钥，不要提交到版本控制。'));
  });

export const keysCommand = new Command('keys')
  .description('管理插件签名密钥')
  .addCommand(generateCommand);
