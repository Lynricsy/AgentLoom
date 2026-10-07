---
docType: explanation
---

# 0003 sandbox 运行态切换为 DeepSeek Harness 并开放 runtime 插件

- 状态：已实施
- 日期：2026-10-07

机制见 [Agent 运行态](/dev/server/agent-runtime) 与 [Runtime 插件](/dev/server/runtime-plugins)。本篇只记录为什么这样设计。

## 背景

用户需要在 sandbox 运行态的 Agent 上定制 agent loop、工具流水线与提示词组装，而不只是连接工具与技能。决策时的事实：

| # | 事实 | 证据 |
| --- | --- | --- |
| F1 | guest 内的 Agent 核心是 `@earendil-works/pi-coding-agent`，耦合面只在 guest 服务的会话工厂；pi 没有供第三方挂载代码的插件机制 | `agentloom-deploy/sandbox/src/server.ts`（切换前） |
| F2 | 上层只依赖 `IAgentRuntime` 端口与 guest 的 `/v1/session`、`/v1/prompt`、`/v1/abort`、`/v1/pty/*` HTTP/SSE 契约 | `agentloom-server/src/modules/agent/ports/agent-runtime.port.ts` |
| F3 | DeepSeek Harness（dsh）是 Cordis 插件树，profile 的 `cordis.patch.yml` 可以插入、覆盖或禁用任意插件条目；它不支持在宿主进程内挂载，运行形态是 `dsh` 子进程，home 由 `DSH_HOME` 决定 | `@deepseek-ai/dsh` 0.2.0-rc.2 文档与包内容 |
| F4 | dsh 自带的 SDK JSON-RPC 协议只有 `initialize`、`session/prompt`、`shutdown`，没有取消与审批往返 | `@deepseek-ai/dsh-sdk-jsonrpc-server` 源码 |
| F5 | dsh 声明未经安全审计，插件等同进程内任意代码 | dsh 仓库 `SAFETY.md` |
| F6 | guest 会话请求的 `files` 通道只传文本，单文件 1 MiB、合计 16 MiB | `agentloom-deploy/sandbox/src/session-config.ts` |
| F7 | `no_sandbox` 运行态在 server 进程内运行 pi-agent-core，没有隔离边界 | `agentloom-server/src/modules/agent/pi-agent-core.adapter.ts` |

## 决策

| 议题 | 选择 | 被否决的方案及原因 |
| --- | --- | --- |
| guest 内核 | 直接把 sandbox 运行态的 Agent 核心换成 dsh，删除 guest 内 pi 路径；`no_sandbox` 不动 | **pi 与 dsh 并存、按 Agent 选择**：两套事件映射与工具注册长期双维护，而 pi 侧拿不到插件能力（F1） |
| 运行形态 | 每个会话一个 `dsh --profile agentloom` 子进程，`DSH_HOME` 在会话目录内 | **guest 进程内挂载 dsh**：dsh 不支持（F3） |
| 控制通道 | 自写 Cordis 插件 agentloom-bridge，在会话目录的 unix socket 上提供会话、取消、审批、PTY 与事件流 | **直接用 dsh SDK 协议**：缺取消与审批往返（F4）；**占用子进程 stdio**：stdout 归 launcher |
| 对上契约 | guest HTTP/SSE 契约与 server 侧 decoder 保持不变，只新增 `harness_trace` 事件与 `POST /v1/permission` | **改 `IAgentRuntime` 或 SSE 格式**：会牵动 server、Studio、ACP 的全部调用方（F2） |
| 用户插件运行位置 | 只在该 Agent 的 microVM 内，作为 dsh 插件加载 | **允许在 `no_sandbox` 使用**：插件是任意代码（F5），在 server 进程内运行会越过租户隔离（F7） |
| 插件来源 | 已签名 `.alp` 包（复用节点插件的开发者密钥与验签），或 npm 包在 VM 内在线安装 | **只支持上传包**：现成的 dsh 插件都发布在 npm 上，强制重新打包门槛高；**在 server 预装 npm 包**：要在 server 侧执行包管理器 |
| 包下发通道 | 复用会话请求的 `files` 文本通道，包只能含 UTF-8 文本文件 | **新增归档上传通道**：guestd 的归档接口只允许 `/workspace` 与 `/tmp`，Agent 可写，不适合放平台下发的代码（F6 的限制因此成为插件约束） |
| 审批 | dsh 以 danger-full-access 运行，审批策略为 ask；审批请求经 SSE 进入现有审批卡片，决议经 guest `POST /v1/permission` 回到 bridge | **沿用 dsh 的进程级沙箱与内置审批**：microVM 已是隔离边界，叠加后内置工具每次都要审批 |
| 会话记录 | 权威记录仍在 PostgreSQL；dsh 的 JSONL 会话只在会话目录内临时存在 | **以 dsh 会话文件为准**：随 VM 销毁丢失，且无法跨实例查询 |
| 版本 | 平台与插件锁定同一个 dsh 版本，插件 manifest 声明 `dshVersion` 并精确比对 | **允许版本范围**：guest 只装一份 dsh，插件按其他版本 API 写会在运行时才失败 |

## 后果

- 用户可以通过画布上的 harness 与 runtime-plugin 节点改变 sandbox Agent 的运行时行为；Studio 新增插件库页与对话页的 Harness trace。
- 每个会话多一个子进程，会话初始化变慢：server 侧初始化超时相应放宽，每个 npm 插件再加 180 s。
- guest 的生产依赖变大，rootfs 从 2 GiB 增至 4 GiB；rootfs 中的 Node 必须满足 dsh 的版本下限。
- 升级 dsh 是一次协调变更：guest 依赖、server 支持版本常量、CLI 模板、Studio 显示版本同时改，旧插件包需要重新构建。
- 插件包里不能放二进制文件；需要原生模块的 npm 包因 `--ignore-scripts` 无法使用。
- dsh 内置工具在 microVM 内不再发起审批；需要人工确认的工具调用要由插件在 `tools/pre-execute` 中返回 `ask`。

## 确认方式

- guest 单测覆盖 profile 生成、bridge 协议与会话工厂：

  ```bash
  cd agentloom-deploy/sandbox
  npm test
  ```

- server 单测覆盖 runtime 插件上传、画布编译、会话载荷与审批回写：

  ```bash
  pnpm --filter agentloom-server exec vitest run src/modules/runtime-plugin src/modules/agent-definition src/modules/agent
  ```

- 源码中不再出现 guest 侧的 pi 依赖：`agentloom-deploy/sandbox/package.json` 不含 `@earendil-works/pi-coding-agent`。
