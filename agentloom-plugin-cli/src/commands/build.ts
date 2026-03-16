import { execSync } from 'node:child_process';
import { createWriteStream, existsSync, mkdirSync, statSync } from 'node:fs';
import { delimiter, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import archiver from 'archiver';
import chalk from 'chalk';
import { Command } from 'commander';

import { loadManifest, type BasicPluginManifest } from '../utils/manifest';
import { loadPlugin } from '../utils/plugin';

export interface BuildPluginOptions {
  cwd?: string;
  outputDir?: string;
}

export interface BuildPluginResult {
  archivePath: string;
  manifest: BasicPluginManifest;
  nodeCount: number;
  sizeBytes: number;
}

function getCliBinPath(): string {
  return resolve(fileURLToPath(new URL('../..', import.meta.url)), 'node_modules/.bin');
}

async function createArchive(
  cwd: string,
  outputPath: string,
): Promise<void> {
  await new Promise<void>((resolveArchive, rejectArchive) => {
    const output = createWriteStream(outputPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', () => resolveArchive());
    output.on('error', rejectArchive);
    archive.on('error', rejectArchive);

    archive.pipe(output);
    archive.file(resolve(cwd, 'manifest.json'), { name: 'manifest.json' });
    archive.directory(resolve(cwd, 'dist'), 'dist');
    archive.file(resolve(cwd, 'package.json'), { name: 'package.json' });

    const readmePath = resolve(cwd, 'README.md');
    if (existsSync(readmePath)) {
      archive.file(readmePath, { name: 'README.md' });
    }

    void archive.finalize();
  });
}

export async function buildPluginArchive(
  options: BuildPluginOptions = {},
): Promise<BuildPluginResult> {
  const cwd = resolve(options.cwd ?? process.cwd());
  const outputDir = resolve(cwd, options.outputDir ?? 'build');
  const manifest = loadManifest(cwd);

  execSync('npx tsc', {
    cwd,
    env: {
      ...process.env,
      PATH: [getCliBinPath(), process.env.PATH ?? ''].filter(Boolean).join(delimiter),
    },
    stdio: 'pipe',
  });

  const distDir = resolve(cwd, 'dist');
  if (!existsSync(distDir)) {
    throw new Error('构建失败：未生成 dist/ 目录。');
  }

  mkdirSync(outputDir, { recursive: true });

  const archivePath = resolve(outputDir, `${manifest.id}-${manifest.version}.alp`);
  await createArchive(cwd, archivePath);

  const sizeBytes = statSync(archivePath).size;

  let nodeCount = 0;
  try {
    nodeCount = (await loadPlugin(cwd)).nodes.length;
  } catch {
    nodeCount = 0;
  }

  return {
    archivePath,
    manifest,
    nodeCount,
    sizeBytes,
  };
}

export const buildCommand = new Command('build')
  .description('构建 AgentLoom 插件归档')
  .option('-o, --output <dir>', 'Output directory', 'build')
  .action(async (options: { output: string }) => {
    const result = await buildPluginArchive({ outputDir: options.output });

    console.info(chalk.green('📦 插件构建完成'));
    console.info(`文件: ${result.archivePath}`);
    console.info(`大小: ${result.sizeBytes} bytes`);
    console.info(`版本: ${result.manifest.version}`);
    console.info(`节点数: ${result.nodeCount}`);
  });
