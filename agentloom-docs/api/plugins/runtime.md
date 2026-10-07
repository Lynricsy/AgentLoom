---
docType: howto
---

# 开发 runtime 插件

runtime 插件是挂进 sandbox 运行态 Agent 核心 DeepSeek Harness（dsh）的 Cordis 插件，可以注册工具、拦截工具调用、调整提示词组装与 agent loop。它在 Agent 的 microVM 内运行，不在 AgentLoom 服务端执行；与工作流的 WASM 节点插件是两回事，后者见 [插件体系](/api/plugins/)。插件进入运行时的过程见 [Runtime 插件（服务端）](/dev/server/runtime-plugins)。

前提：

- Node.js 22.19 或更高（dsh 的 `engines` 下限），npm。
- 已按 [Plugin CLI](/api/plugins/cli) 构建 `agentloom-plugin` 命令，并按 [开发教程](/api/plugins/tutorial#_2-生成签名密钥) 生成签名密钥、把公钥注册到组织。
- 熟悉 dsh 的插件写法：导出 `name`、`inject`、`apply(ctx, config)`，服务（如 `ctx.tools`）经 `inject` 声明。平台锁定的 dsh 版本是 manifest 中 `runtime.dshVersion` 必须填写的值，当前为 `0.2.0-rc.2`（服务端常量 `RUNTIME_PLUGIN_SUPPORTED_DSH_VERSION`）。

::: warning 未在本轮验证
第 4 步「上传并启用」与第 5 步在对话中使用没有实跑；第 1–3 步的输出来自一次实跑。
:::

## 1. 创建项目

```bash
agentloom-plugin create demo-rt --runtime
```

按提示填写「作者名称」「插件描述」「许可证」，结束时输出：

```text
✨ 插件脚手架已创建：/tmp/rtdoc/demo-rt
下一步：cd demo-rt && npm install && agentloom-plugin build
```

生成的文件：`manifest.json`、`package.json`、`cordis.patch.yml`、`src/index.ts`、`tsconfig.json`、`README.md`。`manifest.json` 中与节点插件不同的部分：

```json
{
  "id": "com.agentloom.demo-rt",
  "kind": "runtime",
  "runtime": {
    "dshVersion": "0.2.0-rc.2",
    "patch": "./cordis.patch.yml",
    "entry": "./dist/index.js"
  }
}
```

字段规则见 [Plugin SDK](/api/plugins/sdk#清单-pluginmanifest)。

## 2. 写插件

`src/index.ts` 是一个注册示例工具 `demo_rt_echo` 的 Cordis 插件，按需改写。`cordis.patch.yml` 把它插入 profile：

```yaml
- insert:
    - id: demo-rt
      name: __PLUGIN_ROOT__/dist/index.js
```

写插件时遵守：

- **`__PLUGIN_ROOT__`**：在 VM 内被替换为插件解包后的绝对路径。`insert` 条目的 `name` 也可以写相对路径（相对 patch 文件所在目录），平台合并 patch 前会把它转为绝对路径。
- **peerDependencies**：插件 import 的每个 `@deepseek-ai/*` 包都要在 `package.json` 的 `peerDependencies` 中声明，版本与平台一致；不要把它们装进包里。否则插件在 dsh 中 import 失败。模板已声明 `@deepseek-ai/cordis` 与 `@deepseek-ai/dsh-tools`。
- **只放文本文件**：包经会话请求的文本通道下发，任何非 UTF-8 文件都会让使用它的会话创建失败；包内所有文件与 Agent 绑定的技能文件合计不超过 16 MiB，单文件不超过 1 MiB。
- **配置**：用户在画布节点上填写的配置会浅合并到该插件 patch 中每个顶层 `insert` 条目的 `config` 上。在 manifest 的 `runtime.configSchema` 写 JSON Schema 后，Studio 面板为标量字段渲染表单；对象与数组字段需要用户在 harness 节点的 profile patch 中配置。
- **审批**：dsh 在 microVM 内以 danger-full-access 运行，内置工具不发起审批。要让某个工具调用经用户确认，在 `tools/pre-execute` 中返回 `{ kind: 'ask' }`，请求会出现在 AgentLoom 的审批卡片里，30 秒无决议按拒绝处理。

## 3. 构建与签名

```bash
npm install
agentloom-plugin build
agentloom-plugin publish -k ../keys/private.pem
```

`build` 执行 `tsc` 并检查 `runtime.entry` 与 `runtime.patch` 指向的文件存在，然后打包。实跑时归档内容：

```text
      422  2026-10-07 03:52   manifest.json
       70  2026-10-07 03:52   cordis.patch.yml
      446  2026-10-07 03:52   package.json
      620  2026-10-07 03:52   README.md
      927  2026-10-07 03:52   dist/index.js
```

`build` 结束时打印归档路径、大小、版本与「类型: runtime 插件（dsh 0.2.0-rc.2）」。`publish` 的输出以 `✅ 插件签名完成` 开头，归档为 `build/com.agentloom.demo-rt-0.1.0.alp`。

## 4. 上传并启用

在 Studio 侧边栏「资源」组打开「Runtime 插件」，点击「上传 runtime 插件」，选择签名后的 `.alp`，勾选「上传后立即启用」，点击「上传并注册」。列表中出现该插件，状态为「已启用」。

也可以直接调用 `POST /api/v1/runtime-plugins`（multipart，字段 `file` 与可选的 `status`，见 [REST 参考](/api/rest)）。

## 5. 挂到 Agent 上

在 Agent 画布上放置 harness 与 runtime-plugin 节点并选择该插件，发布后对话中即可使用插件注册的工具，见 [Harness 与 runtime 插件](/guide/agents/harness)。

## 改用 npm 发布

已经发布在 npm 上的 dsh 插件可以不经上传，直接在 runtime-plugin 节点中填写包名与版本，会话启动时在 microVM 内安装。包需要满足：

- 是 ESM 的 Cordis 插件包；`package.json` 声明 `dsh.bundle.patch`（字符串或数组）时按 bundle 合并其 patch，不声明时整个包作为一个插件条目挂载。
- `@deepseek-ai/*` 依赖写在 `peerDependencies` 中。安装使用 `--ignore-scripts` 与 `--legacy-peer-deps`，安装脚本不执行，peer 不会另装一份。

## 出错时

| 现象 | 原因与处理 |
| --- | --- |
| 上传返回 422 `runtime-plugin-validation-failed`，`该包不是 runtime 插件` | manifest 缺 `kind: "runtime"`；节点插件请在「插件」页上传 |
| 上传返回 422 `runtime-plugin-unsupported-dsh-version` | `runtime.dshVersion` 与平台版本不一致；按 `detail` 中的平台版本修改并重新构建、签名 |
| 上传返回 422 `runtime-plugin-validation-failed`，`插件包缺少 …` 或 `cordis.patch.yml …` | `runtime.entry` / `runtime.patch` 指向的文件不在包内，或 patch 不是每项含 `insert` / `id` 的 YAML 列表 |
| 上传返回 409 `runtime-plugin-already-exists` | 同一 `id` 与 `version` 已上传过；提升 `version` 后重新构建 |
| 签名相关错误（`plugin-signature-*` 等） | 与节点插件相同，见 [开发教程](/api/plugins/tutorial#出错时) |
| 对话开始时报 `sandbox-runtime-plugin-unsupported-file` | 包内有非文本文件，从 `dist/` 与包根目录中移除后重新打包 |
| 对话开始时报 `dsh 运行时启动失败: …` | 插件在 dsh 中加载失败，错误后附 dsh 输出末尾；常见原因是 import 的 `@deepseek-ai/*` 包未在 `peerDependencies` 中声明 |
