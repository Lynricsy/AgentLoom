---
docType: reference
---

# 上游追踪

AgentLoom 的 Agent 循环、沙箱运行态与微虚拟机都建立在外部项目之上。本页登记这些上游：从哪里来、版本钉在哪个文件、在哪一层接入、上次审阅到哪里、哪些上游能力评估过但暂不合入。同步上游的步骤由仓库命令 `.omp/commands/sync-upstream.md` 执行，每次同步结束都更新本页。

当前钉住的版本以「钉版位置」列中的文件为准，本页不重复记录。

## 已追踪上游

| 上游 | 仓库 | 钉版位置 | 接入层 | 机制文档 | 上次审阅到 |
| --- | --- | --- | --- | --- | --- |
| pi（`@earendil-works/pi-agent-core`、`@earendil-works/pi-ai`） | `https://github.com/earendil-works/pi` | `agentloom-server/package.json` | `agentloom-server/src/modules/agent/pi-imports.ts`、`agentloom-server/src/modules/agent/pi-agent-core.adapter.ts` | [Agent 运行态](/dev/server/agent-runtime) | `0.84.4`（提交 af15d2e4，2026-08-30） |
| DeepSeek Harness（`@deepseek-ai/dsh*`、`@deepseek-ai/cordis`、`@deepseek-ai/schemastery`） | `https://github.com/deepseek-ai/deepseek-harness` | `agentloom-deploy/sandbox/package.json` 与 `agentloom-deploy/sandbox/package-lock.json`（npm，不在 pnpm workspace 内） | `agentloom-deploy/sandbox/src/dsh/profile-writer.ts`、`agentloom-deploy/sandbox/src/dsh/session-factory.ts`、`agentloom-deploy/sandbox/src/dsh/bridge-protocol.ts` | [Agent 运行态](/dev/server/agent-runtime)、[Runtime 插件](/dev/server/runtime-plugins)、[ADR 0003](/dev/decisions/0003-dsh-sandbox-runtime) | `0.2.0-rc.2`（提交 bc1cf20c，2026-10-07） |
| Firecracker | `https://github.com/firecracker-microvm/firecracker` | `agentloom-deploy/firecracker/build-artifacts.sh` | 宿主机微虚拟机，由 `agentloom-firecracker-runtime/` 驱动 | [Firecracker 运行时](/dev/firecracker-runtime)、[Firecracker 部署](/deploy/firecracker) | `v1.16.1`（提交 f4ebf3c9，2026-08-09） |
| firecracker-go-sdk | `https://github.com/firecracker-microvm/firecracker-go-sdk` | `agentloom-firecracker-runtime/go.mod` | `agentloom-firecracker-runtime/internal/` | [Firecracker 运行时](/dev/firecracker-runtime) | 伪版本 `v1.0.1-0.20251224190957-6fb280e993d4`（提交 f4ebf3c9，2026-08-09） |
| GrokSearchMCP（`grok-search`） | `https://github.com/Lynricsy/GrokSearchMCP` | `agentloom-deploy/sandbox/package.json` | 预装进 guest 镜像的 stdio MCP server，`agentloom-deploy/sandbox/src/mcp-client.ts` 把 `npx -y grok-search` 改写为本地二进制 | — | `0.3.0`（提交 3caaf763，2026-03-29） |
| A2A 协议（JSON-RPC 绑定，仅入站） | `https://a2a-protocol.org/latest/specification/` | `agentloom-server/src/modules/a2a/a2a.types.ts` 的 `A2A_PROTOCOL_VERSION` | `agentloom-server/src/modules/a2a/` | [A2A 入站接入](/api/a2a)、[ADR-0005](/dev/decisions/0005-a2a-inbound) | 规范 `1.0`（2026-10-15） |

登记标准：AgentLoom 在其 API 或协议之上写了适配层，或把它预装进运行镜像，上游的行为变化或新能力会直接改变平台能力。框架与工具库（NestJS、React、Drizzle 等）按普通依赖升级，不在此登记。

## 评估后暂不合入

| 上游 | 能力 | 评估版本 | 不合入的理由 | 重新评估的条件 |
| --- | --- | --- | --- | --- |
| pi | 会话 compaction | `0.84.4` | 升级 `0.84.4` 时只做 scope 迁移与 breaking 适配，保持行为不变（见提交 af15d2e4） | 长对话的上下文溢出成为实际问题，或 `no_sandbox` 运行态需要与 sandbox 运行态对齐上下文管理 |
