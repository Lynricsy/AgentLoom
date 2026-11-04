---
docType: explanation
---

# 0011 Agent 内置工具：VM 内 Cordis 插件与服务端 SessionToolProvider 双通道及策略边界

- 状态：已实施
- 日期：2026-11-04

机制见 [Agent 运行态 · 内置工具](/dev/server/agent-runtime#内置工具)，用户侧说明见 [使用 Agent 内置工具](/guide/agents/builtin-tools)。本篇记录为什么把新增内置工具拆成两条交付通道、两套策略开关，以及为什么被否决的替代方案不可行。

## 背景

在借鉴 oh-my-pi 的内置工具（`lsp`、`ast_grep`、`ast_edit`、`browser`、`eval`、`web_search`、`generate_image`）并默认内置到 AgentLoom 时，受以下事实约束：

| # | 事实 | 证据 |
| --- | --- | --- |
| F1 | `lsp`、`ast_grep` / `ast_edit`、`browser`、`eval` 都需要直接读写沙箱工作区 `/workspace` 或在客户机内启动子进程（language server、Chromium、Python 内核），且依赖 `@ast-grep/napi` 原生预编译包与系统二进制 | `agentloom-deploy/sandbox/src/dsh-plugins/`、`agentloom-deploy/firecracker/rootfs.Dockerfile` |
| F2 | runtime 插件的 `package`（`.alp`）通道只接受纯文本文件、单文件 ≤ 1 MiB、会话文件总量 ≤ 16 MiB，且需要租户表 `runtime_plugins` 行与开发者签名；`npm` 通道在每次建会话时以 `--ignore-scripts` 在线安装，原生包与离线环境不可控 | `agentloom-server/src/modules/sandbox/sandbox.exceptions.ts`、[Runtime 插件](/dev/server/runtime-plugins#guest-内加载) |
| F3 | `@agentloom/sandbox` 已有内置 Cordis 插件先例 `dsh-bridge`：由 `tsup` 打包到 `dist/`，在 `profile-writer.ts` 的平台层 `insert` 中以绝对路径挂载，依赖直接解析到 `/opt/agentloom-sandbox/node_modules` | `agentloom-deploy/sandbox/tsup.config.ts`、`agentloom-deploy/sandbox/src/dsh/profile-writer.ts` |
| F4 | `web_search` 与 `generate_image` 需要访问平台级搜索配置（`APP_WEB_SEARCH_PROVIDERS` 与对应 API Key）、租户加密存储的 LLM API Key 与对象存储，且产品要求 `sandbox` 与 `no_sandbox` 两种运行态都能使用 | `agentloom-server/src/modules/builtin-tools/`、`agentloom-server/src/config/env.schema.ts` |
| F5 | 服务端会话工具（`SessionToolProvider`）已有统一机制：`no_sandbox` 在进程内直接调用，`sandbox` 由 `SandboxAgentAdapter` 序列化为远程工具描述下发 guest，经 `POST /agent-runtime/sessions/:sessionId/tool-executions` 回调执行；此前远程工具结果只产纯文本 | `agentloom-server/src/modules/agent/ports/agent-runtime.port.ts`、`agentloom-server/src/modules/agent/sandbox-agent.adapter.ts`、`agentloom-deploy/sandbox/src/remote-tools.ts` |
| F6 | dsh-base 自带的 `web`、`web-search-deepseek`、`web-fetch-http`、`tool-web` 在平台层被禁用，因为其搜索后端绑定 DeepSeek 自有服务与 `DEEPSEEK_API_KEY` | `agentloom-deploy/sandbox/src/dsh/profile-writer.ts` |
| F7 | 原生工具策略 `nativeToolPolicy` 只在 `sandbox` 运行态编译并随 `/v1/session` 下发给 guest；`no_sandbox` 运行态不编译该字段 | `agentloom-contracts/src/agent-runtime-config.ts`、`agentloom-server/src/modules/agent-definition/agent-definition.service.ts` |

## 决策

| 议题 | 选择 | 被否决的方案及原因 |
| --- | --- | --- |
| VM 内四类工具（`lsp`、`ast_grep` / `ast_edit`、`browser`、`eval`）的交付方式 | 作为 `@agentloom/sandbox` 的内置 Cordis 插件（`agentloom-deploy/sandbox/src/dsh-plugins/<name>/index.ts`），依赖写入 `agentloom-deploy/sandbox/package.json`、系统二进制写入 `agentloom-deploy/firecracker/rootfs.Dockerfile`（`rootfs.sizeGiB` 4 → 6）；`writeDshProfile` 按 `nativeToolPolicy` 在平台层 `insert` 中条件插入，并把条目 id 排在 runtime 插件之前纳入 `assertPluginEntriesActive` 激活核对 | **打包为内置 `.alp` runtime 插件**：`.alp` 禁止二进制文件且受 1 MiB / 16 MiB 上限约束（F2），装不下 `@ast-grep/napi` 与 `puppeteer-core`；还要在每个租户播种 `runtime_plugins` 记录。**走 `npm` 来源在线安装**：每次会话都要访问公网 registry，且 `--ignore-scripts` 与原生二进制不兼容（F2）。**放在服务端执行**：服务端看不到 microVM 的 `/workspace`，也不能替用户跑 Python 或无头浏览器 |
| 网页搜索与图像生成的交付方式 | 新增服务端模块 `agentloom-server/src/modules/builtin-tools/`，以一份 `SessionToolProvider` 同时注册到对话、子 Agent、工作流 Agent 节点与 `agent-task` 节点的会话中；`sandbox` 会话走既有远程工具回调（F5），平台层继续禁用 dsh 自带的 `web*` 条目（F6） | **在 guest 内实现并把搜索 Key / 图像模型 API Key 下发进 VM**：会话目录可被 Agent 终端读取，不应把平台级搜索 Key 或未绑定为路由的提供商密钥放进 VM；且 `no_sandbox` 运行态仍需在服务端再写一份（F4）。**解禁 dsh 的 `web-search-deepseek`**：只能用 DeepSeek 后端，无法按部署配置切换 DuckDuckGo / Tavily / Brave / Exa |
| `sandbox` 下服务端生成图片的回传 | `generate_image` 在 `delivery: 'inline'`（`sandbox`）时返回含 `__agentloomImages` 数组的结果；guest 的 `createRemoteToolResult`（`agentloom-deploy/sandbox/src/remote-tools.ts`）校验文件名与 20 MiB 上限后落盘到 `<workdir>/generated/`，剥离 base64 后交给 `dsh-bridge`，在当前模型支持图像输入且 `attachments` 服务可用时附上 image 内容块。`delivery: 'storage'`（`no_sandbox`）上传 MinIO 并返回 24 小时预签名 URL | **在 `sandbox` 下也只返回 MinIO 预签名 URL**：沙箱内后续工具（`read_image`、`browser`、`eval`）与对话右栏「电脑」标签都围绕 `/workspace` 文件工作，只给外部 URL 会让模型无法在工作区里继续消费生成图，也无法把图片直接作为多模态块回传给模型 |
| 策略开关的切分与组合规则 | VM 内四项放入 `AgentNativeToolPolicySchema`（`lspEnabled`、`astEnabled`、`browserEnabled`、`evalEnabled`，可选布尔，缺省 `true`，仅 `sandbox` 编译）；关闭时不把对应插件写入 `cordis.patch.yml`。文件改写动作（`ast_edit` 的 `dry_run=false`、`lsp` 的 `rename` / `code_actions` 带 `apply=true`）同时受 `editEnabled` 约束；`eval` 同时要求 `terminalEnabled !== false`；只读子 Agent（`buildReadOnlyNativeToolPolicy`）开启 `lsp` 与 `ast`（`allowEdits=false`）、关闭 `browser` 与 `eval`。服务端两项放入新增的 `AgentBuiltinToolPolicySchema`（`webSearchEnabled`、`imageGenerationEnabled`，挂在 `AgentRuntimeConfig.builtinToolPolicy`，两种运行态都编译）。不设部署级总开关 | **全部放进 `nativeToolPolicy`**：`no_sandbox` 运行态不编译 `nativeToolPolicy`（F7），放进去会让无沙箱 Agent 无法在画布上开关 `web_search` 与 `generate_image`。**与读写编辑一样用 `ctx.tools.guard` 拦截 VM 内置插件**：不插入插件能省掉插件初始化与系统提示词段落，且模型根本看不到被关闭的工具。**增加部署级环境变量总开关**：rootfs 与 `@agentloom/sandbox` 由同一脚本构建进同一份产物，不存在版本错配 |
| 图像模型的配置与协议分发 | PostgreSQL 枚举 `llm_model_type`（`agentloom-server/src/database/schema/llm-model-configs.schema.ts`）新增 `'image'`；复用 `LlmService.findDefaultByType(tenantId, 'image')`（与 `chat`、`embedding` 的默认配置互不覆盖）和 `DecryptionBoundaryService`。`openai_chat` / `openai_responses` 协议请求 `<baseUrl>/v1/images/generations`，`google` 协议请求 Gemini `generateContent`。租户未配置默认图像模型或查询失败时，注册阶段跳过 `generate_image` 工具 | **用环境变量配置全局图像模型**：多租户下各组织使用自己的提供商与 API Key，平台级环境变量无法按租户隔离凭据与计费。**租户未配图像模型时仍注册工具、调用时报错**：模型会看到工具并反复尝试调用必败的 `generate_image` |

## 后果

- 任何有沙箱 Agent 默认多出 `lsp`、`ast_grep`、`ast_edit`、`browser`、`eval` 五个工具，任何运行态的 Agent 默认多出 `web_search` 及（组织配了默认图像模型时）`generate_image`，都可以在 Agent Main 面板逐项关闭。
- Firecracker rootfs 镜像体积上限从 4 GiB 增至 6 GiB（只读共享盘，每台宿主机只占一份）；运行节点升级时需重新构建并替换 Firecracker 产物，否则启动含内置插件的会话或调用 `browser` / `lsp` 会报镜像缺失错误。
- 用户若在 Harness 的 profile patch 中手动解除 `tool-web` 等禁用条目，dsh 自带的 `web_search` 会与远程工具 `web_search` 重名导致会话启动失败；此情形作为配置错误写入用户指南「出错时」表。
- `no_sandbox` 运行态下 `PiAgentCoreAdapter` 仍只把工具结果包装为文本块，模型拿到预签名下载 URL 但看不到图片本身。

## 确认方式

- 契约与服务端单测：`agentloom-server/src/modules/agent-definition/agent-definition.service.spec.ts`、`agentloom-server/src/modules/builtin-tools/__tests__/image-generation.service.spec.ts`、`agentloom-server/src/modules/builtin-tools/__tests__/web-search.service.spec.ts`、`agentloom-server/src/modules/builtin-tools/__tests__/builtin-tools.provider.spec.ts`、`agentloom-server/src/modules/agent-execution/__tests__/agent-execution.worker.spec.ts`、`agentloom-server/src/modules/execution/__tests__/workflow-agent-adapter.spec.ts`。
- guest 单测：`agentloom-deploy/sandbox/test/dsh-profile-writer.spec.ts`、`agentloom-deploy/sandbox/test/remote-tools.spec.ts`、`agentloom-deploy/sandbox/test/dsh-bridge.spec.ts` 及 `agentloom-deploy/sandbox/test/dsh-plugins/` 下四个插件的测试。
- 文档门禁：`pnpm docs:gen && pnpm docs:check` 与 `cd agentloom-docs && pnpm build` 退出码为 0。
