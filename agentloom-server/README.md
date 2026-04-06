# AgentLoom Server

AgentLoom Server 是基于 **NestJS 11 + Fastify 5** 的多租户后端服务，负责工作流定义、执行调度、通知、审计、资源治理、插件沙箱、知识库与开放 API。

## 当前能力概览

- **双重认证**：Bearer JWT 优先，`X-Api-Key` 回退；RBAC 角色为 `owner > admin > creator > operator > viewer`
- **执行引擎**：`ExecutionService.runWorkflow()` 作为新执行权威入口，BullMQ 驱动 DAG 调度、断点恢复与人工介入
- **HTTP Tool 运行时兼容**：`NodeSchedulerService.buildHttpToolRequestInput()` 同时兼容 `queryParams` 与 `query_params` 静态查询参数字段，避免 workflow 快照在 snake_case / camelCase 序列化差异下丢失 query string
- **Agent 双运行态**：Agent 创建时显式持久化 `runtimeMode = sandbox | no_sandbox`；顶层 `no_sandbox` Agent 与 workflow `agent` 节点走 `InProcessAgentAdapter -> PiAgentCoreAdapter -> pi-agent-core`，仍支持 Skill、知识库、Memory、HTTP MCP 与自进化；普通运行时工具调用默认自动继续，不再进入人工审批，只有自进化写操作（当前为 `apply_change` / `create_resource`）仍会进入 `awaiting_permission`；`sandbox` Agent 继续走容器化 `SandboxAgentAdapter`，且 direct conversation sandbox 支持按 `conversationIdleAutoEndMinutes` 在空闲一段时间后自动 `end()` 对话
- **Agent / Workflow 输入节点规范化**：Agent 画布与 workflow `agent` 的系统提示词以 `text -> system-prompt-in` 为 canonical 来源；`sub-agent` 编译结果收敛为 `overrides { systemPrompt, modelConfig, routingConfig, outputSchema } + extensions { tools, knowledgeBindings, subAgents, memoryInstanceIds, skillIds }`，且不允许覆盖 sandbox。分享导入与 `db:migrate:agent-input-nodes` 预迁移脚本会把旧 `systemPrompt` 字段与 legacy `text/json` 句柄收敛到新结构
- **Agent 首发消息创建**：`POST /agent-definitions/:agentId/conversations/start` 是 Web / Mobile 新对话页的 canonical 首发接口；服务端会在单次数据库事务内完成 Agent 校验、conversation 插入、首条 user message 插入与 `updatedAt` 更新时间，避免首发失败时残留零消息空会话
- **Agent 对话附件**：`POST /agent-conversations/:id/messages` 与 `POST /agent-definitions/:agentId/conversations/start` 现以 `metadata.attachments[]` 作为 canonical 多附件负载，并继续兼容 legacy `metadata.attachment`；单条 user message 可同时携带文本、多个图片和多个文件，单附件上限 `1.5 MB`、单消息附件总量上限 `10 MB`、文本内联上限 `200 KB`；文本文件优先以内联 `resource` block 进入 runtime，图片使用 `image` block，sandbox conversation 会 best-effort 为每个附件写入 `/workspace/uploads/...` 并把工作区路径提示补入 prompt；为避免 base64 图片在 transport 层先被 `413` 拦截，Fastify `bodyLimit` 与 Socket.IO `maxHttpBufferSize` 均已提升到覆盖附件实际传输体积的上限
- **历史空会话清理**：`src/database/migrations/0067_purge_empty_agent_conversations.sql` 会一次性删除没有任何 `agent_messages` 的历史 `agent_conversations`；运行时不保留自动清理任务，后续依赖延迟创建语义本身避免新增脏数据
- **资源治理**：`tenant_quotas` + `execution_governance_controls` typed store，覆盖 `maxConcurrentExecutions`、`dailyExecutionLimit`、`dailyApiCallLimit`、`storageQuotaMb`、`apiRateLimitPerMinute`、`maxSandboxCpuPercent`、`maxSandboxMemoryMb`
- **租户级 API 治理**：`CustomThrottlerGuard` 对 JWT 与 API key 请求解析 tenant，分钟级 `apiRateLimitPerMinute` 返回 `429 + Retry-After + X-RateLimit-*`，日配额和其它治理阻断返回 `409 ResourceGovernanceDecisionBlockedException`
- **治理操作链路**：支持 quota 更新、tenant/workflow governance pause、anomalous execution termination、正式 audit、治理事件与结构化通知
- **运行监控聚合**：`GET /organizations/:id/monitoring` 为 owner/admin 提供组织级只读 dashboard，聚合 execution summary、governance state、notifications、audit logs 与当前 `agent-task` queue snapshot；趋势图聚焦执行趋势，队列深度只表示当前 snapshot，支持 `15m|1h|24h` 窗口
- **通知系统**：REST + BullMQ + `/notification` Socket.IO + FCM，资源治理通知类型包括 `resource_governance_execution_blocked`、`resource_governance_quota_updated`、`resource_governance_controls_updated`、`resource_governance_execution_terminated`
- **审计与证据**：`AuditLogService.record()` 负责 append-only 审计写入，evidence 域支持 hot/archive 回查与资源序列查询
- **Workspace 快照预览**：`WorkspaceModule` 现在除了列表/详情元数据外，还提供 `tree` / `preview` / `raw` / `files` 读取与文本保存语义，支持持久化 workspace 的目录树、Monaco 文本预览/编辑、图片/PDF 预览以及 unsupported 文件下载兜底
- **LLM Provider 凭据**：Provider create/update 与私有云原始测试接口支持直接接收明文 `apiKey`；服务端会把明文写入受管 `api_keys` 密文记录，再继续以内联 `api_key_id` / 默认 key 解密链路供运行时使用
- **MCP 运行约束**：`no_sandbox` Agent 只允许 HTTP MCP；stdio MCP 在版本创建/发布校验与 runtime 调用层都会被 fail-closed；对于 workflow，`no_sandbox` Agent 若通过 `tools-in` 接到 `stdio` 的 `mcp-tool` 节点，会在 `WorkflowVersionService.publish()` 阶段直接 422 阻断
- **ACP stdio 网关**：`src/modules/acp-gateway/` + `src/acp-stdio.ts` 提供独立 ACP JSON-RPC stdio 入口，支持 initialize、严格协议版本协商、JWT authenticate、连接级 `session/new` / `session/load` / `session/prompt` / `session/cancel`、真实 `fs/read_text_file` / `fs/write_text_file` surface、真实 `terminal/create` / `terminal/output` / `terminal/wait_for_exit` / `terminal/kill` / `terminal/release` surface、runtime `session/update` notifications、官方 `session/request_permission` request/response，以及读取并发/写出串行的 stdout 协议流隔离；initialize 对外使用 canonical `fs: { readTextFile, writeTextFile }`，并仅在 client 同时声明 `terminal.create=true` 与 `terminal.output=true` 时暴露粗粒度 `terminal: { create: true }` 总开关，同时兼容 legacy `read/write` initialize 输入；文件读取既可走 client-proxy ACP transport，也可在 session 绑定 `serverSandbox.executionId` 时走 ACP-local sandbox workspace，文件写入会先进入 `session/request_permission` 再继续实际写入；terminal 生命周期绑定到 conversation session，默认 1MB ring buffer、每 session 最多 5 个并发 terminal、默认 300s lifetime timeout kill、spawn 前危险 command/pattern/path/cwd 拒绝与正式审计、per-request `outputByteLimit` bounded retrieval、对 exited/killed terminal 返回稳定 output-unavailable error、request-local wait timeout / server lifetime timeout 的稳定错误语义、manual kill 与 cleanup kill 审计、`session/cancel` / stdio 连接关闭 cleanup，以及 durable terminal continuity + cold-recovery fail-closed `session/load` 语义；`server_sandbox` 现落实 `/workspace/` 边界、`realpath` / symlink / traversal 检查、10MB 默认上限、binary default-deny 与正式审计；conversation session 通过 durable `acp_conversation_sessions`（`session_snapshot` + ordered `replay_entries`）实现历史恢复，并在 `session/load` 中遵循 replay-before-response

