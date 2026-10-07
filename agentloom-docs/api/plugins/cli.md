---
docType: reference
---

# Plugin CLI

`@agentloom/plugin-cli`（源码 `agentloom-plugin-cli/`）提供命令 `agentloom-plugin`。包目前不在 npm 上发布，构建与使用方式：

```bash
pnpm --filter @agentloom/plugin-cli build
alias agentloom-plugin="node $PWD/agentloom-plugin-cli/dist/cli.js"
```

| 命令 | 作用 |
| --- | --- |
| `create <name> [--wasm \| --runtime]` | 创建插件项目 |
| `build [-o <dir>] [--wasm]` | 打包 `.alp`（runtime 插件按 manifest 的 `kind` 自动走 runtime 分支） |
| `keys generate [-o <dir>] [-b <bits>]` | 生成 RSA 签名密钥对 |
| `dev [-p <port>]` | 启动 TypeScript 本地预览服务器 |
| `publish -k <path> [-o <dir>]` | 签名已构建的 `.alp`，不上传 |

## `create`

`agentloom-plugin create <name> [--wasm | --runtime]`

交互询问「作者名称」「插件描述」「许可证」（默认 `MIT`），在当前目录下创建 `<name>`（转为小写、非字母数字替换为 `-`）。目录已存在时报错退出。

| 选项 | 生成内容 |
| --- | --- |
| `--wasm` | `Cargo.toml`、`src/lib.rs`（Extism `execute` 导出，示例节点 `example.echo`）、`node-definitions.json`、`manifest.json`（含 `wasmEntry: "dist/plugin.wasm"`）、`package.json`、`README.md`。可注册到平台 |
| `--runtime` | sandbox 运行态的 runtime 插件：`manifest.json`（`kind: "runtime"`，`runtime` 指向 `./cordis.patch.yml` 与 `./dist/index.js`）、声明 `dsh.bundle.patch` 与 `@deepseek-ai/*` peerDependencies 的 `package.json`、`cordis.patch.yml`、注册示例工具 `<name>_echo` 的 `src/index.ts`、`tsconfig.json`、`README.md`。可注册到平台的「Runtime 插件」，见 [开发 runtime 插件](/api/plugins/runtime) |
| 不带 | `src/index.ts`（空节点列表）、`tests/index.test.ts`、`tsconfig.json`、`manifest.json`、`package.json`。仅供 `dev` 本地预览 |

`--wasm` 与 `--runtime` 不能同时使用。

所有项目的 `manifest.json` 都以 `com.agentloom.<name>` 为 `id`、`0.1.0` 为 `version`，并写入 `keywords`。TypeScript 预览项目的 `package.json` 依赖 `"@agentloom/plugin-sdk": "file:../agentloom-plugin-sdk"`，因此项目目录的上一级需要有 `agentloom-plugin-sdk`（放在仓库根目录下，或在上一级建一个指向它的符号链接）；runtime 项目不依赖 plugin-sdk，`npm install` 即可。

## `build`

`agentloom-plugin build [-o <dir>] [--wasm]`

| 选项 | 默认 | 说明 |
| --- | --- | --- |
| `-o, --output <dir>` | `build` | 输出目录 |
| `--wasm` | 关 | 构建 WASM 插件 |

