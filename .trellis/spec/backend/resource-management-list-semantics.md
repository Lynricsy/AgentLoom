# Resource Management List Semantics

> Workspace / Sandbox 资源列表语义、Agent sandbox timeout / idle-auto-end 配置约定，以及 conversation sandbox 回收事件契约。

---

## 1. Scope / Trigger

- 触发条件：
  - 修改 `workspace` / `sandbox` 资源列表 API
- 修改 sandbox stats API 或对话沙箱 stats API
- 修改 Agent sandbox timeout 编译或 lifecycle worker 调度
- 修改 conversation 结束后 sandbox 回收链路
- 修改 workflow / agent / knowledge / memory / mcp / skill 列表的分享来源语义
- 修改 `src/modules/resource-source/` 中的来源记录与转正逻辑

---

## 2. Signatures

- `AgentConversationService.cancel(conversationId)`
- `AgentConversationService.end(conversationId)`
- `AgentDefinitionService.extractSandboxConfig(data): AgentRuntimeConfig['sandboxConfig'] | null`
- `deriveAgentSandboxConfigFromCanvas(nodes, edges, fallbackConfig): SandboxConfig | null`
- `resolveAgentRuntimeSandboxConfig(config?: SandboxConfig | null): SandboxConfig`
- `resolveSandboxTimeoutDelayMs(config): number`
- `resolveSandboxConversationIdleAutoEndDelayMs(config): number`
- `WorkspaceService.syncFromSandboxContainer(workspaceId, containerId, tenantId)`
- `WorkspaceService.findAll(tenantId, { page?, pageSize?, search?, includeAutoArchived? })`
- `WorkspaceService.findOne(tenantId, workspaceId)`
- `WorkspaceService.getFileTree(tenantId, workspaceId)`
- `WorkspaceService.getFilePreview(tenantId, workspaceId, filePath)`
- `WorkspaceService.getFileAsset(tenantId, workspaceId, filePath)`
- `WorkspaceIntegrationService.archiveExecutionStepWorkspace(executionId, stepId, tenantId, sandboxNodeId?)`
- `SandboxService.listSandboxes(tenantId, { page, pageSize, status?, lifecycleMode?, bindingType?, search? })`
- `SandboxService.getContainerStats(sessionId)`
- `SandboxService.getConversationSandboxStats(agentConversationId, tenantId)`
- `SandboxService.scheduleConversationIdleAutoEnd(agentConversationId, tenantId)`
- `SandboxService.cancelConversationIdleAutoEnd(agentConversationId, tenantId)`
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
- direct Agent conversation 的 sandbox config 新增 `conversationIdleAutoEndMinutes`：
  - 缺省值视为 `10`
  - 该字段只作用于 `agentConversationId` 绑定的 sandbox session；workflow `execution` 绑定不会消费该字段
  - session sandbox 与 persistent sandbox 都必须支持该配置
- `agent-conversation.message-sent` 之后，若当前 conversation 绑定 sandbox，必须取消对应 sandbox session 的 idle auto-end delayed job；当存在 tenant transaction 时，这个取消动作必须延迟到事务提交后再执行。
- sandbox conversation 一轮执行结束后，只要 conversation 仍为 `active` 且不是 `cancelled`，都必须按该 sandbox session 的 `conversationIdleAutoEndMinutes` 重新调度 delayed idle-end check。
- idle-end check 只能在以下条件都满足时自动 `end()` conversation：
  - sandbox 仍处于 active 状态（不是 `stopping/stopped/failed`）
  - sandbox 当前绑定的所有 active conversation 都没有运行中的 execution loop
  - 所有 active conversation 都不存在未处理的 user message
  - 对于多 binding persistent sandbox，必须以“该 sandbox 下所有 active conversation 都已空闲”为整体判断条件，而不是逐个 conversation 独立结束