## 关键模块

| 模块                    | 路径                                   | 说明                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ----------------------- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| execution               | `src/modules/execution/`               | 工作流执行、DAG 调度、resume/intervention/cancel                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| resource-governance     | `src/modules/resource-governance/`     | 资源配额、治理暂停、治理动作 API、blocked decision explain                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| monitoring              | `src/modules/monitoring/`              | 组织级只读监控聚合 API：执行趋势 + 当前队列快照摘要 + alerts/hotspots/risk summary                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| notification            | `src/modules/notification/`            | 通知 REST、BullMQ processor、Socket.IO `/notification`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| evidence                | `src/modules/evidence/`                | 审计日志、证据链、完整性校验                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| trigger                 | `src/modules/trigger/`                 | cron / webhook / api_event(预览) 触发链路                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| plugin                  | `src/modules/plugin/`                  | `.alp` 上传、签名校验、Extism WASM 沙箱、收益结算                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| optimization-suggestion | `src/modules/optimization-suggestion/` | 周期分析执行遥测并生成可应用建议                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| acp-gateway             | `src/modules/acp-gateway/`             | ACP stdio 协议适配、连接级 session registry、严格 initialize 版本协商、authenticate、`session/new` / `session/load` / `session/prompt` / `session/cancel`、真实 `fs/read_text_file` / `fs/write_text_file` client-proxy + server-sandbox surface、真实 `terminal/create` / `terminal/output` / `terminal/wait_for_exit` / `terminal/kill` / `terminal/release` server-sandbox surface、canonical `readTextFile` / `writeTextFile` 能力协商，以及仅在 client 同时启用 `terminal.create` 与 `terminal.output` 时暴露的粗粒度 `terminal: { create: true }` 总开关、写入前 `session/request_permission` bridge、基于 `sandbox_sessions` 的 ACP-local sandbox workspace 解析、`/workspace/` 边界 + `realpath` / symlink / traversal / oversize / binary guardrails、session-bound terminal registry + durable continuity metadata、默认 1MB ring buffer / 5 并发 / 300s timeout kill / denylist 审计、runtime 事件到 `session/update` / `stopReason` 的映射、ordered history replay 与 cold-recovery fail-closed，以及 JSON-RPC 2.0 错误映射 |
| sandbox                 | `src/modules/sandbox/`                 | 沙箱生命周期与运行时装配；persistent sandbox 的显式 `stop` / timeout 只会停止容器并保留 `containerId`，后续 `startSandbox()` 会优先复用同一容器，只有 `deleteSandbox()` 才会 remove 容器并删除记录。direct conversation 的 sandbox config 还支持 `conversationIdleAutoEndMinutes`：当该 sandbox 下所有 active conversation 都无运行中 loop 且无未处理消息时，会由 delayed job 自动 `end()` conversation，再复用既有 ended 链路做 destroy/detach。当前默认通过 `SANDBOX_RUNTIME_DRIVER` token 绑定 `DockerService`，让 agent / workspace / ACP 等消费方先依赖抽象驱动，为后续扩展其他 runtime 预留切口                                                                                                                                                                                                                                                                                                                                                                                                                                   |

