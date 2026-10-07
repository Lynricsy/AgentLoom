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
  wasm?: boolean;
  /** 生成 dsh runtime 插件（Cordis 插件包）脚手架。 */
  runtime?: boolean;
}

/** runtime 插件模板锁定的 `@deepseek-ai/dsh` 版本，需与平台支持版本一致。 */
const RUNTIME_PLUGIN_DSH_VERSION = '0.2.0-rc.2';

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

function writeJsonFile(filePath: string, value: unknown): void {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function createManifestContent(
  options: CreatePluginOptions,
  pluginId: string,
): Record<string, unknown> {
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
    ...(options.wasm ? { wasmEntry: 'dist/plugin.wasm' } : {}),
    ...(options.runtime
      ? {
          kind: 'runtime',
          runtime: {
            dshVersion: RUNTIME_PLUGIN_DSH_VERSION,
            patch: './cordis.patch.yml',
            entry: './dist/index.js',
          },
        }
      : {}),
  };
}

function createPackageJsonContent(
  options: CreatePluginOptions,
): Record<string, unknown> {
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

function createWasmPackageJsonContent(
  options: CreatePluginOptions,
): Record<string, unknown> {
  return {
    name: `agentloom-plugin-${normalizePluginName(options.name)}`,
    version: '0.1.0',
    private: true,
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

function createCargoToml(options: CreatePluginOptions): string {
  return `[package]
name = "${normalizePluginName(options.name)}"
version = "0.1.0"
edition = "2024"

[lib]
crate-type = ["cdylib"]

[dependencies]
extism-pdk = "1"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
`;
}

function createWasmSource(): string {
  return `use extism_pdk::{plugin_fn, Error, FnResult};
use serde::Deserialize;
use serde_json::{json, Value};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExecuteEnvelope {
    node_type: String,
    inputs: Value,
    config: Value,
}

#[plugin_fn]
pub fn execute(input: String) -> FnResult<String> {
    let envelope: ExecuteEnvelope = serde_json::from_str(&input)?;

    match envelope.node_type.as_str() {
        "example.echo" => {
            let text = envelope
                .inputs
                .get("text")
                .and_then(Value::as_str)
                .ok_or_else(|| Error::msg("example.echo 要求 inputs.text 为字符串"))?;
            let prefix = envelope
                .config
                .get("prefix")
                .and_then(Value::as_str)
                .unwrap_or("");

            // 返回端口输出直出对象，禁止包装成 {"outputs": {...}}。
            Ok(json!({ "result": format!("{prefix}{text}") }).to_string())
        }
        node_type => Err(Error::msg(format!("不支持的 nodeType: {node_type}")).into()),
    }
}
`;
}

function createWasmNodeDefinitions(): Record<string, unknown>[] {
  return [
    {
      type: 'example.echo',
      label: '文本回显',
      category: 'utility',
      description: '为输入文本添加可选前缀并从 result 端口输出',
      inputPorts: [
        {
          id: 'text',
          label: '文本',
          dataType: 'text',
          required: true,
        },
      ],
      outputPorts: [
        {
          id: 'result',
          label: '结果',
          dataType: 'text',
          required: true,
        },
      ],
      configSchema: {
        type: 'object',
        properties: {
          prefix: {
            type: 'string',
            description: '添加到输出文本前的前缀',
            default: '',
          },
        },
      },
    },
  ];
}

function createWasmReadme(options: CreatePluginOptions): string {
  const crateName = normalizePluginName(options.name).replaceAll('-', '_');
  return `# ${options.name}

这是 AgentLoom Rust/Extism WASM 插件脚手架。

## 构建与发布

1. 安装 Rust 的 WASM 目标：\`rustup target add wasm32-unknown-unknown\`。
2. 生成可签名归档：\`agentloom-plugin build --wasm\`。该命令会执行
   \`cargo build --target wasm32-unknown-unknown --release\`，并把
   \`target/wasm32-unknown-unknown/release/${crateName}.wasm\` 复制到清单的
   \`wasmEntry\` 路径 \`dist/plugin.wasm\`。若 \`dist/plugin.wasm\` 已存在则跳过构建。
3. 手工构建时可自行执行上述 cargo 命令并复制产物，效果等价。
4. 显式指定私钥签名：\`agentloom-plugin publish -k <key>\`。
5. 在 AgentLoom Studio 的插件管理页上传签名后的 \`.alp\` 完成注册。

\`.alp\` 包含 \`manifest.json\`、\`node-definitions.json\` 和 \`manifest.wasmEntry\` 指向的 WASM 产物。
`;
}

/**
 * 写出 runtime 插件脚手架：package.json（同时声明 dsh bundle）、tsconfig.json、
 * cordis.patch.yml、src/index.ts 与 README.md。
 */
function writeRuntimePluginFiles(
  projectRoot: string,
  normalizedName: string,
  options: CreatePluginOptions,
): void {
  const toolName = `${normalizedName.replaceAll('-', '_')}_echo`;

  writeJsonFile(join(projectRoot, 'package.json'), {
    name: `agentloom-runtime-plugin-${normalizedName}`,
    version: '0.1.0',
    private: true,
    type: 'module',
    main: './dist/index.js',
    scripts: {
      build: 'tsc',
    },
    dsh: {
      bundle: {
        patch: './cordis.patch.yml',
      },
    },
    peerDependencies: {
      '@deepseek-ai/cordis': '~4.0.4',
      '@deepseek-ai/dsh-tools': RUNTIME_PLUGIN_DSH_VERSION,
    },
    devDependencies: {
      typescript: '^5.5.0',
      '@types/node': '^20.0.0',
    },
  });
  writeJsonFile(join(projectRoot, 'tsconfig.json'), {
    compilerOptions: {
      target: 'ES2022',
      module: 'NodeNext',
      moduleResolution: 'NodeNext',
      outDir: 'dist',
      rootDir: 'src',
      strict: true,
      skipLibCheck: true,
      types: ['node'],
    },
    include: ['src/**/*.ts'],
  });
  // __PLUGIN_ROOT__ 在 sandbox 内会被替换为插件解包后的绝对路径。
  writeFileSync(
    join(projectRoot, 'cordis.patch.yml'),
    `- insert:\n    - id: ${normalizedName}\n      name: __PLUGIN_ROOT__/dist/index.js\n`,
    'utf8',
  );
  writeFileSync(
    join(projectRoot, 'src', 'index.ts'),
    `/**
 * ${options.name}：AgentLoom sandbox 运行态的 dsh runtime 插件（Cordis 插件）。
 *
 * 注意：stdout 是 dsh 的 JSON-RPC 通道，插件内禁止向 stdout 写任何内容，
 * 日志请改用 ctx.logger 或 console.error（stderr）。
 */

/** dsh-tools 注入的工具服务（只声明本模板用到的成员）。 */
interface ToolsService {
  register(definition: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
    output: {
      schema: Record<string, unknown>;
      render: (
        args: unknown,
        value: unknown,
      ) => Array<{ type: 'text'; text: string }>;
    };
    execute(args: Record<string, unknown>): Promise<unknown>;
  }): () => void;
}

interface RuntimePluginContext {
  tools: ToolsService;
}

export const name = '${normalizedName}';
export const inject = ['tools'];

export function apply(ctx: RuntimePluginContext): void {
  ctx.tools.register({
    name: '${toolName}',
    description: '回显输入文本（示例工具）',
    parameters: {
      type: 'object',
      properties: {
        text: { type: 'string', description: '要回显的文本' },
      },
      required: ['text'],
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: String(value) }],
    },
    async execute(args) {
      return \`echo: \${String(args.text ?? '')}\`;
    },
  });
}
`,
    'utf8',
  );
  writeFileSync(
    join(projectRoot, 'README.md'),
    `# ${options.name}

这是 AgentLoom sandbox 运行态的 dsh（DeepSeek Harness ${RUNTIME_PLUGIN_DSH_VERSION}）runtime 插件脚手架。

## 构建与发布

1. 安装依赖：\`npm install\`。
2. 生成归档：\`agentloom-plugin build\`。归档包含 \`manifest.json\`、\`cordis.patch.yml\`、\`dist/\`、\`package.json\`。
3. 显式指定私钥签名：\`agentloom-plugin publish -k <key>\`。
4. 在 AgentLoom Studio 的「Runtime 插件」页上传签名后的 \`.alp\` 并启用，再在 Agent 画布的 harness 节点上挂载。

插件入口禁止写 stdout（会破坏 dsh 的 JSON-RPC 通道），日志请用 \`ctx.logger\` 或 \`console.error\`。
`,
    'utf8',
  );
}

export function createPluginProject(
  options: CreatePluginOptions,
): CreatedPluginProject {
  const normalizedName = normalizePluginName(options.name);
  if (options.wasm && options.runtime) {
    throw new Error('--wasm 与 --runtime 不能同时使用。');
  }
  const projectRoot = resolve(
    options.targetDir ?? process.cwd(),
    normalizedName,
  );

  if (existsSync(projectRoot)) {
    throw new Error(`目标目录已存在：${projectRoot}`);
  }

  const pluginId = `com.agentloom.${normalizedName}`;
  const srcDir = join(projectRoot, 'src');
  const testDir = join(projectRoot, 'tests');
  const manifestPath = join(projectRoot, 'manifest.json');
  const packageJsonPath = join(projectRoot, 'package.json');

  mkdirSync(srcDir, { recursive: true });
  if (!options.wasm && !options.runtime) {
    mkdirSync(testDir, { recursive: true });
  }

  writeJsonFile(manifestPath, createManifestContent(options, pluginId));
  if (options.runtime) {
    writeRuntimePluginFiles(projectRoot, normalizedName, options);
  } else {
    writeJsonFile(
      packageJsonPath,
      options.wasm
        ? createWasmPackageJsonContent(options)
        : createPackageJsonContent(options),
    );
  }
  if (options.wasm) {
    writeFileSync(
      join(projectRoot, 'Cargo.toml'),
      createCargoToml(options),
      'utf8',
    );
    writeFileSync(join(srcDir, 'lib.rs'), createWasmSource(), 'utf8');
    writeJsonFile(
      join(projectRoot, 'node-definitions.json'),
      createWasmNodeDefinitions(),
    );
    writeFileSync(
      join(projectRoot, 'README.md'),
      createWasmReadme(options),
      'utf8',
    );
  } else if (!options.runtime) {
    writeJsonFile(join(projectRoot, 'tsconfig.json'), createTsconfigContent());
    writeFileSync(join(srcDir, 'index.ts'), createIndexSource(), 'utf8');
    writeFileSync(join(testDir, 'index.test.ts'), createTestSource(), 'utf8');
  }

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
  wasm = false,
  runtime = false,
): Promise<CreatedPluginProject> {
  const answers = await promptRunner(
    [
      {
        type: 'text',
        name: 'author',
        message: '作者名称',
        validate: (value: string) =>
          value.trim().length > 0 ? true : '作者不能为空',
      },
      {
        type: 'text',
        name: 'description',
        message: '插件描述',
        validate: (value: string) =>
          value.trim().length > 0 ? true : '描述不能为空',
      },
      {
        type: 'text',
        name: 'license',
        message: '许可证',
        initial: 'MIT',
        validate: (value: string) =>
          value.trim().length > 0 ? true : '许可证不能为空',
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
    wasm,
    runtime,
  });

  console.info(chalk.green(`✨ 插件脚手架已创建：${result.projectDir}`));
  const nextStep = wasm
    ? `cd ${normalizePluginName(name)} && agentloom-plugin build --wasm`
    : runtime
      ? `cd ${normalizePluginName(name)} && npm install && agentloom-plugin build`
      : `cd ${normalizePluginName(name)} && pnpm install && pnpm dev`;
  console.info(chalk.cyan(`下一步：${nextStep}`));

  return result;
}

export const createCommand = new Command('create')
  .description('创建新的 AgentLoom 插件项目')
  .argument('<name>', 'Plugin name')
  .option('--wasm', '创建 Rust/Extism WASM 插件脚手架')
  .option('--runtime', '创建 sandbox 运行态 dsh runtime 插件（Cordis 插件包）脚手架')
  .action(
    async (name: string, options: { wasm?: boolean; runtime?: boolean }) => {
      await runCreateCommand(
        name,
        process.cwd(),
        prompts as unknown as CreatePromptRunner,
        options.wasm,
        options.runtime,
      );
    },
  );