- idle-end check 自动结束 conversation 后，后续 sandbox 清理仍沿用现有 ended 链路：
  - session lifecycle → destroy conversation sandbox
  - persistent lifecycle → detach conversation binding，资源回到 `ready/idle`

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
- `SandboxConfig.conversationIdleAutoEndMinutes` 也必须遵循相同约定：
  - Agent 画布来源与 persistent sandbox 资源创建来源都允许配置该字段
  - 旧记录缺失该字段时，runtime 与 detail response 必须回退到默认值 `10`

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
- 空 workspace 也必须预留该 `workspaceId` 自己的 canonical `storageKey = .../workspaces/<workspaceId>/snapshot.tar`：
  - 禁止继续创建共享 `.../workspaces/empty/snapshot.tar` 这类跨 workspace 复用对象路径
  - 若历史记录仍指向 legacy shared-empty key，后续 `findOne/tree/preview/raw/files` 读取或写回路径必须先把记录 re-home 到自身 canonical key，再继续处理
  - 对仍未 re-home 的 legacy shared-empty 记录，删除 workspace 时不能直接删除共享对象，避免误伤其他历史记录
- 若 sandbox config 带 `restoreWorkspaceId`，该 workspace 必须被视为“最新可恢复快照”：
  - `SandboxLifecycleWorker.handleStop()` / `handleDestroy()` / `handleTimeoutCheck()` 在 stop/remove 容器前，必须调用 `WorkspaceService.syncFromSandboxContainer(restoreWorkspaceId, containerId, tenantId)`。
  - 回写只能覆盖同一条 `workspace_snapshots` 记录与既有 `storageKey`，不能额外插入“旧版本” workspace 行。
  - 回写失败只能记录 warning，不能阻断 stop / destroy / timeout 主流程。
- `WorkspaceIntegrationService.archiveExecutionStepWorkspace()` 必须区分两类 workflow step：
  - live sandbox `config.restoreWorkspaceId` 存在：同步回原 workspace，并返回同一个 `workspaceSnapshotId`
  - live sandbox 未绑定现有 workspace：才允许 `createFromSandbox()` 新建 `execution-*-step-*-workspace`
- workflow step 的 `checkpointData.workspaceSnapshotId` 必须始终指向“当前这一步结束后可回放的最新快照”：
  - 绑定已有 workspace 时，它指向原 `restoreWorkspaceId`
  - 未绑定已有 workspace 时，它指向新建的 `execution_archive`
- workspace 详情页的 `tree / preview / raw` 读取不得再把“整包 tar 体积”当成统一拦截条件：
  - `GET /workspaces/:id/tree` 必须能够对大 workspace snapshot 做流式 tar 扫描并返回目录树，不能因为归档超过某个内存预览阈值就直接 404。
  - `GET /workspaces/:id/preview/*` 与 `GET /workspaces/:id/raw/*` 必须按目标路径流式定位单个 entry，而不是先把整个 tar 读入内存。
  - 文本内容的在线预览限制仍然只作用于“单个目标文件”，例如 `MAX_WORKSPACE_TEXT_PREVIEW_BYTES`；它不能反向把整个 workspace 的目录树预览一起打成空白。
- workspace 文本文件保存语义：
  - `PUT /workspaces/:id/files/*` 只允许更新 UTF-8 文本文件。
  - 保存时必须保持同一条 `workspace_snapshots` 记录与既有 `storageKey`，不能额外创建新 workspace 版本。
  - server 必须重新打包并覆盖上传最新 tar，同时更新 `sizeBytes/updatedAt`。
  - 对二进制文件、超出文本预览限制或不可识别为文本的 entry，必须返回 400，而不是伪装成成功写回。

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
  - 运行中的容器只执行 `stop`，**不能**自动 `remove`
  - 已停止的 `containerId` / workspace 需要保留，供后续 `startSandbox()` 直接复用同一容器
  - 允许后续通过 `startSandbox()` 或 attach 恢复
  - 只有真实创建/运行失败才应保留 `failed`
  - 若 timeout 同时打断 workflow / agent 执行，失败语义只属于上层 execution / conversation，不应把资源沙箱本体标记成 `failed`
- persistent sandbox 的显式 `stop` 语义与 timeout/expiry 一致：
  - `stopSandbox()` 只停止容器并把状态置为 `stopped`
  - `deleteSandbox()` 才是 remove 容器并删除 session/log 的唯一正式入口