## 本地开发

```bash
pnpm install
pnpm start:dev
pnpm start:acp:stdio
```

`pnpm start:acp:stdio` 会先通过 `scripts/start-acp-stdio.mjs` 静默构建，再运行编译后的 `dist/src/acp-stdio.js`，避免 direct `tsx` 入口丢失 Nest DI 所需的 decorator metadata。

Swagger 文档：`/docs`

## 常用命令

```bash
pnpm test                          # Vitest 单元测试
pnpm test:e2e                     # E2E 测试（Testcontainers）
pnpm start:acp:stdio              # ACP stdio 独立入口
pnpm test:e2e -- resource-governance
pnpm test:e2e -- monitoring
pnpm test:cov                     # 覆盖率（80% 阈值）
pnpm db:migrate:agent-input-nodes # 预迁移 Agent / Workflow 输入节点到新图结构
pnpm db:generate                  # 生成 Drizzle migration
pnpm db:migrate                   # 执行 migration
pnpm db:seed                      # 导入种子数据
pnpm build                        # nest build
pnpm openapi:export               # 导出 OpenAPI 3.0 spec
pnpm sdk:generate                 # 生成 TypeScript / Python SDK
```

## E2E 说明

- `pnpm test:e2e` 现通过 `scripts/run-e2e.mjs` 包装 Vitest，确保 `pnpm test:e2e -- <pattern>` 能正确前传文件过滤参数
- `test/acp-stdio.e2e-spec.ts` 先构建 ACP 编译入口，再通过 `scripts/run-acp-stdio-e2e-helper.mjs` 在 Vitest 外驱动 stdio 对话；helper 会设置 `ACP_TEST_FAKE_RUNTIME=1` 并启用 host-side fake exec，验证 unsupported protocol version → `Invalid params`、canonical initialize 能力协商（兼容 legacy alias）、`initialized` notification 静默、authenticate、`session/new` / `session/prompt` / `session/update` 主链、真实 `fs/read_text_file` / `fs/write_text_file` client-proxy surface、写入前 `session/request_permission` allow/deny/cancel、真实 `server_sandbox` read/write success、`terminal/create + bounded output + wait_for_exit` success、危险参数/路径 reject、exited/killed terminal output unavailable、request-local wait timeout 与 server lifetime timeout 的稳定错误、manual kill / `session/cancel` cleanup killed audit、explicit release 后 output not-found、`session/load` 对 active terminal continuity 的 cold-recovery fail-closed、traversal / oversize / binary reject、parse error、非法 `id` invalid request、revoked token 与 stdout hygiene。
- `test/resource-governance.e2e-spec.ts` 会在 testcontainer 数据库内 bootstrap 资源治理缺失的 enum / table / grant / policy，并额外清理 `notifications`、`notification_preferences`、`workflow_executions`、`workflow_versions`、`execution_steps` 等扩展表
- `test/monitoring.e2e-spec.ts` 复用同一套 Testcontainers/RLS 基建，校验 monitoring route 的 owner/admin 门禁、时间窗口刷新与 deep-link contract

