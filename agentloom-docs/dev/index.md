---
docType: index
---

# 贡献者文档

本分区写给要修改 AgentLoom 代码的人：怎样在本机跑起来、系统各部分如何衔接、改某一类东西时要动哪些文件。产品操作见 [用户指南](/guide/)，对外接口见 [API 与集成](/api/)，部署见 [部署运维](/deploy/)。

## 按任务选择入口

| 你要做的事 | 先读 | 再读 |
| --- | --- | --- |
| 第一次在本机跑起 server 与 Studio | [搭建本地开发环境](/dev/setup) | [系统架构](/dev/architecture) |
| 理解工作流、Agent、节点、端口这些对象的关系 | [核心概念](/dev/concepts) | [类型引擎](/dev/type-engine) |
| 改 server 的某个域模块 | [模块与分域](/dev/server/) | [请求管线](/dev/server/request-pipeline)、[数据库](/dev/server/database)、[队列](/dev/server/queues) |
| 改 Agent 执行、沙箱、ACP | [Agent 运行态](/dev/server/agent-runtime) | [Firecracker 运行时](/dev/firecracker-runtime)、[ACP](/dev/server/acp) |
| 改 Studio 页面或画布 | [Studio 结构](/dev/studio/) | [画布](/dev/studio/canvas)、[状态管理](/dev/studio/state) |
| 改跨端 wire 格式或 REST 契约 | [契约与再生成](/dev/contracts) | [实时通信](/dev/server/realtime) |
| 改移动端 | [Flutter 应用](/dev/mobile) | [契约与再生成](/dev/contracts) |
| 新增模块、节点类型、环境变量或 Socket 事件 | [新增服务端模块](/dev/howto/add-server-module)、[新增节点类型](/dev/howto/add-node-type)、[新增环境变量](/dev/howto/add-env-var)、[新增 Socket 事件](/dev/howto/add-socket-event) | [文档维护指南](/dev/docs-maintenance) |
| 提交前跑测试 | [运行与编写测试](/dev/testing) | — |
| 了解某个架构决策的来由 | [决策记录](/dev/decisions/) | — |

## 仓库地图

仓库根是一个 pnpm monorepo。JS/TS 包是 `pnpm-workspace.yaml` 中列出的 workspace 成员，共用根 `pnpm install`；Rust、Go、Flutter 包与文档站各自独立构建。

| 目录 | 作用 | 技术栈 | 文档页 |
| --- | --- | --- | --- |
| `agentloom-server/` | 后端服务：REST `/api/v1`、Socket.IO 网关、BullMQ worker、ACP stdio 入口 | NestJS 11 + Fastify 5、Drizzle ORM、BullMQ、Zod 4 | [模块与分域](/dev/server/) |
| `agentloom-studio/` | Web 工作台：画布编辑器、Agent、知识库、设置等全部页面 | React 19、Vite 8、TanStack Router/Query、Zustand、@xyflow/react | [Studio 结构](/dev/studio/) |
| `agentloom_mobile/` | 移动端应用 | Flutter（FVM 固定版本）、Riverpod 3、freezed | [Flutter 应用](/dev/mobile) |
| `agentloom-contracts/` | server、Studio、mobile 共享的 wire 格式唯一来源 | TypeScript + Zod 4 | [契约与再生成](/dev/contracts) |
| `agentloom-api-client/` | 由 server OpenAPI 生成的 REST 类型定义，禁止手改 | TypeScript（生成产物） | [契约与再生成](/dev/contracts) |
| `agentloom-type-engine/` | 端口数据类型兼容性检查，编译为 WASM 供 Studio 调用；`pkg/` 为已提交的构建产物 | Rust（edition 2024）+ wasm-pack | [类型引擎](/dev/type-engine) |
| `agentloom-plugin-sdk/` | 插件开发 SDK：manifest 校验、辅助函数、RSA-PSS 签名 | TypeScript + Zod 3 | [插件 SDK](/api/plugins/sdk) |
| `agentloom-plugin-cli/` | 插件脚手架与打包、签名、发布命令行 | TypeScript | [插件 CLI](/api/plugins/cli) |
| `agentloom-plugin-template/` | 基于 SDK 的示例插件 | TypeScript + Vitest | [插件开发教程](/api/plugins/tutorial) |
| `agentloom-firecracker-runtime/` | 沙箱运行时管理器：在宿主机上创建与管理 Firecracker microVM，经 mTLS 对 server 提供 HTTP API | Go 1.25 | [Firecracker 运行时](/dev/firecracker-runtime) |
| `agentloom-deploy/` | Docker Compose、Helm chart、nginx、Firecracker 构建与 PKI 脚本、备份恢复脚本、沙箱 guest 代码 | Docker、Helm、Shell | [部署运维](/deploy/) |
| `agentloom-docs/` | 本文档站（四个分区 + 生成的清单 `agentloom-docs/_generated/`） | VitePress 2（独立 lockfile，非 workspace 成员） | [文档维护指南](/dev/docs-maintenance) |
| `scripts/` | 仓库级脚本；`scripts/docs-reference/` 是文档参考生成器与漂移检查 | TypeScript（tsx 运行） | [文档维护指南](/dev/docs-maintenance) |
| `brochure/` | 独立的宣传材料（HTML 渲染为 PDF），不属于文档站 | HTML + CSS | — |
| `Logo/` | 品牌图片源文件 | PNG | — |

根目录另有 `docker-compose.dev.yml`，只定义一个 Qdrant 服务。

## 命令在哪里

各包的开发命令写在该包的 `README.md`，仓库级命令写在根 `README.md`。贡献者规则（代码约定、提交前门禁）写在根与各包的 `AGENTS.md`。本分区只解释机制，不重复命令清单。