- 若 persistent sandbox 处于 `stopped` 且数据库仍保留 `containerId`，但 lifecycle `start` 实际命中 `No such container`：
  - worker 必须回退为“按同一 `sessionId` 重建新容器”，而不是把整个 sandbox 直接打成 `failed`
  - 重建成功后必须回写新的 `containerId`，并继续走 `ready + attachLogs + timeout/idle-end 调度` 正常收口
  - 这样外部误删旧容器时，persistent sandbox 仍能依赖既有 workspace volume 自愈重启

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

### 3.6 Share-imported resource source semantics

- 共享来源记录统一保存在 `resource_source_records`，而不是散落到 workflow / agent / knowledge / memory / mcp / skill 各表。
- `recordImportedResources()` 写入的 canonical 字段为：
  - `originKind='share_imported'`
  - `currentKind='share_imported'`
  - `sourceShareType`
  - `sourceShareId`
  - `sourceShareToken`
  - `sourceResourceType`
  - `sourceResourceId`
  - `sourceResourceTitle`
- workflow / agent 列表与详情必须通过 `mapCurrentKinds()` 把当前来源映射为 `resourceSourceKind`。
- knowledge base / memory instance / mcp server config / skill 列表与详情必须通过同一套来源记录映射 `sourceKind`。
- `sourceKind=share_imported` 过滤必须在 service / SQL 层生效，不能先全量查出再在 controller 层内存过滤。
- `convertToManual()` 只更新 `resource_source_records.currentKind='manual'`，不能删除 origin 记录，也不能修改资源本体。
- `convertToManual()` 对不存在的来源记录必须返回幂等 manual 结果：
  - `resourceType`
  - `resourceId`
  - `currentKind='manual'`
- workflow 从分享导入时必须记录 `resourceType='workflow_definition'` 的来源记录；agent 分享导入时根 Agent 与深拷贝出的持久化资源必须分别记录：
  - `agent_definition`
  - `knowledge_base`
  - `memory_instance`
  - `mcp_server_config`
  - `skill`
- workspace 只允许记录“已清空”的导入报告，不写入新的 workspace 资源来源记录，因为 workspace 本体不随分享导入复制。

---

## 4. Validation Matrix

