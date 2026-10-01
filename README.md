# AgentLoom

AgentLoom 是多智能体工作流编排平台：在可视化画布上把 AI Agent、工具、知识库、记忆与控制节点连成 DAG 工作流并执行；Agent 也可以独立对话、版本化发布，并通过 API 对外提供服务。

- 状态：开发中，无 CI/CD；生产实例 <https://agentloom.ling.plus/>
- 文档站：<https://agentloom.ling.plus/documentation/>（源码在 `agentloom-docs/`）

## 仓库布局

TypeScript 包由根 pnpm workspace 管理；`agentloom-docs/` 是独立项目（自带 lockfile）。各目录的作用、技术栈与对应文档见文档站「贡献者 → 贡献者入口」（`agentloom-docs/dev/index.md`）。

```text
AgentLoom/
├── agentloom-server/               # NestJS + Fastify 后端（workspace）
├── agentloom-studio/               # React + Vite Web 工作台（workspace）
├── agentloom-contracts/            # Zod 4 跨端 wire 契约（workspace）
├── agentloom-api-client/           # OpenAPI 生成的 REST 类型（workspace）
├── agentloom-plugin-sdk/           # 插件 SDK，Zod 3（workspace）
├── agentloom-plugin-cli/           # 插件 CLI（workspace）
├── agentloom-plugin-template/      # 示例插件（workspace）
├── agentloom-type-engine/          # Rust/WASM 端口兼容性引擎
├── agentloom-firecracker-runtime/  # Go Firecracker runtime manager 与 guest 守护进程
├── agentloom_mobile/               # Flutter 客户端
├── agentloom-deploy/               # Docker Compose、Helm、环境模板、运维脚本
├── agentloom-docs/                 # VitePress 文档站（单站：用户指南 / API / 部署 / 贡献者）
├── scripts/docs-reference/         # 文档参考生成器（pnpm docs:gen / docs:check）
└── brochure/                       # 宣传册 HTML 源（build.sh 输出 A4 PDF）
```

## 快速开始

需要 Node.js 22 与 pnpm（`corepack enable`）。在仓库根安装一次依赖：

```bash
pnpm install
```

数据库、Redis、Supabase Auth 等依赖服务与 server/Studio 的启动步骤见文档站「贡献者 → 本地开发环境」（`agentloom-docs/dev/setup.md`）。各包自己的命令在各包 `README.md`。

## 根命令

```bash
pnpm test:all          # 递归运行 workspace 成员的 test，并执行 docs:check
pnpm typecheck:all     # 递归 typecheck
pnpm build:all         # 递归 build
pnpm contracts:regen   # 导出 server OpenAPI → 生成 models → 同步并构建 @agentloom/api-client（需要 Redis 可达）
pnpm docs:gen          # 从代码再生成 agentloom-docs/_generated/
pnpm docs:check        # 校验 _generated 未过期、文档引用的路径与环境变量存在、节点页覆盖
```

## 文档

|分区|内容|
|---|---|
|[用户指南](https://agentloom.ling.plus/documentation/guide/)|工作流、Agent、节点、知识库、技能、触发器、协作|
|[API 与集成](https://agentloom.ling.plus/documentation/api/)|REST 参考、Agent 对外 API、Webhook、插件开发|
|[部署运维](https://agentloom.ling.plus/documentation/deploy/)|Docker Compose、Helm、Supabase、Firecracker、备份恢复|
|[贡献者](https://agentloom.ling.plus/documentation/dev/)|架构、各包内部设计、测试、文档维护规范|

本地预览：

```bash
cd agentloom-docs && pnpm install && pnpm dev
```

## 许可证

GNU General Public License v3.0 only，见 [`LICENSE`](LICENSE)。
