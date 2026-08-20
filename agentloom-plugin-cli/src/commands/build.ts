import * as childProcess from 'node:child_process';
import {
  copyFileSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
} from 'node:fs';
import { delimiter, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import archiver from 'archiver';
import chalk from 'chalk';
import { Command } from 'commander';
import type { PluginManifest } from '@agentloom/plugin-sdk';

import { loadManifest } from '../utils/manifest';
import { loadPlugin, serializeNodes } from '../utils/plugin';

export interface BuildPluginOptions {
  cwd?: string;
  outputDir?: string;
  wasm?: boolean;
}

export interface BuildPluginResult {
  archivePath: string;
  manifest: PluginManifest;
  nodeCount: number;
  sizeBytes: number;
}

function getCliBinPath(): string {
  return resolve(fileURLToPath(new URL('../..', import.meta.url)), 'node_modules/.bin');
}

async function createArchive(
  cwd: string,
  outputPath: string,
  manifest: PluginManifest,
  nodeDefinitions: Array<Record<string, unknown>>,
): Promise<void> {
  await new Promise<void>((resolveArchive, rejectArchive) => {
    const output = createWriteStream(outputPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', () => resolveArchive());
    output.on('error', rejectArchive);
    archive.on('error', rejectArchive);

    archive.pipe(output);
    archive.append(`${JSON.stringify(manifest, null, 2)}\n`, { name: 'manifest.json' });
    if (nodeDefinitions.length > 0) {
      archive.append(`${JSON.stringify(nodeDefinitions, null, 2)}\n`, {
        name: 'node-definitions.json',
      });
    }
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

  if (options.wasm) {
    buildWasmBundle(cwd);
  } else {
    buildTypeScriptBundle(cwd);
  }

  const distDir = resolve(cwd, 'dist');
  if (!existsSync(distDir)) {
    throw new Error('构建失败：未生成 dist/ 目录。');
  }

  mkdirSync(outputDir, { recursive: true });

  const nodeDefinitions = options.wasm
    ? []
    : serializeNodes((await loadPlugin(cwd)).nodes);

  const resultManifest: PluginManifest = options.wasm
    ? { ...manifest, wasmEntry: 'dist/plugin.wasm' }
    : manifest;

  const archivePath = resolve(outputDir, `${manifest.id}-${manifest.version}.alp`);
  await createArchive(cwd, archivePath, resultManifest, nodeDefinitions);

  const sizeBytes = statSync(archivePath).size;

  return {
    archivePath,
    manifest: resultManifest,
    nodeCount: nodeDefinitions.length,
    sizeBytes,
  };
}

function buildTypeScriptBundle(cwd: string): void {
  childProcess.execSync('npx tsc', {
    cwd,
    env: buildCommandEnv(),
    stdio: 'pipe',
  });
}

function buildWasmBundle(cwd: string): void {
  if (!existsSync(resolve(cwd, 'Cargo.toml'))) {
    throw new Error('未找到 Cargo.toml。使用 --wasm 构建前，请确保当前插件项目是 Rust WASM 项目。');
  }

  childProcess.execSync('npx wasm-pack build --target bundler --release', {
    cwd,
    env: buildCommandEnv(),
    stdio: 'pipe',
  });

  const pkgDir = resolve(cwd, 'pkg');
  if (!existsSync(pkgDir)) {
    throw new Error('WASM 构建失败：未生成 pkg/ 目录。');
  }

  const wasmFileName = readdirSync(pkgDir).find((entry) => entry.endsWith('.wasm'));
  if (!wasmFileName) {
    throw new Error('WASM 构建失败：pkg/ 目录中未找到 .wasm 文件。');
  }

  const distDir = resolve(cwd, 'dist');
  rmSync(distDir, { recursive: true, force: true });
  mkdirSync(distDir, { recursive: true });
  copyFileSync(resolve(pkgDir, wasmFileName), resolve(distDir, 'plugin.wasm'));
}

function buildCommandEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    PATH: [getCliBinPath(), process.env.PATH ?? ''].filter(Boolean).join(delimiter),
  };
}

export const buildCommand = new Command('build')
  .description('构建 AgentLoom 插件归档')
  .option('-o, --output <dir>', 'Output directory', 'build')
  .option('--wasm', '使用 wasm-pack 构建 WASM 产物')
  .action(async (options: { output: string; wasm?: boolean }) => {
    const result = await buildPluginArchive({ outputDir: options.output, wasm: options.wasm });

    console.info(chalk.green('📦 插件构建完成'));
    console.info(`文件: ${result.archivePath}`);
    console.info(`大小: ${result.sizeBytes} bytes`);
    console.info(`版本: ${result.manifest.version}`);
    console.info(`节点数: ${result.nodeCount}`);
  });