| 场景 | 期望 | 验证点 |
| --- | --- | --- |
| conversation 走 `cancel()` | 事务提交后仍会触发 `agent-conversation.ended` | `agent-conversation.service.spec.ts` |
| Agent sandbox `timeoutSeconds=901` | 编译后 `timeoutSeconds=901` 且兼容回填 `timeout=1` | `agent-definition.service.spec.ts` |
| Agent sandbox 未显式配置 timeout | 默认得到 `timeoutSeconds=300` + `timeout=1` | `agent-definition.service.spec.ts` |
| Agent sandbox 未显式配置 `conversationIdleAutoEndMinutes` | runtime / detail response 回退到默认值 `10` | `agent-definition.service.spec.ts`, `agent-definition-response.dto.spec.ts` |
| lifecycle create job 含 `timeoutSeconds=300` | timeout check delay = `300_000ms` | `sandbox-lifecycle.worker.spec.ts` |
| sandbox conversation 一轮执行完成 | 会调度 delayed idle-end check | `agent-execution.worker.spec.ts`, `sandbox.service.spec.ts` |
| sandbox conversation 有新消息进入 | 会取消 delayed idle-end check | `sandbox.service.spec.ts` |
| idle-end check 命中时 conversation 仍无运行中任务且无未处理消息 | worker 应自动调用 `end()` | `sandbox-lifecycle.worker.spec.ts` |
| 旧 published snapshot 只有 `sandboxConfig.timeout=450`，但节点仍有 `timeoutSeconds=450` | detail / versions / runtime 都必须恢复成 `timeout=1 + timeoutSeconds=450` | `agent-definition-response.dto.spec.ts`, `agent-execution.worker.spec.ts`, `workflow-agent-adapter.spec.ts` |
| workspace list 默认过滤 execution archive | API 仍返回 `sourceKind`，但 `execution_archive` 被排除 | `workspace.service.spec.ts` |
| `includeAutoArchived=false` query string | DTO 必须把 `'false'` 解析成 `false`，不能回退成 truthy | `list-workspaces-query.dto.spec.ts` |
| workspace snapshot tar 很大，但只读取目录树 | `GET /workspaces/:id/tree` 仍返回完整目录树，不因整包大小 404 | `workspace.service.spec.ts` |
| workspace snapshot tar 很大，但只读取单个小文件 | `preview/raw` 应能流式定位目标文件，不因整包大小失败 | `workspace.service.spec.ts` |
| sandbox stop/destroy/timeout 时带 `restoreWorkspaceId` | 必须先覆盖回写原 workspace，再继续 lifecycle 收口 | `sandbox-lifecycle.worker.spec.ts` |
| workflow step 绑定已有 workspace 结束 | `archiveExecutionStepWorkspace()` 返回原 `restoreWorkspaceId`，且不创建 execution archive | `workspace-integration.service.spec.ts` |
| sandbox list `bindingType=resource` | SQL where 同时要求 `execution_id is null` + `agent_conversation_id is null` | `sandbox.service.spec.ts` |
| persistent resource sandbox timeout | 资源状态应落为 `stopped`，而不是 `failed` | `sandbox-lifecycle.worker.spec.ts` |
| persistent sandbox 手动 stop | 只应调用 `stopContainer`，不能调用 `removeContainer` | `sandbox-lifecycle.worker.spec.ts`, `sandbox.service.spec.ts` |
| persistent sandbox 从 `stopped` 重启 | 应优先复用既有 `containerId` 走 start，而不是重新 create 新容器 | `sandbox.service.spec.ts`, `sandbox-lifecycle.worker.spec.ts` |
| persistent sandbox 从 `stopped` 重启时旧 `containerId` 已不存在 | worker 应自动重建同 session 容器、回写新 `containerId`，而不是把 session 标成 `failed` | `sandbox-lifecycle.worker.spec.ts`, `docker.service.spec.ts` |
| running sandbox stats 成功拿到 workspace usage | 返回 `diskUsage(bytes)`，service 补齐 `diskTotal(bytes)` | `docker.service.spec.ts`, `sandbox.service.spec.ts` |
| workspace usage 统计失败 | 仍返回 CPU/内存，且不伪造 `diskUsage=0` | `docker.service.spec.ts` |
| conversation sandbox stats 查询 | `GET /agent-conversations/:id/sandbox/stats` 返回与资源页一致的 `ContainerStats` | `agent-conversation.controller.spec.ts` |
| workflow 分享导入成功 | 新 workflow 记录 `resourceSourceKind='share_imported'` | `workflow-version.service.spec.ts` |
| agent 分享导入成功 | 根 Agent 与深拷贝持久化资源记录 share-import source | `agent-share-import.service.ts` tests |
| workflow / agent / knowledge / memory / mcp / skill 列表使用 `sourceKind=share_imported` | 只返回 share-imported 项，不靠 controller 内存过滤 | 对应 service/controller specs |
| `convertToManual()` 命中已有来源记录 | 只更新 `currentKind='manual'`，origin 仍保留 share-import 来源 | `resource-source.service.spec.ts` or manual QA |
| `convertToManual()` 命中不存在来源记录 | 返回幂等 manual 结果 | `resource-source.service.spec.ts` or manual QA |

---

## 5. Test Points

- `src/modules/agent-conversation/agent-conversation.service.spec.ts`
- `src/modules/agent-definition/agent-definition.service.spec.ts`
- `src/modules/agent-execution/__tests__/agent-execution.worker.spec.ts`
- `src/modules/workspace/__tests__/workspace.service.spec.ts`
- `src/modules/workspace/dto/list-workspaces-query.dto.spec.ts`
- `src/modules/agent-conversation/agent-conversation.controller.spec.ts`
- `src/modules/sandbox/__tests__/docker.service.spec.ts`
- `src/modules/sandbox/__tests__/sandbox-lifecycle.producer.spec.ts`
- `src/modules/sandbox/__tests__/sandbox.service.spec.ts`
- `src/modules/sandbox/__tests__/sandbox-lifecycle.worker.spec.ts`
- `src/modules/workflow-definition/__tests__/workflow-version.service.spec.ts`
- `src/modules/agent-definition/agent-definition.service.spec.ts`
- `src/modules/knowledge/__tests__/knowledge-base.service.spec.ts`
- `src/modules/mcp/__tests__/mcp.service.spec.ts`
- `src/modules/skill/skill.service.spec.ts`
