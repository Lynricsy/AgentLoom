# Repository Guidelines

## Project Overview

`@agentloom/plugin-cli` 是 AgentLoom 插件项目的脚手架、开发服务器、归档与签名工具。可执行命令名为 `agentloom-plugin`；包本身也通过 `dist/index.js` 暴露可编程 API。

CLI 直接依赖工作区 `@agentloom/plugin-sdk`，以 SDK 的 manifest、节点 schema、归档哈希和 RSA-PSS 签名函数为插件生态边界。跨包契约以根 `AGENTS.md` 和 SDK 源码为准。

## Architecture & Data Flow

```text
src/cli.ts → Commander 注册命令 → src/commands/*.ts
                                      ↓
manifest.json → utils/manifest.ts → SDK schema 校验
插件入口 → utils/plugin.ts → manifest/节点/生命周期校验
                                      ↓
build → dist + package.json + manifest + 节点定义 → .alp ZIP
publish → 读取 .alp → SDK 签名并回写 manifest → 用户通过 Web 上传
```

`loadPlugin()` 优先读取 `package.json.main`，再尝试 `dist/index.js`、`src/index.js`；动态导入附带 revision 参数以绕过 reload 缓存。入口可用 default、`plugin` 或模块对象导出，但最终必须包含合法 manifest、`nodes`、`activate()` 和 `deactivate()`。

节点的 `execute` 必须是函数；其余可序列化字段由 SDK `CustomNodeDefinitionSchema` 校验。重复 node type 会被拒绝，归档中的 `node-definitions.json` 不包含 `execute`。

## Key Directories

| 路径 | 用途 |
|---|---|
| `src/commands/` | 每个 Commander 子命令及对应 `*.test.ts` |
| `src/utils/manifest.ts` | 读取并校验插件根目录 `manifest.json` |
| `src/utils/plugin.ts` | 定位、动态加载、校验插件，并序列化节点定义 |
| `src/cli.ts` | 带 shebang 的 CLI 入口，只负责注册命令 |
| `src/index.ts` | 库入口，集中导出命令函数、选项类型和工具函数 |

## Development Commands

在仓库根目录执行：

```bash
pnpm --filter @agentloom/plugin-cli build      # tsup 生成 CLI 与库产物
pnpm --filter @agentloom/plugin-cli dev        # tsup watch
pnpm --filter @agentloom/plugin-cli typecheck  # tsc --noEmit
pnpm --filter @agentloom/plugin-cli test       # vitest run
pnpm --filter @agentloom/plugin-cli test:watch # Vitest watch
```

CLI 子命令以 `src/cli.ts` 为准：

- `create <name>`：询问作者、描述、许可证，在新目录生成 manifest、TS 配置、空插件和测试。
- `dev [-p, --port <port>]`：启动本地 Express 服务，默认端口 `4400`。
- `build [-o, --output <dir>] [--wasm]`：调用 `npx tsc` 或 `cargo build --target wasm32-unknown-unknown --release`，默认输出 `build/<id>-<version>.alp`。
- `keys generate [-o, --output <dir>] [-b, --bits <bits>]`：生成 2048/3072/4096 位 RSA PEM 密钥，默认写入 `keys/`。
- `publish -k, --key <path> [-o, --output <dir>]`：签名已有 `.alp` 并就地回写；不负责网络上传。

## Code Conventions & Common Patterns

- 使用 ESM、严格 TypeScript 和同步 Node 文件 API；公共能力优先导出“纯函数 + options/result interface”，Commander action 只做参数适配与输出。
- 新命令放在 `src/commands/<name>.ts`，导出 `<name>Command`，并同时从 `src/index.ts` 暴露需要复用的函数与类型。
- CLI 错误应包含可行动的路径、节点 index/type 或缺失前置条件；不得以空节点或未校验数据继续归档。
- `dev` 的 execute 请求只采纳 `inputs`、`config`；logger 和 execution metadata 由服务端生成。JSON body 上限为 `100kb`。
- reload 保持串行：旧插件 deactivate 后加载并 activate 候选；失败时恢复旧插件。停止时关闭 watcher、HTTP server 并 deactivate 当前插件。
- TypeScript 构建产物归档 `manifest.json`、`dist/`、`package.json`、可选 `README.md` 与非空 `node-definitions.json`；WASM 构建将产物规范为 `dist/plugin.wasm`。

## Important Files

- `tsup.config.ts`：双输出配置；`src/cli.ts` 生成无声明的 ESM `dist/cli.js`，注入 `#!/usr/bin/env node`；`src/index.ts` 生成带声明的 ESM 库。
- `package.json`：`bin.agentloom-plugin` 指向 `dist/cli.js`，`main`/`types` 指向库输出。
- `agentloom-plugin-sdk/src/`：校验、归档与签名实现的权威来源。
- `agentloom-plugin-template/`：仓库内可运行的示例插件；`create` 的脚手架内容由 `create.ts` 内联生成，并非复制该目录。

## Runtime/Tooling Preferences

- Node 22 + pnpm（workspace 成员）；包为纯 ESM，`bin` 与库产物均由 tsup 构建。
- `build` 子命令外部依赖 `npx tsc`（TS 插件）或 `cargo` + 已安装的 `wasm32-unknown-unknown` target（WASM 插件，scaffold 是 Extism raw cdylib，不能用 wasm-pack）；`dev` 服务器基于 Express。
- 校验/归档/签名一律复用 `@agentloom/plugin-sdk`（Zod 3），不在 CLI 内重新实现。

## Testing & QA

Vitest 使用 Node 环境和 globals，仅收集 `src/**/*.test.ts`。测试与被测文件同目录。

- 文件系统用例通过 `mkdtempSync(join(tmpdir(), 'agentloom-...'))` 创建真实临时插件 fixture，并在 `afterEach` 递归清理。
- build/publish 测试必须在 import 被测模块前使用 `vi.hoisted()` 保存 `execSync` mock，再由 `vi.mock('node:child_process', ...)` 替换；这样可模拟 `tsc`/`cargo` 产物而不启动外部构建。
- dev 测试使用端口 `0` 获取临时端口，跟踪并 `await server.stop()`，避免遗留 watcher、信号处理器或监听端口。
- 归档和签名测试应读取真实 ZIP，断言条目、manifest、内容哈希与 SDK 验签结果，而不是只检查文件存在。
