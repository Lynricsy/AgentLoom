# Resource Management List Semantics

> Workspace / Sandbox 资源列表语义、Agent sandbox timeout 双字段约定，以及 conversation sandbox 回收事件契约。

---

## 1. Scope / Trigger

- 触发条件：
  - 修改 `workspace` / `sandbox` 资源列表 API
  - 修改 sandbox stats API 或对话沙箱 stats API
  - 修改 Agent sandbox timeout 编译或 lifecycle worker 调度
  - 修改 conversation 结束后 sandbox 回收链路

---

## 2. Signatures

- `AgentConversationService.cancel(conversationId)`
- `AgentConversationService.end(conversationId)`
- `AgentDefinitionService.extractSandboxConfig(data): AgentRuntimeConfig['sandboxConfig'] | null`
- `deriveAgentSandboxConfigFromCanvas(nodes, edges, fallbackConfig): SandboxConfig | null`
- `resolveAgentRuntimeSandboxConfig(config?: SandboxConfig | null): SandboxConfig`
- `resolveSandboxTimeoutDelayMs(config): number`
- `WorkspaceService.findAll(tenantId, { page?, pageSize?, search?, includeAutoArchived? })`
- `WorkspaceService.findOne(tenantId, workspaceId)`
- `SandboxService.listSandboxes(tenantId, { page, pageSize, status?, lifecycleMode?, bindingType?, search? })`
- `SandboxService.getContainerStats(sessionId)`
- `SandboxService.getConversationSandboxStats(agentConversationId, tenantId)`
- `DockerService.getContainerStats(containerId)`
- `GET /api/v1/sandboxes/:sessionId/stats`
- `GET /api/v1/agent-conversations/:id/sandbox/stats`

### Query DTOs

- `ListWorkspacesQueryDto`
  - `includeAutoArchived`
  - `include_auto_archived`
- `ListSandboxesQueryDto`
  - `pageSize` / `page_size`
  - `lifecycleMode` / `lifecycle_mode`
  - `bindingType` / `binding_type`

---

## 3. Contracts

### 3.1 Conversation sandbox cleanup

- `cancel()` 与 `end()` 都必须走同一条 `agent-conversation.ended` 发射链路。
- 当存在 tenant transaction 时，`agent-conversation.ended` 必须通过 `registerAfterCommitHook()` 延后到事务提交后再发。
- `WorkspaceIntegrationService.handleConversationEnded()` 继续以 `agent-conversation.ended` 作为唯一入口，先尝试保存目录树快照，再释放 conversation sandbox。

### 3.2 Agent sandbox timeout

- `SandboxConfig.timeout` 仍保留为**小时字段**，用于 persistent / legacy runtime。
- Agent 画布来源的 timeout 语义是 `timeoutSeconds`。
- `AgentDefinitionService.extractSandboxConfig()` 的规则：
  - 若显式提供 `timeoutSeconds`，编译结果必须写入：
    - `timeoutSeconds`
    - `timeout = ceil(timeoutSeconds / 3600)`，仅作为兼容回填
  - 若未提供 `timeoutSeconds`，但也没有 legacy `timeout`，默认视为 Agent session 秒级 timeout：
    - `timeoutSeconds = 300`
    - `timeout = 1`
  - 只有显式 legacy `timeout(hours)` 且不存在 `timeoutSeconds` 时，才继续沿用小时语义
- `SandboxLifecycleWorker` 调度 timeout check 时，必须优先使用 `timeoutSeconds`；不存在时才回退到 `timeout(hours)`
- `agent_definitions.sandbox_config` 与 `agent_versions.snapshot.sandboxConfig` 属于 persisted mirror，不应被视为绝对真源；当旧记录缺失 `timeoutSeconds` 时，detail response、version response 和 runtime 启动链都必须优先根据 canvas / snapshot 的 `nodes + edges` 重新推导 canonical sandboxConfig，再只把 persisted mirror 作为 fallback

### 3.3 Workspace list semantics

- Workspace 列表项必须派生：
  - `sourceKind = 'manual' | 'sandbox_snapshot' | 'execution_archive'`
  - `isAutoArchived: boolean`
- 派生规则：
  - 名称命中 `execution-*-step-*-workspace` → `execution_archive`
  - 否则 `config.sourceSandboxSessionId` 存在 → `sandbox_snapshot`
  - 其余 → `manual`
- `includeAutoArchived=false` 时，API 必须过滤 `execution_archive`
- Query DTO 不能使用裸 `z.coerce.boolean()` 解析布尔筛选，因为 query string `'false'` 会被错误地当成 `true`；必须显式把 `'true'/'false'` 规范化后再进入 `z.boolean()`
- `create()` / `findOne()` / `findAll()` 都应返回 enrichment 后的 workspace 数据，避免前端列表与详情语义漂移

### 3.4 Sandbox list semantics

- Sandbox 列表项必须派生：
  - `bindingType = 'resource' | 'conversation' | 'execution'`