## 资源治理补充事实

- `ExecutionService.runWorkflow()` 在写入 `workflow_executions` 之前调用 `ResourceGovernanceService.resolveExecutionAdmissionDecision()`，block 时不会插入 execution 行，也不会 enqueue job
- `CustomThrottlerGuard` 对 API key 路径通过 `PlatformApiTokenService.validateToken()` 懒解析 tenant / user 信息，再应用 tenant-aware API quota
- blocked audit 使用独立事务写入，避免与请求事务一起回滚
- quota updated / controls updated / execution terminated 等治理事件在事务提交后再 emit，通知 listener 使用独立 tenant transaction 写入通知，避免 side effect 污染当前请求事务

## 环境变量

关键变量见 `.env.example`，常用项包括：

- `APP_DATABASE_URL`
- `APP_SUPABASE_URL`
- `APP_SUPABASE_ANON_KEY`
- `APP_SUPABASE_SERVICE_ROLE_KEY`
- `APP_JWT_SECRET`
- `APP_REDIS_URL`
- `APP_MASTER_ENCRYPTION_KEY`
- `APP_MINIO_*`
- `APP_QDRANT_URL`
- `FIREBASE_SERVICE_ACCOUNT`

## 相关文档

- `AGENTS.md`：持久化架构知识库
- `src/modules/resource-governance/`：资源治理后端实现
- `src/modules/monitoring/`：组织级只读监控聚合实现
- `test/resource-governance.e2e-spec.ts`：资源治理 E2E
- `test/monitoring.e2e-spec.ts`：组织级监控 E2E
- `src/database/schema/tenant-quotas.schema.ts`
- `src/database/schema/execution-governance-controls.schema.ts`
