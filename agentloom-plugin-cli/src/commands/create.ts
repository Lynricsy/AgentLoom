import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import chalk from 'chalk';
import { Command } from 'commander';
import prompts from 'prompts';

export type CreatePromptRunner = (
  questions: Array<Record<string, unknown>>,
  options?: {
    onCancel?: () => void;
  },
) => Promise<CreatePluginAnswers>;

export interface CreatePluginAnswers {
  author: string;
  description: string;
  license: string;
}

export interface CreatePluginOptions extends CreatePluginAnswers {
  name: string;
  targetDir?: string;
}

export interface CreatedPluginProject {
  pluginId: string;
  projectDir: string;
  packageJsonPath: string;
  manifestPath: string;
}

function normalizePluginName(name: string): string {
  const normalizedName = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (normalizedName.length === 0) {
    throw new Error('插件名称不能为空。');
  }

  return normalizedName;
}

function writeJsonFile(filePath: string, value: Record<string, unknown>): void {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function createManifestContent(options: CreatePluginOptions, pluginId: string): Record<string, unknown> {
  return {
    id: pluginId,
    name: options.name,
    version: '0.1.0',
    author: options.author,
    description: options.description,
    license: options.license,
    minPlatformVersion: '0.1.0',
    permissions: [],
    keywords: [normalizePluginName(options.name), 'agentloom', 'plugin'],
  };
}

function createPackageJsonContent(options: CreatePluginOptions): Record<string, unknown> {
  return {
    name: `agentloom-plugin-${normalizePluginName(options.name)}`,
    version: '0.1.0',
    private: true,
    type: 'module',
    main: './dist/index.js',
    types: './dist/index.d.ts',
    scripts: {
      build: 'tsc',
      test: 'vitest run',
      dev: 'agentloom-plugin dev',
    },
    dependencies: {
      '@agentloom/plugin-sdk': 'file:../agentloom-plugin-sdk',
    },
    devDependencies: {
      typescript: '^5.5.0',
      vitest: '^2.0.0',
      '@types/node': '^20.0.0',
    },
  };
}

function createTsconfigContent(): Record<string, unknown> {
  return {
    compilerOptions: {
      target: 'ES2022',
      module: 'NodeNext',
      moduleResolution: 'NodeNext',
      outDir: 'dist',
      rootDir: 'src',
      declaration: true,
      strict: true,
      esModuleInterop: true,
      resolveJsonModule: true,
      skipLibCheck: true,
      types: ['node', 'vitest/globals'],
    },
    include: ['src/**/*.ts'],
  };
}

function createIndexSource(): string {
  return `import type { AgentLoomPlugin } from '@agentloom/plugin-sdk';
import manifest from '../manifest.json' with { type: 'json' };

const plugin: AgentLoomPlugin = {
  manifest: manifest as AgentLoomPlugin['manifest'],
  nodes: [],
  async activate() {
    // 插件激活时可在此注册资源。
  },
  async deactivate() {
    // 插件卸载时可在此清理资源。
  },
};

export default plugin;
`;
}

function createTestSource(): string {
  return `import { describe, expect, it } from 'vitest';

import plugin from '../src/index';

describe('plugin scaffold', () => {
  it('exports an empty node list', () => {
    expect(plugin.nodes).toHaveLength(0);
  });
});
`;
}

export function createPluginProject(options: CreatePluginOptions): CreatedPluginProject {
  const normalizedName = normalizePluginName(options.name);
  const projectRoot = resolve(options.targetDir ?? process.cwd(), normalizedName);

  if (existsSync(projectRoot)) {
    throw new Error(`目标目录已存在：${projectRoot}`);
  }

  const pluginId = `com.agentloom.${normalizedName}`;
  const srcDir = join(projectRoot, 'src');
  const testDir = join(projectRoot, 'tests');
  const manifestPath = join(projectRoot, 'manifest.json');
  const packageJsonPath = join(projectRoot, 'package.json');

  mkdirSync(srcDir, { recursive: true });
  mkdirSync(testDir, { recursive: true });

  writeJsonFile(manifestPath, createManifestContent(options, pluginId));
  writeJsonFile(packageJsonPath, createPackageJsonContent(options));
  writeJsonFile(join(projectRoot, 'tsconfig.json'), createTsconfigContent());
  writeFileSync(join(srcDir, 'index.ts'), createIndexSource(), 'utf8');
  writeFileSync(join(testDir, 'index.test.ts'), createTestSource(), 'utf8');

  return {
    pluginId,
    projectDir: projectRoot,
    packageJsonPath,
    manifestPath,
  };
}

export async function runCreateCommand(
  name: string,
  cwd = process.cwd(),
  promptRunner: CreatePromptRunner = prompts as unknown as CreatePromptRunner,
): Promise<CreatedPluginProject> {
  const answers = await promptRunner(
    [
      {
        type: 'text',
        name: 'author',
        message: '作者名称',
        validate: (value: string) => (value.trim().length > 0 ? true : '作者不能为空'),
      },
      {
        type: 'text',
        name: 'description',
        message: '插件描述',
        validate: (value: string) => (value.trim().length > 0 ? true : '描述不能为空'),
      },
      {
        type: 'text',
        name: 'license',
        message: '许可证',
        initial: 'MIT',
        validate: (value: string) => (value.trim().length > 0 ? true : '许可证不能为空'),
      },
    ],
    {
      onCancel: () => {
        throw new Error('已取消插件创建。');
      },
    },
  );

  const result = createPluginProject({
    name,
    author: answers.author,
    description: answers.description,
    license: answers.license,
    targetDir: cwd,
  });

  console.info(chalk.green(`✨ 插件脚手架已创建：${result.projectDir}`));
  console.info(chalk.cyan(`下一步：cd ${normalizePluginName(name)} && pnpm install && pnpm dev`));

  return result;
}

export const createCommand = new Command('create')
  .description('创建新的 AgentLoom 插件项目')
  .argument('<name>', 'Plugin name')
  .action(async (name: string) => {
    await runCreateCommand(name);
  });
