import * as childProcess from 'node:child_process';
import {
  copyFileSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
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
import {
  loadPlugin,
  serializeNodes,
  validateNodeDefinitions,
} from '../utils/plugin';

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
  return resolve(
    fileURLToPath(new URL('../..', import.meta.url)),
    'node_modules/.bin',
  );
}

const PORT_DATA_TYPES =
  'model、text、json、array、image、audio、tool、sandbox、knowledge、skill、agent、memory、exec、volume';

function loadWasmNodeDefinitions(cwd: string): Array<Record<string, unknown>> {
  const filePath = resolve(cwd, 'node-definitions.json');
  const guidance =
    `请在插件根目录 ${filePath} 创建非空 JSON 数组；` +
    '最小节点结构为 [{"type":"example.echo","label":"示例节点","category":"utility",' +
    '"description":"示例描述","inputPorts":[],"outputPorts":[]}]。' +
    `端口 dataType 必须取自 14 值 PortDataType：${PORT_DATA_TYPES}。`;

  if (!existsSync(filePath)) {
    throw new Error(`WASM 构建缺少 node-definitions.json。${guidance}`);
  }

  let candidates: unknown;
  try {
    candidates = JSON.parse(readFileSync(filePath, 'utf8')) as unknown;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `node-definitions.json 不是有效 JSON：${message}。${guidance}`,
    );
  }

  const nodeDefinitions = validateNodeDefinitions(candidates);
  if (nodeDefinitions.length === 0) {
    throw new Error(
      `WASM 构建要求 node-definitions.json 至少包含一个节点。${guidance}`,
    );
  }

  return nodeDefinitions;
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
    archive.append(`${JSON.stringify(manifest, null, 2)}\n`, {
      name: 'manifest.json',
    });
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

  if (options.wasm && !existsSync(resolve(cwd, 'Cargo.toml'))) {
    throw new Error(
      '未找到 Cargo.toml。使用 --wasm 构建前，请确保当前插件项目是 Rust WASM 项目。',
    );
  }
  const wasmNodeDefinitions = options.wasm
    ? loadWasmNodeDefinitions(cwd)
    : undefined;
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

  const nodeDefinitions =
    wasmNodeDefinitions ?? serializeNodes((await loadPlugin(cwd)).nodes);

  const resultManifest: PluginManifest = options.wasm
    ? { ...manifest, wasmEntry: 'dist/plugin.wasm' }
    : manifest;

  const archivePath = resolve(
    outputDir,
    `${manifest.id}-${manifest.version}.alp`,
  );
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

const WASM_TARGET = 'wasm32-unknown-unknown';

/**
 * scaffold 产出的是 Extism raw cdylib（crate-type=["cdylib"] + #[plugin_fn] 展开成
 * #[no_mangle] extern "C"），而 wasm-pack 要求 wasm-bindgen 依赖并额外产出 JS glue，
 * 两者本质不兼容——这才是 `build --wasm` 一直失败的根因，不是模板代码有误。
 * 因此直接用 cargo 交叉编译到 wasm32，产物布局仍保持 dist/plugin.wasm 不变
 * （publish 的归档签名依赖该布局）。
 */
function buildWasmBundle(cwd: string): void {
  const prebuiltWasmPath = resolve(cwd, 'dist', 'plugin.wasm');
  if (existsSync(prebuiltWasmPath)) {
    return;
  }

  const crateName = readCrateName(cwd);

  childProcess.execSync(`cargo build --target ${WASM_TARGET} --release`, {
    cwd,
    env: buildCommandEnv(),
    stdio: 'pipe',
  });

  // cargo 把 crate 名里的连字符换成下划线作为产物文件名。
  const artifactPath = resolve(
    cwd,
    'target',
    WASM_TARGET,
    'release',
    `${crateName.replace(/-/g, '_')}.wasm`,
  );
  if (!existsSync(artifactPath)) {
    throw new Error(
      `WASM 构建失败：未在 target/${WASM_TARGET}/release/ 找到 ${crateName.replace(/-/g, '_')}.wasm。`,
    );
  }

  const distDir = resolve(cwd, 'dist');
  rmSync(distDir, { recursive: true, force: true });
  mkdirSync(distDir, { recursive: true });
  copyFileSync(artifactPath, resolve(distDir, 'plugin.wasm'));
}

function readCrateName(cwd: string): string {
  const cargoTomlPath = resolve(cwd, 'Cargo.toml');
  if (!existsSync(cargoTomlPath)) {
    throw new Error('WASM 构建失败：未找到 Cargo.toml。');
  }

  // 只取 [package] 段的 name，避免误匹配 [dependencies] 里的同名键。
  const cargoToml = readFileSync(cargoTomlPath, 'utf8');
  const packageSection = cargoToml.split(/^\s*\[/m).find((section) =>
    section.startsWith('package]'),
  );
  const crateName = packageSection?.match(
    /^\s*name\s*=\s*"([^"]+)"/m,
  )?.[1];

  if (!crateName) {
    throw new Error('WASM 构建失败：Cargo.toml 的 [package] 段缺少 name。');
  }

  return crateName;
}

function buildCommandEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    PATH: [getCliBinPath(), process.env.PATH ?? '']
      .filter(Boolean)
      .join(delimiter),
  };
}

export const buildCommand = new Command('build')
  .description('构建 AgentLoom 插件归档')
  .option('-o, --output <dir>', 'Output directory', 'build')
  .option('--wasm', '使用 cargo 交叉编译到 wasm32-unknown-unknown 构建 WASM 产物')
  .action(async (options: { output: string; wasm?: boolean }) => {
    const result = await buildPluginArchive({
      outputDir: options.output,
      wasm: options.wasm,
    });

    console.info(chalk.green('📦 插件构建完成'));
    console.info(`文件: ${result.archivePath}`);
    console.info(`大小: ${result.sizeBytes} bytes`);
    console.info(`版本: ${result.manifest.version}`);
    console.info(`节点数: ${result.nodeCount}`);
    if (!options.wasm) {
      console.warn(
        chalk.yellow(
          'TS 产物仅供 `agentloom-plugin dev` 本地预览，服务端注册要求 WASM（使用 --wasm）。',
        ),
      );
    }
  });