- manifest 的 `kind` 为 `runtime`：不接受 `--wasm`；执行 `npx tsc`，要求 `runtime.entry` 与 `runtime.patch` 指向的文件存在，否则报错 `runtime 插件缺少入口文件: <path>`；再用 esbuild 把 `dist/` 下的每个 JS 文件（以及不在 `dist/` 下的入口）打包为自包含的 ESM：第三方依赖内联，`@deepseek-ai/*`、`peerDependencies` 与 node 内置模块保持外部 import，共享代码拆到 `dist/chunks/`，打包失败时报错 `runtime 插件依赖打包失败: …`；任一文件超过 1 MiB 或合计超过 16 MiB 时报错（会话下发通道的上限）。输出 `<output>/<id>-<version>.alp`，包含 `manifest.json`、patch 文件、打包后的 `dist/`（类型声明与 source map 除外）、`package.json`，以及存在时的 `README.md`。
- `--wasm`：要求存在 `Cargo.toml` 与非空且合法的 `node-definitions.json`；`dist/plugin.wasm` 不存在时执行 `cargo build --target wasm32-unknown-unknown --release` 并复制产物，已存在时跳过编译。
- 不带 `--wasm` 的节点插件：执行 `npx tsc`，从 `dist/index.js` 读取节点定义；结束时提示该产物不能注册到服务端。
- 节点插件输出 `<output>/<id>-<version>.alp`，包含 `manifest.json`、`node-definitions.json`、`dist/`、`package.json`，以及存在时的 `README.md`。

## `keys generate`

`agentloom-plugin keys generate [-o <dir>] [-b <bits>]`

| 选项 | 默认 | 说明 |
| --- | --- | --- |
| `-o, --output <dir>` | `./keys` | 输出目录 |
| `-b, --bits <bits>` | `2048` | 仅支持 `2048`、`3072`、`4096` |

写出 `public.pem`（SPKI）与 `private.pem`（PKCS#8，权限 `0600`），打印公钥指纹。`private.pem` 已存在时报错，不覆盖。

## `dev`

`agentloom-plugin dev [-p <port>]`，端口默认 `4400`。

只服务 TypeScript 项目：启动时导入 `dist/index.js`（或 `package.json` 的 `main`），所以先构建。没有构建产物时：

```text
Error: 未找到插件入口文件，请先构建插件（例如生成 dist/index.js）或确认 package.json.main 配置正确。
```

| 端点 | 说明 |
| --- | --- |
| `GET /manifest` | 返回 `manifest.json` |
| `GET /nodes` | 返回节点定义（不含 `execute`） |
| `POST /nodes/:type/execute` | 请求体 `{ "inputs": {…}, "config": {…} }`，调用节点的 `execute`；未知类型 404，执行抛错 500 |

`dev` 不编译 TypeScript。它监听 `src/` 的变化并重新导入 `dist/index.js`：修改代码后先执行 `npx tsc`，再保存一次 `src/` 下的文件触发重载。

以下输出来自一个节点类型为 `text-upper` 的预览项目（先 `pnpm install` 与 `agentloom-plugin build`，再 `agentloom-plugin dev`）：

```bash
curl -s http://localhost:4400/nodes
curl -s -X POST http://localhost:4400/nodes/text-upper/execute \
  -H 'Content-Type: application/json' \
  -d '{"inputs":{"text":"hello agentloom"},"config":{"prefix":">> "}}'
```

```text
[{"type":"text-upper","label":"文本转大写","category":"transform","description":"将输入文本转换为大写形式","inputPorts":[{"id":"text","label":"文本","dataType":"text","required":true}],"outputPorts":[{"id":"result","label":"结果","dataType":"text"}]}]
{"outputs":{"result":">> HELLO AGENTLOOM"}}
```

（实跑时端口用 `-p` 改成了其他值，输出与端口无关。）

## `publish`

`agentloom-plugin publish -k <path> [-o <dir>]`

| 选项 | 默认 | 说明 |
| --- | --- | --- |
| `-k, --key <path>` | 无，必填 | 签名私钥；缺少时打印提示并以退出码 1 结束 |
| `-o, --output <dir>` | `build` | `.alp` 所在目录 |

读取 `<output>/<id>-<version>.alp`，用 SDK 的 `signArchive` 签名，把 `signature`、`contentHash`、`developerKeyFingerprint` 写回归档内的 `manifest.json`，自验证通过后覆盖原文件。它不上传；上传与注册见 [开发教程](/api/plugins/tutorial#_7-上传并启用插件)。