- 派生规则：
  - `agentConversationId != null` → `conversation`
  - 否则 `executionId != null` → `execution`
  - 否则 → `resource`
- `bindingType` 过滤必须在 SQL where 层生效，不能只在分页后内存过滤
- persistent sandbox 命中 timeout/expiry 时，资源状态必须视为**自动停止**：
  - `sandbox_sessions.status = 'stopped'`
  - 允许后续通过 `startSandbox()` 或 attach 恢复
  - 只有真实创建/运行失败才应保留 `failed`
  - 若 timeout 同时打断 workflow / agent 执行，失败语义只属于上层 execution / conversation，不应把资源沙箱本体标记成 `failed`

### 3.5 Sandbox stats semantics

- `ContainerStats` 的 canonical 字段为：
  - `cpuPercent`
  - `memoryUsageMb`
  - `memoryLimitMb`
  - `diskUsage?`
  - `diskTotal?`
- `cpuPercent / memory*` 继续来自 Docker container stats。
- `diskUsage` 表示 `/workspace` 内实际文件占用的**字节数**，不是配置磁盘配额，也不是 UI 猜测值。
  - 允许通过容器内命令统计文件总大小。
  - 统计失败时允许省略 `diskUsage`，但**禁止**把“未知”伪装成 `0`。
- `diskTotal` 表示 session config 中配置的磁盘配额，单位为字节：
  - `diskTotal = session.config.disk * 1024^3`
  - 只有在 `diskUsage` 成功得到时，才应一起返回 `diskTotal`
- `GET /sandboxes/:sessionId/stats` 与 `GET /agent-conversations/:id/sandbox/stats` 必须复用同一 `ContainerStats` contract。
- conversation sandbox stats 必须通过 `SandboxService.findByConversationId()` 定位 active session，而不是让前端自行扫资源列表。
- 前端看到缺失的 `diskUsage/diskTotal` 时，必须按“不可用/未知”处理，不能自行回退成 `0 B`。

---

## 4. Validation Matrix

| 场景 | 期望 | 验证点 |
| --- | --- | --- |
| conversation 走 `cancel()` | 事务提交后仍会触发 `agent-conversation.ended` | `agent-conversation.service.spec.ts` |
| Agent sandbox `timeoutSeconds=901` | 编译后 `timeoutSeconds=901` 且兼容回填 `timeout=1` | `agent-definition.service.spec.ts` |
| Agent sandbox 未显式配置 timeout | 默认得到 `timeoutSeconds=300` + `timeout=1` | `agent-definition.service.spec.ts` |
| lifecycle create job 含 `timeoutSeconds=300` | timeout check delay = `300_000ms` | `sandbox-lifecycle.worker.spec.ts` |
| 旧 published snapshot 只有 `sandboxConfig.timeout=450`，但节点仍有 `timeoutSeconds=450` | detail / versions / runtime 都必须恢复成 `timeout=1 + timeoutSeconds=450` | `agent-definition-response.dto.spec.ts`, `agent-execution.worker.spec.ts`, `workflow-agent-adapter.spec.ts` |
| workspace list 默认过滤 execution archive | API 仍返回 `sourceKind`，但 `execution_archive` 被排除 | `workspace.service.spec.ts` |
| `includeAutoArchived=false` query string | DTO 必须把 `'false'` 解析成 `false`，不能回退成 truthy | `list-workspaces-query.dto.spec.ts` |
| sandbox list `bindingType=resource` | SQL where 同时要求 `execution_id is null` + `agent_conversation_id is null` | `sandbox.service.spec.ts` |
| persistent resource sandbox timeout | 资源状态应落为 `stopped`，而不是 `failed` | `sandbox-lifecycle.worker.spec.ts` |
| running sandbox stats 成功拿到 workspace usage | 返回 `diskUsage(bytes)`，service 补齐 `diskTotal(bytes)` | `docker.service.spec.ts`, `sandbox.service.spec.ts` |
| workspace usage 统计失败 | 仍返回 CPU/内存，且不伪造 `diskUsage=0` | `docker.service.spec.ts` |
| conversation sandbox stats 查询 | `GET /agent-conversations/:id/sandbox/stats` 返回与资源页一致的 `ContainerStats` | `agent-conversation.controller.spec.ts` |

---

## 5. Test Points

- `src/modules/agent-conversation/agent-conversation.service.spec.ts`
- `src/modules/agent-definition/agent-definition.service.spec.ts`
- `src/modules/workspace/__tests__/workspace.service.spec.ts`
- `src/modules/workspace/dto/list-workspaces-query.dto.spec.ts`
- `src/modules/agent-conversation/agent-conversation.controller.spec.ts`
- `src/modules/sandbox/__tests__/docker.service.spec.ts`
- `src/modules/sandbox/__tests__/sandbox.service.spec.ts`
- `src/modules/sandbox/__tests__/sandbox-lifecycle.worker.spec.ts`
