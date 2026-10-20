---
docType: explanation
---

# 0008 有沙箱 Agent 的 stdio MCP 在 guest 内启动

- 状态：已实施
- 日期：2026-10-20

机制见 [Agent 运行态](/dev/server/agent-runtime) 与 [安全模型](/dev/server/security#服务端进程执行)，用户侧说明见 [MCP 工具](/guide/integrations/mcp-tools#stdio-服务器在哪里运行)。本篇记录为什么这样设计。

## 背景

阶段 4 验收（D-193）：用户指南写「无沙箱 Agent 仅支持 HTTP MCP」，用户据此理解为有沙箱 Agent 可以用 stdio MCP，实际做不到。决策时的事实：

| # | 事实 | 证据 |
| --- | --- | --- |
| F1 | Agent 画布上的 MCP Tool 绑定在 sandbox 会话里由服务端执行：guest 经远程工具回调进入 `SandboxToolRegistryService`，再由 `McpService.callRuntimeTool` 在 server / worker 容器内 spawn stdio 命令 | `agentloom-server/src/modules/agent/sandbox-tool-registry.service.ts`、`agentloom-server/src/modules/mcp/mcp.service.ts` |
| F2 | 服务端 stdio 受 `APP_MCP_STDIO_ENABLED` 守卫，多租户部署必须关闭；线上为关闭，回调返回 403 `mcp/stdio-disabled` | [安全模型](/dev/server/security#服务端进程执行)、C4MCP 报告 2.4 |
| F3 | 即使开启，`server-filesystem /workspace` 看到的是服务端容器的 `/workspace`，不是沙箱工作区 | C4MCP 报告 D-1 |
| F4 | guest 已能启动 MCP：`/v1/session` 的 `mcpServers` 被写成 `@deepseek-ai/dsh-mcp-client` 条目，在 VM 内 spawn stdio 进程；workflow Agent 节点（`workflowContext.mcpServers`）与 Harness profile patch 已在用 | `agentloom-deploy/sandbox/src/dsh/profile-writer.ts`、`agentloom-server/src/modules/execution/node-executors/sub-agent-node.executor.ts`、C4MCP 报告 2.5–2.6 |
| F5 | dsh-mcp-client 按服务器注册全部工具，名为 `mcp__<serverName>__<工具名>`，没有工具白名单配置 | `@deepseek-ai/dsh-mcp-client` README 与 `Config` schema |
| F6 | 导入 stdio 服务器需要服务端连接一次以发现工具，没有 VM 可用 | `McpService.discoverToolsForConnection` |

## 决策

| 议题 | 选择 | 被否决的方案及原因 |
| --- | --- | --- |
| 运行位置 | 会话绑定 microVM 且 Agent 不是 `no_sandbox` 时，`SandboxAgentAdapter.createSession` 把 stdio 配置的 MCP 绑定解析为连接，作为 `mcpServers` 随 `/v1/session` 下发，由 guest 的 dsh-mcp-client 在 VM 内启动；服务端远程工具集不再注册这些绑定 | **只改文档、继续服务端执行**：多租户部署永远用不了，开启时 `/workspace` 语义也是错的（F2、F3）；**在 guest 内自写 MCP 客户端、按画布绑定逐个注册工具**：重复 dsh-mcp-client 的连接监督、重连与图片投影（F4），guest 维护面翻倍 |
| 传输分流 | 只有 stdio 进 guest；SSE / Streamable HTTP 仍由服务端代调 | **全部进 guest**：服务端能访问的内网地址 guest 不一定能访问，HTTP 绑定今天可用，没有理由改变 |
| 服务器名 | 配置名称规范化为 `[A-Za-z0-9_-]{1,32}`，冲突或无有效字符时追加配置 ID 末 8 位 | **用配置 ID**（workflow 路径的做法）：工具名变成 `mcp__01a15925-9b29-…__x`，模型难以理解 |
| 工具范围 | 暴露服务器全部工具，节点上的工具勾选与参数覆盖对 stdio 不生效，写进用户指南 | **guest 用 guard 拦截未勾选工具**：需要复刻 dsh 的公开名规范化（含哈希截断）才能匹配，dsh 升级即失配；且模型仍会看到被拦的工具。沙箱内 Agent 本有终端，工具勾选不构成隔离边界 |
| 服务端开关 | `APP_MCP_STDIO_ENABLED` 只约束服务端 spawn：测试、发现、导入、改连接（`updateConfig`，D-196）与服务端代调；guest 内启动不受它约束 | **guest 路径也受开关约束**：开关防的是服务端被执行任意命令，VM 内执行与 bash 工具同级 |
| 解析失败 | 配置不存在等错误只记 warn，绑定留在服务端工具集，调用时按原路径报错 | **让会话创建失败**：一个失效的 MCP 节点会拖垮整个对话 |

## 后果

- 开启 `APP_MCP_STDIO_ENABLED` 的部署：有沙箱 Agent 的 stdio MCP 在用户自己的 VM 里运行，`/workspace` 即沙箱工作区，运行时不再在服务端 spawn。
- 未开启的部署仍无法导入 stdio 服务器（F6），用户改用 Harness profile patch 直接插入 dsh-mcp-client 条目（[Harness 与 Runtime 插件](/guide/agents/harness#在沙箱里接入-stdio-mcp-服务器)）。
- stdio 配置的 env（含解密后的凭据）随会话进入 VM，与 workflow 路径一致。
- 模型看到的 stdio 工具名从画布上的工具名变为 `mcp__<serverName>__<工具名>`；依赖旧名称的提示词需要调整。
- 会话初始化多一次按配置的读库；带 `mcpServers` 的会话使用更长的初始化超时（90 s / 120 s），首次 `npx` 下载会让首轮变慢。

## 确认方式

- 单测：`agentloom-server/src/modules/agent/__tests__/sandbox-agent.adapter.spec.ts` 中「sandbox 会话把 stdio MCP 绑定作为 mcpServers 下发给 guest」等四条用例。
- 线上：有沙箱 Agent 连接一个 stdio `server-filesystem /workspace` 的 MCP Tool 节点，对话中先用终端写文件，再调用 `mcp__<服务器名>__list_directory` 能看到该文件；server 日志中没有该会话的 `tool-executions` 回调。
