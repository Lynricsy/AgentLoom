# 实时执行链路与持久沙箱契约

> 适用范围：`agentloom-server` 中与 Agent 实时输出、workflow-agent viewer、step workspace API、persistent sandbox 绑定复用相关的后端改动。

## 场景：Agent 文本/工具交错瀑布流与 workflow-agent 实时 viewer

### 1. Scope / Trigger

- 触发条件：修改以下任一链路时，必须回看本节
  - `src/modules/agent-execution/agent-execution.worker.ts`
  - `src/modules/execution/agent-task.worker.ts`
  - `src/modules/execution/workflow-agent-adapter.ts`
  - `src/modules/execution/execution.gateway.ts`
  - `src/modules/execution/services/event-bridge.service.ts`
  - `src/modules/execution/execution.controller.ts`
  - `src/modules/agent-conversation/message-segments.ts`
  - `src/modules/agent-execution/workspace-integration.service.ts`
- 风险点：一旦只保留最终 `content + toolCalls[]`，或者 viewer 冷开时拿不到 snapshot/replay/workspace，前端就会退化成“文本一坨、工具堆后面”的假瀑布流。

### 2. Signatures

- `appendTextConversationMessageSegment(segments, content): ConversationMessageSegmentRecord[]`
- `appendThinkingConversationMessageSegment(segments, content): ConversationMessageSegmentRecord[]`
- `ensureToolCallConversationMessageSegment(segments, toolCallId): ConversationMessageSegmentRecord[]`
- `normalizeConversationMessageSegments(value): ConversationMessageSegmentRecord[]`
- `beginSubAgentConversationCapture(conversationId): string`
- `consumeSubAgentConversationCapture(conversationId, token): Record<string, PersistedSubAgentStreamRecord>`
- `WorkflowAgentAdapter.execute(params): Promise<WorkflowAgentExecutionResult>`
- `AgentTaskWorker.process(job): Promise<void>`
- `WorkspaceIntegrationService.archiveExecutionStepWorkspace(executionId, stepId, tenantId, sandboxNodeId?): Promise<string | null>`
- `GET /executions/:executionId`
- `GET /executions/:executionId/steps/:stepId/workspace/tree`
- `GET /executions/:executionId/steps/:stepId/workspace/files/*`
- `/execution` namespace 事件名：
  - `execution.status.changed`
  - `execution.node.status-changed`
  - `execution.node.agent-event`
  - `execution.node.retrying`
  - `execution.node.output-chunk`
  - `execution.node.intervention-required`
  - `execution.node.intervention-resolved`
  - `execution.node.tool-call-status`
  - `execution.node.tool-permission-required`
  - `execution.node.tool-permission-resolved`

### 3. Contracts

- standalone Agent 会话必须把有序消息段持久化到 `agent_messages.metadata.segments`。
  - `message_chunk` 追加到 `text` segment。
  - `plan` / `decision` 追加到 `thinking` segment。
  - `tool_call` 只按 `toolCallId` 插入一次 `tool_call` segment。
- standalone Agent 的子 agent 历史回放必须把 child waterfall 持久化到父 assistant message 的 `agent_messages.metadata.subAgentStreams[handle]`。
  - capture 作用域是 **单个 conversation turn**，不能把上一轮或 turn 结束后的异步 child 输出串到下一条 assistant message。
  - `message_chunk` 持久化为 child `message_chunk` 事件。
  - `plan` / `decision` 持久化为 child `thinking` 事件。
  - `tool_call(status=pending|awaiting_permission|in_progress)` 持久化为 child `tool_call` 事件。
  - `tool_call(status=completed|failed)` 持久化为 child `tool_result` 事件，避免历史回放丢失工具终态。
  - `done` 与最终 `status_changed` 必须能让前端判断 child 已 completed/failed/timeout/cancelled。
  - `conversation.subagent.status` 是 child 终态的 live 广播；即使 child 没有新的文本 chunk，也要能把最终状态同步给前端。
- 如果 standalone Agent 的单轮 prompt 在运行中已产出 `message_chunk` / `tool_call`，但最终以 runtime error 失败（例如 sandbox 返回 `terminated`）：
  - worker 仍必须把当前轮已积累的 `assistantText`、`toolCalls`、`segments` 作为 partial turn 落库。
  - 该 assistant message 的 `metadata` 需要带 `incomplete=true`，并保留 `errorMessage`，避免刷新或回拉 history 后整轮消息蒸发。
  - 如果 sandbox SSE `error` 事件带有 `code='MODEL_PROVIDER_ERROR'`，adapter / worker 还必须保留：
    - `errorCode`
    - `rawErrorMessage`
    - 面向 UI 的人类可读 `errorMessage`
  - `execution.status.changed` 在 conversation failed 路径中必须同时带 `errorMessage` 与 `error`，不能只在 `failedPhase` 存在时才发送错误文案。
- workflow-agent 运行中必须把以下字段持续写入 `execution_steps.checkpointData`：
  - `partialContent`
  - `segments`
  - `toolCalls`
  - `decision`
  - `round`
  - `chunkIndex`
- tool-level `awaiting_permission` 现在只保留给**自进化写操作**（当前为 `apply_change` / `create_resource`）。
  - 普通运行时工具调用必须直接自动继续，不能再因为 autonomy mode / workflow trigger 类型不同而进入人工审批。
  - sandbox / container SSE 适配层在翻译 `tool_call_update` 时，若事件没有显式 `status='awaiting_permission'` 且没有 `permissionRequest`，默认状态必须保持 `in_progress`；不能仅因为事件类型是 `update` 就回退成 `awaiting_permission`。
  - `execution.node.tool-permission-required` / `tool-permission-resolved` 事件也只应在上述自进化写工具场景出现。
- workflow 执行 viewer 不是 conversation API 的镜像。运行态来源必须是：
  - `execution.state.snapshot`
  - `/execution` live events
  - step-scoped workspace REST API
- `execution.node.output-chunk` 对 workflow-agent 是必需事件，不能只依赖 `execution.node.agent-event(type='message_chunk')`。
- `execution.node.status-changed` 对只在终态一次性写入 `result` 的 workflow 节点（例如 `text-output` / `json-output`）必须同时携带最新 `result`；若这次状态转换也写入了 runtime checkpoint，则同一事件还必须携带 `checkpointData`。
  - 否则前端只能依赖刷新后的 snapshot 才能恢复最终输出，one-shot result 节点会表现成“执行完成��界面空白”。
- workflow step 的工作区读取必须走 step 作用域 API，而不是 conversation 作用域 API：
  - `GET /executions/:executionId/steps/:stepId/workspace/tree`
  - `GET /executions/:executionId/steps/:stepId/workspace/files/*`
- live `workspace/tree`、conversation fallback tree 与持久化 workspace preview tree 必须对普通隐藏目录/文件保持一致的可见性语义。
  - `.claude`、`.env`、`.github` 这类普通 dot 路径要按真实层级保留，不能因为父目录缺失把子节点抬到根层。
  - `workspace.file_change` 事件也必须沿用同一套路径可见性语义，避免前端实时树与完整树口径漂移。
  - 当前允许继续排除 `.git` 与 `node_modules` 这类��础设施目录。
- `archiveExecutionStepWorkspace()` 必须保证 `checkpointData.workspaceSnapshotId` 始终指向“这一步结束后仍可回放”的最新 workspace：
  - sandbox `config.restoreWorkspaceId` 存在：同步回原 workspace 并返回同一个 `restoreWorkspaceId`
  - sandbox 未绑定现有 workspace：才允许新建 `execution_archive`
- `workspace.file_change` 若带 `executionId + stepId`，必须桥接成 workflow execution 的 `AgentEvent(type='file_change')`；若只带 `conversationId`，只能推送到 conversation namespace，不能串流。
- execution viewer 冷开时，gateway 必须先发 `execution.state.snapshot`，再补发 active step buffered live events；不能反过来，否则客户端没有 step 映射时会丢实时事件。

### 4. Validation & Error Matrix

| 条件                                                                     | 预期行为                                                                                 | 断言点                                                                                               |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `segments` 已持久化                                                      | viewer 必须按 `text/thinking/tool_call` 的真实顺序恢复历史                               | `agent-execution.worker.spec.ts` / `workflow-agent-adapter.spec.ts`                                  |
| `subAgentStreams` 已持久化                                               | Studio drill-in 必须按 child `message/thinking/tool_result` 顺序恢复历史瀑布流           | `event-bridge.service.spec.ts` / `subagent-event-routing.spec.ts` / `agent-execution.worker.spec.ts` |
| conversation turn 运行中已产出 partial output，但最终 runtime error 失败 | worker 仍需持久化 partial assistant turn，刷新后不能丢失                                 | `agent-execution.worker.spec.ts`                                                                     |
| `text-output/json-output` 等 one-shot 节点只在 completed 时生成 `result` | `execution.node.status-changed` 必须携带该 `result/checkpointData`，避免前端必须刷新 snapshot | `step-state-machine.service.spec.ts`                                                                 |
| `segments` 缺失，但 `partialContent + toolCalls` 存在                    | 允许 fallback 恢复基础内容，但会丢交错顺序；这是临时兼容，不是目标形态                   | `workflowAgentViewer.test.ts` / `workflow_agent_runtime_test.dart`                                   |
| workflow-agent 冷开时 step 仍在运行                                      | snapshot 后必须能补到 active step buffered live events                                   | `execution.gateway.spec.ts`                                                                          |
| workflow step 绑定已有 workspace 完成/失败                               | `checkpointData.workspaceSnapshotId` 继续指向原 `restoreWorkspaceId`，不生成重复 archive | `workspace-integration.service.spec.ts` / `agent-task.worker.spec.ts`                                |
| workspace 含普通隐藏目录/文件                                            | tree / preview / file_change 都保留真实层级，不得把子节点抬到根层                        | `workspace-integration.service.spec.ts` / `workspace.service.spec.ts`                                |
| `file_change` 事件只带 `conversationId`                                  | 不得推送到 `/execution` namespace                                                        | `event-bridge.service.spec.ts`                                                                       |
| `tool_call` segment 指向不存在的 tool call                               | `normalizeConversationMessageSegments()` / viewer normalization 必须丢弃该 segment       | `workflowAgentViewer.test.ts`                                                                        |
| step workspace 文件路径为空或越权                                        | API 返回明确失败，前端不应继续复用旧内容                                                 | `execution.controller.spec.ts` / `workspace-integration.service.spec.ts`                             |

### 5. Good / Base / Bad Cases

- Good：workflow-agent 运行中途打开 viewer，立刻看到已产生的文本 chunk、工具卡片、workspace 树，并且后续事件继续追加。
- Good：standalone Agent 的 child 在刷新后重新 drill-in，仍能看到与实时一致的子 agent 文本/思考/工具瀑布，而不是只剩最终摘要。
- Base：已完成 step 重新进入 viewer，至少能从 `checkpointData.segments + toolCalls + partialContent` 恢复出可读瀑布流。
- Bad：worker 只持久化 `assistantText + toolCalls[]`，或 child 只留下 `wait_for_subagents` 摘要，前端再按 `thinking -> text -> toolCalls` 重新拼装，导致主/子历史顺序一起失真。

### 6. Tests Required

- `src/modules/agent-execution/__tests__/agent-execution.worker.spec.ts`
  - 断言 `agent_messages.metadata.segments` 持久化。
- `src/modules/execution/__tests__/agent-task.worker.spec.ts`
  - 断言 workflow agent 的 `checkpointData.segments`、`partialContent`、`toolCalls` 持续更新。
- `src/modules/execution/__tests__/workflow-agent-adapter.spec.ts`
  - 断言 workflow-agent 的运行中 checkpoint 包含 ordered segments。
- `src/modules/execution/__tests__/step-state-machine.service.spec.ts`
  - 断言 completed `updateStepStatus()` 会把 `result/checkpointData` 透传到 `execution.node.status-changed`。
- `src/modules/execution/__tests__/execution.gateway.spec.ts`
  - 断言订阅时先发 snapshot，再补发 active step buffered live events。
- `src/modules/execution/__tests__/execution.controller.spec.ts`
  - 断言 step workspace tree/file API 返回 step 作用域数据。
- `src/modules/agent-execution/__tests__/workspace-integration.service.spec.ts`
  - 断言 step workspace 目录树 / 文件内容 / watcher 绑定正确。
  - 断言普通隐藏目录按真实层级保留，且父目录缺失时不会把子节点抬到根层。
  - 断言隐藏目录内的 `workspace.file_change` 仍会透出。
  - 断言绑定已有 workspace 时会回写原 snapshot 并返回同一 ID。
- `src/modules/execution/__tests__/event-bridge.service.spec.ts`
  - 断言 `workspace.file_change` 正确桥接到 workflow execution。
- `src/modules/agent-execution/__tests__/subagent-event-routing.spec.ts`
  - 断言 child completed/failed tool call 会走 `conversation.agent.tool_result`，并广播 `conversation.subagent.status`。

### 7. Wrong vs Correct

#### Wrong

```ts
// 只存最终文本和工具列表，历史顺序无法恢复
await db.insert(agentMessages).values({
  content: assistantText,
  toolCalls,
});
```

#### Correct

```ts
await db.insert(agentMessages).values({
  content: assistantText,
  toolCalls,
  metadata: {
    stopReason,
    segments,
  },
});
```

---

## 场景：standalone Agent 对话中的附件消息必须进入 runtime 上下文并在 sandbox 中可引用

### 1. Scope / Trigger

- 触发条件：修改以下任一文件时，必须回看本节
  - `src/modules/agent-conversation/conversation-attachment.ts`
  - `src/modules/agent-conversation/agent-conversation.service.ts`
  - `src/common/http/fastify-adapter.factory.ts`
  - `src/common/adapters/redis-io.adapter.ts`
  - `src/modules/agent-conversation/dto/message-response.dto.ts`
  - `src/modules/agent-execution/conversation-prompt-blocks.ts`
  - `src/modules/agent-execution/agent-execution.worker.ts`
  - `src/modules/agent-execution/workspace-integration.service.ts`
- 风险点：如果服务端只把“已上传文件 xxx”当普通文本保存，UI 看起来像支持上传，runtime 实际却拿不到真实文件内容；如果 sandbox 附件不写入工作区，Agent 想按路径读取原文件时会直接失败。

### 2. Signatures

- `normalizeIncomingConversationMetadata(contentType, metadata): Record<string, unknown>`
- `readConversationAttachmentMetadataList(metadata): ConversationAttachmentMetadata[]`
- `resolveConversationMessageContentType(contentType, metadata): ConversationMessageContentType`
- `MAX_CONVERSATION_TRANSPORT_PAYLOAD_BYTES`
- `createAppFastifyAdapter(): FastifyAdapter`
- `withConversationAttachmentSandboxPaths(metadata, sandboxPaths): Record<string, unknown>`
- `buildConversationPromptBlocks(params): ContentBlock[]`
- `WorkspaceIntegrationService.stageConversationAttachment(conversationId, tenantId, metadata): Promise<string | null>`
- `POST /agent-conversations/:id/messages`
- `POST /agent-definitions/:agentId/conversations/start`
- `GET /agent-conversations/:id/messages`

### 3. Contracts

- `POST /agent-conversations/:id/messages` 必须接受并持久化 `contentType`。
  - 允许值仅 `text | image | file`
  - `MessageResponseDto` / history serializer 也必须把 `contentType` 返回给前端
- `POST /agent-conversations/:id/messages` 与 `POST /agent-definitions/:agentId/conversations/start` 都必须接受相同的附件合同。
  - `metadata.attachments[]` 是 canonical 结构；读取历史时继续兼容 legacy `metadata.attachment`
  - 单附件消息可额外镜像 `metadata.attachment`，多附件消息不得只保留 legacy 单附件字段
- 带附件消息必须先经过服务端规范化：
  - 每个附件项都必须包含 `kind + fileName + mimeType + sizeBytes`
  - `image` 必须提供 `dataBase64`
  - `file` 至少提供 `textContent` 或 `dataBase64`
  - 当请求 `contentType !== 'text'` 时，所有附件的 `kind` 都必须与 `contentType` 一致
  - 混合图片/文件的多附件消息必须以 `contentType = 'text'` 持久化，但 `attachments[]` 中每个附件的 `kind` 必须保留
- 尺寸限制必须由服务端统一校验：
  - 单附件上限 `1_500_000` bytes
  - 单消息附件总量上限 `10_000_000` bytes
  - 文本内联上限 `200_000` bytes
- transport ceiling 必须高于业务附件上限，避免请求在进入 DTO / service 校验前就被 413 拦截。
  - `FastifyAdapter.bodyLimit` 与 Socket.IO `maxHttpBufferSize` 都必须至少覆盖 `MAX_CONVERSATION_TRANSPORT_PAYLOAD_BYTES`
  - 该 transport ceiling 需要考虑 base64 放大和 JSON / Socket envelope 开销，而不只是原始附件字节数
- 纯文本消息不得残留旧附件字段。
  - `contentType = 'text'` 且无附件时，`metadata.attachment`、`metadata.attachments` 与 `metadata.contentType` 必须被清理，避免旧 UI round-trip 脏数据把普通消息误判成附件消息。
- runtime 构造 prompt blocks 时，附件不能退化成只有一行摘要文本：
  - 对于最新用户消息，prompt builder 只应输出用户原文与附件 block，不得额外注入“用户连续发送了以下消息”之类的包装提示词
  - 图片附件 → `image` block
  - 文本文件 → `resource` text block
  - 二进制文件 → `resource` blob block
  - 若只剩路径引用 → `resource_link` block
- sandbox standalone conversation 在 prompt 前必须 best-effort 尝试把附件写入 `/workspace/uploads/...`。
  - 目标路径冲突时必须生成唯一后缀，不能覆盖已有文件
  - 写入成功后，runtime 侧的每个附件 metadata 都需按顺序补上各自的 `sandboxPath`
  - prompt blocks 必须为每个成功 materialize 的附件附一条文本提示，告诉 Agent 原文件已经位于该工作区路径
- `stageConversationAttachment()` 失败或当前 conversation 没有 live container 时，不得让整个 turn 失败。
  - runtime 仍应继续使用 inline attachment blocks 处理该消息
  - 失败只记 warning，不回滚用户消息

### 4. Validation & Error Matrix

| 条件                                                                             | 预期行为                                                                                        | 断言点                                                                     |
| -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `contentType='image'` 但缺少 `dataBase64`                                        | `POST /messages` 返回 400                                                                       | `agent-conversation.service.spec.ts`                                       |
| `contentType='file'` 且缺少 `textContent/dataBase64`                             | `POST /messages` 返回 400                                                                       | `agent-conversation.service.spec.ts`                                       |
| 任一附件超出 `1.5 MB`、单消息总量超出 `10 MB` 或文本内联超出 `200 KB`            | `POST /messages` / `POST /conversations/start` 返回 400                                         | `conversation-attachment.ts` 校验 + service spec                           |
| 合法图片消息在 `POST /conversations/start` 或正式会话发送时被 transport 413 拦截 | 不允许；Fastify `bodyLimit` 与 Socket `maxHttpBufferSize` 必须高于 base64/JSON 放大后的 payload | `fastify-adapter.factory.spec.ts` / `redis-io.adapter.spec.ts`             |
| 多附件混合图片/文件                                                              | 持久化 `contentType='text'`，但保留完整 `metadata.attachments[]`                                | `agent-conversation.service.spec.ts`                                       |
| sandbox conversation 有 live container                                           | worker 会把附件写入 `/workspace/uploads/...` 并把路径注入 prompt                                | `agent-execution.worker.spec.ts` / `workspace-integration.service.spec.ts` |
| sandbox conversation 无 live container                                           | worker 不抛错，继续使用 inline attachment blocks                                                | `agent-execution.worker.spec.ts`                                           |
| 历史消息回拉                                                                     | 返回 `contentType`，前端能重建附件卡片                                                          | `message-response.dto.ts` 相关序列化断言                                   |

### 5. Good / Base / Bad Cases

- Good：用户一次发送多个附件时，服务端会保留完整 `metadata.attachments[]`，并按附件顺序把可 materialize 的文件写入 sandbox 工作区。
- Good：用户上传文本文件后，Agent 既能直接读到内联文本，也能在 sandbox 模式下通过 `/workspace/uploads/...` 读取原文件。
- Good：用户上传图片后，runtime 收到真实 image block，而不是只有“已上传图片 xxx”的一句摘要。
- Base：当前 conversation 没有 live sandbox 时，附件仍以内联 block 进入 prompt，不阻断消息发送。
- Bad：服务端只保留第一个附件，或把混合附件消息错误地存成 `contentType='image'/'file'`；或者 sandbox 路径固定覆盖旧文件，导致多次上传同名文件后内容错乱。

### 6. Tests Required

- `src/modules/agent-conversation/agent-conversation.service.spec.ts`
  - 断言附件消息会持久化 `contentType + metadata.attachments[]`
- `src/common/http/__tests__/fastify-adapter.factory.spec.ts`
  - 断言 Fastify `bodyLimit` 覆盖附件 transport 负载上限
- `src/common/adapters/__tests__/redis-io.adapter.spec.ts`
  - 断言 Socket.IO `maxHttpBufferSize` 覆盖附件 transport 负载上限
- `src/modules/agent-execution/conversation-prompt-blocks.spec.ts`
  - 断言多附件 prompt blocks 不会注入额外包装提示词，并保留每个附件 block / sandboxPath 提示
- `src/modules/agent-execution/__tests__/agent-execution.worker.spec.ts`
  - 断言 worker 会为 sandbox conversation 的每个附件分别 materialize 并构造 attachment prompt blocks
- `src/modules/agent-execution/__tests__/workspace-integration.service.spec.ts`
  - 断言 `stageConversationAttachment()` 会创建唯一工作区路径并调用 `putArchive`

### 7. Wrong vs Correct

#### Wrong

```ts
await db.insert(agentMessages).values({
  content: dto.content,
  metadata: dto.metadata,
});
```

#### Correct

```ts
const requestedContentType = dto.contentType ?? "text";
const metadata = normalizeIncomingConversationMetadata(
  requestedContentType,
  dto.metadata,
);
const attachments = readConversationAttachmentMetadataList(metadata);
const contentType =
  attachments.length > 0 &&
  requestedContentType !== "text" &&
  attachments.every((attachment) => attachment.kind === requestedContentType)
    ? requestedContentType
    : "text";

await db.insert(agentMessages).values({
  content: dto.content,
  contentType,
  metadata,
});
```

---

## 场景：standalone Agent 新对话必须在首条 user message 时才创建真实 conversation

### 1. Scope / Trigger

- 触发条件：修改以下任一文件时，必须回看本节
  - `src/modules/agent-conversation/agent-conversation.controller.ts`
  - `src/modules/agent-conversation/agent-conversation.service.ts`
  - `src/modules/agent-conversation/dto/start-conversation.dto.ts`
  - `src/database/migrations/0067_purge_empty_agent_conversations.sql`
  - `src/database/migrations/meta/_journal.json`
- 风险点：如果 Web / Mobile 在 `/conversations/new` 挂载时直接 `POST /conversations`，或者 `startConversation()` 先插入 conversation 再非事务化写入首条消息，用户只要“打开一下”或首发失败，就会再次积累零消息空历史。

### 2. Signatures

- `POST /agent-definitions/:agentId/conversations`
- `POST /agent-definitions/:agentId/conversations/start`
- `StartConversationDto { title?: string; content: string; contentType: 'text' | 'image' | 'file'; metadata?: Record<string, unknown> }`
- `AgentConversationService.startConversation(agentDefinitionId, tenantId, userId, dto)`
- `0067_purge_empty_agent_conversations.sql`

### 3. Contracts

- `POST /agent-definitions/:agentId/conversations/start` 是 standalone Agent 新对话页的 canonical 首发接口。
  - Web / Mobile 的 `/conversations/new` 草稿页在首条消息发送前不得调用 `POST /agent-definitions/:agentId/conversations`。
- `AgentConversationService.startConversation()` 必须在单次数据库事务内完成以下步骤：
  - 校验 `agentDefinitionId` 存在
  - 插入 `agent_conversations`
  - 插入首条 `agent_messages`（固定 `role='user'`）
  - 回写 `agent_conversations.updated_at`
- `agent-conversation.message-sent` 事件只能在事务成功提交后发出。
  - 首条消息插入失败时，整个 `startConversation()` 请求必须失败，不能留下零消息 conversation。
- `POST /agent-definitions/:agentId/conversations` 仍可保留为显式 metadata-only 创建接口，但不能再被 `/conversations/new` 默认使用。
- `0067_purge_empty_agent_conversations.sql` 只负责一次性删除历史上 `agent_messages` 数量为 `0` 的 `agent_conversations`。
  - 迁移只执行一次，不增加运行时自动清理、定时任务或离开页面自动删除逻辑。
  - 任何已有消息的 conversation 都不得被这次迁移删除。

### 4. Validation & Error Matrix

| 条件                                          | 预期行为                                                        | 断言点                               |
| --------------------------------------------- | --------------------------------------------------------------- | ------------------------------------ |
| `POST /conversations/start` 的 `content` 为空 | 400，DTO 校验失败                                               | controller / e2e                     |
| Agent 不存在                                  | 整个 start 请求失败，不插入 conversation                        | `agent-conversation.service.spec.ts` |
| 首条消息插入失败                              | 整个 start 请求失败，且不发出 `agent-conversation.message-sent` | `agent-conversation.service.spec.ts` |
| 首条消息成功                                  | 返回新 conversation，历史中立即可见首条 user message            | `agent-integration.e2e-spec.ts`      |
| 历史 conversation 没有任何 `agent_messages`   | 迁移删除该 conversation                                         | migration 手测 / SQL 验证            |
| 历史 conversation 已有至少 1 条消息           | 迁移保留该 conversation                                         | migration 手测 / SQL 验证            |

### 5. Good / Base / Bad Cases

- Good：用户进入 `/conversations/new` 后直接离开，历史列表没有新增记录；发送第一条消息后才出现真实 conversation，且历史里立刻带有首条 user turn。
- Base：服务端仍允许显式调用 `POST /agent-definitions/:agentId/conversations` 创建 metadata-only conversation，但该能力不再绑定到默认新建对话 UI。
- Bad：`startConversation()` 先插入 conversation 再调用 `sendMessage()`，首发失败后数据库里留下零消息空会话。

### 6. Tests Required

- `src/modules/agent-conversation/agent-conversation.controller.spec.ts`
  - 断言 `/conversations/start` 会调用 `service.startConversation()`
- `src/modules/agent-conversation/agent-conversation.service.spec.ts`
  - 断言 `startConversation()` 通过数据库事务包裹创建与首发消息写入
  - 断言首条消息失败时不会发出 `agent-conversation.message-sent`
- `test/agent-integration.e2e-spec.ts`
  - 断言 `POST /agent-definitions/:agentId/conversations/start` 创建后，`GET /agent-conversations/:id` 能回拉到首条 user message
- 迁移验证
  - 执行 `pnpm db:migrate`
  - 用 SQL 断言不存在 `NOT EXISTS (SELECT 1 FROM agent_messages WHERE agent_messages.conversation_id = agent_conversations.id)` 的历史记录

### 7. Wrong vs Correct

#### Wrong

```ts
const conversation = await this.create(
  agentDefinitionId,
  tenantId,
  userId,
  dto,
);
await this.sendMessage(conversation.data.id, tenantId, {
  content: dto.content,
});
return conversation;
```

#### Correct

```ts
const { conversation, message } = await this.tenantDb.transaction(async (tx) => {
  await this.ensureAgentExists(tx, agentDefinitionId)
  const conversation = await this.insertConversationRecord(tx, ...)
  const message = await this.insertMessageRecord(tx, conversation.id, tenantId, {
    content: dto.content,
    role: 'user',
  })
  return { conversation, message }
})

this.eventEmitter.emit('agent-conversation.message-sent', {
  conversationId: conversation.id,
  tenantId,
  messageId: message.id,
})
```

---

## 场景：standalone Agent 已完成会话的工作区目录树快照 fallback

### 1. Scope / Trigger

- 触发条件：修改以下任一文件时，必须回看本节
  - `src/modules/agent-execution/workspace-integration.service.ts`
  - `src/modules/agent-conversation/agent-conversation.controller.ts`
  - `src/modules/agent-conversation/agent-conversation.service.ts`
- 风险点：standalone conversation 的右侧 workspace 目前主要依赖 live sandbox；一旦 runtime 释放，前端就会退化成“工作区暂不可见”。如果为了 completed 态继续预览文件而强行保存整份 workspace 内容，存储成本会明显膨胀。

### 2. Signatures

- `WorkspaceIntegrationService.onConversationEnd(conversationId, tenantId, organizationId, userId): Promise<void>`
- `WorkspaceIntegrationService.getFileTree(conversationId, tenantId): Promise<FileTreeNode[]>`
- `WorkspaceIntegrationService.getFileContent(conversationId, tenantId, filePath): Promise<FileContentResult>`
- `GET /agent-conversations/:id/workspace/tree`
- `GET /agent-conversations/:id/workspace/files/*`
- `agent_conversations.metadata.workspaceTreeSnapshot`

### 3. Contracts

- standalone conversation 结束时，服务端必须尝试从 live container 读取当前 `/workspace` 目录树，并把快照写入 `agent_conversations.metadata.workspaceTreeSnapshot`。
- 这份 conversation tree snapshot 与 live `GET /agent-conversations/:id/workspace/tree` 必须保持同一套目录可见性语��。
  - 普通隐藏目录/文件要保留在树里，且层级必须与真实路径一致。
  - 当前允许继续排除 `.git` 与 `node_modules`。
- `agent-conversation.ended` 必须在 conversation 状态变更事务提交后再发出；不能在事务体内直接 fire-and-forget，否则异步 listener 里再注册 after-commit hook 时，会把 destroy job 丢掉。
- `agent-conversation.ended` 事件链路必须在目录树快照尝试完成后，继续释放 conversation 关联的 live sandbox。
  - 顺序要求：先 best-effort snapshot，再 `endConversationSandbox()`。
  - 即使 snapshot 失败，也不能把 live sandbox 永久留在 `ready/running`，否则 ended conversation 仍会错误暴露 live file preview。
- `workspaceTreeSnapshot` 至少包含：
  - `nodes: FileTreeNode[]`
  - `capturedAt: string`
  - `previewUnavailableReason: string`
- conversation 结束后的 workspace fallback 只保留目录树，不保留文件内容预览。
  - `GET /agent-conversations/:id/workspace/tree`：
    - 优先读 live container。
    - live container 不存在时，若 metadata 中存在 `workspaceTreeSnapshot`，必须回退到该快照。
  - `GET /agent-conversations/:id/workspace/files/*`：
    - 优先读 live container。
    - live container 不存在但 metadata 中存在 `workspaceTreeSnapshot` 时，必须返回明确错误，说明“仅保留目录结构，未保留文件内容预览”，而不是伪造空文件或回 404。
- standalone conversation 的 completed/failure 目录树 fallback 不能依赖 `workspace_snapshots` 整包 tar 归档。
  - workflow step viewer 继续允许走 `workspaceSnapshotId` + tar 归档恢复文件预览。
  - standalone conversation completed 态只为 UI 保留目录树 manifest。

### 4. Validation & Error Matrix

| 条件                                                          | 预期行为                                            | 断言点                                  |
| ------------------------------------------------------------- | --------------------------------------------------- | --------------------------------------- |
| 对话结束时仍有 live container                                 | 写入 `metadata.workspaceTreeSnapshot`               | `workspace-integration.service.spec.ts` |
| 对话在租户事务内被结束                                        | `agent-conversation.ended` 必须 after-commit 才触发 | `agent-conversation.service.spec.ts`    |
| 对话结束事件触发                                              | 目录树快照尝试完成后必须释放 live sandbox           | `workspace-integration.service.spec.ts` |
| 对话结束时无 `persistencePath`                                | 仍应保存目录树快照，不能跳过                        | `workspace-integration.service.spec.ts` |
| live container 已释放，但 metadata 有 `workspaceTreeSnapshot` | `GET /workspace/tree` 返回目录树快照                | `workspace-integration.service.spec.ts` |
| live container 已释放，但 metadata 有 `workspaceTreeSnapshot` | `GET /workspace/files/*` 返回明确的 tree-only 错误  | `workspace-integration.service.spec.ts` |
| live container 已释放，metadata 无快照                        | 维持现有 `没有运行中的沙箱容器` 错误                | `workspace-integration.service.spec.ts` |

### 5. Good / Base / Bad Cases

- Good：completed 的 standalone conversation 刷新后仍能看到工作区目录树；点击文件时明确提示“未保留文件内容预览”。
- Base：若该轮没有产出文件，workspace tree API 返回空数组，前端显示“没有文件树”，而不是“工作区暂不可见”。
- Bad：completed conversation 为了支持文件预览而继续保存整份 workspace tar，或者在 runtime 释放后直接让前端看起来像“工作区没实现”。

### 6. Tests Required

- `src/modules/agent-execution/__tests__/workspace-integration.service.spec.ts`
  - 断言 conversation end 会写入 `metadata.workspaceTreeSnapshot`
  - 断言无 `persistencePath` 时仍保存目录树快照
  - 断言 tree API 会回退到 metadata snapshot
  - 断言 file API 在 snapshot-only 模式下返回明确 tree-only 错误

### 7. Wrong vs Correct

#### Wrong

```ts
if (!persistencePath) {
  return;
}

await workspaceService.createFromSandbox(...);
```

#### Correct

```ts
const tree = await readFileTreeFromContainer(session.containerId);
await persistConversationWorkspaceTreeSnapshot(conversationId, tenantId, tree);
```

---

## 场景：Persistent Sandbox 在 workflow rerun 中的绑定复用

### 1. Scope / Trigger

- 触发条件：修改以下任一文件时，必须回看本节
  - `src/modules/sandbox/sandbox.service.ts`
  - `src/modules/execution/node-scheduler.service.ts`
  - 任何 workflow sandbox 节点对 `persistentSandboxId` 的接入
- 风险点：旧 execution 的 binding 没清干净，新的 execution 会在 `session.status === 'ready'` 时仍被 `attachPersistentSandbox()` 拒绝。

### 2. Signatures

- `SandboxService.createSandboxSession(params): Promise<SandboxSession>`
- `SandboxService.attachPersistentSandbox(params): Promise<SandboxSession>`
- `SandboxService.releaseExecutionSandbox(executionId, sandboxNodeId, tenantId): Promise<void>`
- `SandboxService.destroySandbox(executionId, tenantId): Promise<void>`
- `SandboxService.startSandbox(sessionId, tenantId): Promise<SandboxSession>`
- `NodeSchedulerService.cleanupSandboxIfTerminal(executionId, tenantId): Promise<void>`

### 3. Contracts

- `config.activeBindings` 是 persistent sandbox 真实绑定源；`executionId / agentConversationId / sandboxNodeId` 只是查询加速字段，不能当唯一 truth source。
- 同一 execution 内，多个 workflow 节点可以共享同一 persistent sandbox 资源；attach 时允许追加新的 `sandboxNodeId` binding。
- 不同 execution 之间不得同时绑定同一 persistent sandbox。若旧 binding 仍存在，attach 必须抛 `SandboxInvalidStateException`。
- `releaseExecutionSandbox()` 只移除当前 `executionId + sandboxNodeId` 的 binding；`destroySandbox(executionId)` 在 execution 终态时必须移除该 execution 的全部 binding。
- `startSandbox()` 只允许重启 `stopped` 或 `failed` 的 persistent sandbox。
- 对于 `failed` 的 persistent sandbox，重启前必须 best-effort 清理旧 `containerId`，并把会话状态重置为：
  - `status = 'creating'`
  - `containerId = null`
  - `workspacePath = null`
  - `startedAt = null`
  - `stoppedAt = null`
- `stopping` 是 attach 的硬阻断状态；`failed`/`stopped` 允许通过 `startSandbox()` 进入恢复流程。

### 4. Validation & Error Matrix

| 条件                                                             | 预期行为                                             | 断言点                           |
| ---------------------------------------------------------------- | ---------------------------------------------------- | -------------------------------- |
| 同一 execution 的第二个 workflow 节点引用同一 persistent sandbox | 追加 binding，不得冲突失败                           | `sandbox.service.spec.ts`        |
| 不同 execution 仍保留旧 binding 时 attach                        | 抛 `SandboxInvalidStateException`                    | `sandbox.service.ts` attach 分支 |
| execution 终态清理                                               | 移除该 execution 的全部 bindings，而不是只清平铺字段 | `sandbox.service.spec.ts`        |
| `failed` persistent sandbox 被再次引用                           | 自动走 `startSandbox()`，并清理旧容器元数据          | `sandbox.service.spec.ts`        |
| `startSandbox()` 作用于 `ready`/`creating`                       | 抛 `SandboxInvalidStateException`                    | `sandbox.service.ts`             |

### 5. Good / Base / Bad Cases

- Good：execution A 完成后 binding 被清空；execution B 重新 attach 同一 persistent sandbox 成功，两个 sandbox step 都能 completed。
- Base：同一 execution 内 `sandbox-1` 与 `sandbox-2` 共享同一 persistent sandbox，会话的 `activeBindings` 追加两个 node binding。
- Bad：execution 终态时只清 `session.executionId`，没有清 `config.activeBindings`，下一次 rerun 会在 `current status is ready` 时仍 attach 失败。

### 6. Tests Required

- `src/modules/sandbox/__tests__/sandbox.service.spec.ts`
  - 同一 execution 第二个节点追加 binding。
  - `failed` persistent sandbox 自动恢复。
  - execution 终态清理移除全部 bindings。
  - `startSandbox()` 清理 stale container 后重新入队 create task。
- `src/modules/execution/__tests__/node-scheduler.service.spec.ts`
  - 断言 execution terminal cleanup 会调用 sandbox cleanup。
- Manual QA
  - 使用带 10+ 节点的 workflow 连续 rerun。
  - 确认 persistent sandbox `ready` 且无 binding 时，新 execution 不再 attach 失败。

### 7. Wrong vs Correct

#### Wrong

```ts
if (session.status === "failed" || session.status === "stopping") {
  throw new SandboxInvalidStateException(session.id, session.status, "use");
}
```

#### Correct

```ts
if (session.status === "stopping") {
  throw new SandboxInvalidStateException(session.id, session.status, "use");
}

if (session.status === "stopped" || session.status === "failed") {
  await this.startSandbox(session.id, tenantId);
}
```

---

## 场景：Workflow compound 节点的父子归属兼容与 jump 收口

### 1. Scope / Trigger

- 触发条件：修改以下任一文件时，必须回看本节
  - `src/modules/execution/compound-runtime.util.ts`
  - `src/modules/execution/execution.service.ts`
  - `src/modules/execution/node-scheduler.service.ts`
- 风险点：
  - workflow snapshot 如果混用了 `parentId` 与 `parent_id`，compound 内部节点会被误判成顶层步骤；
  - `break / continue` 提前结束当前轮次时，未执行的内部节点若继续停在 `pending`，Studio 调试视图会错误显示“等待中”。

### 2. Signatures

- `readCompoundParentNodeId(node): string | undefined`
- `attachExecutionRuntimeMeta(node, nodesById): Record<string, unknown>`
- `filterTopLevelExecutionGraph(snapshot): { nodes; edges }`
- `ExecutionService.initializeSteps(executionId): Promise<void>`
- `NodeSchedulerService.createCompoundContext(...)`
- `NodeSchedulerService.scheduleNextCompoundNode(context, tenantId): Promise<void>`
- `NodeSchedulerService.skipPendingCompoundInternalSteps(steps, tenantId): Promise<void>`

### 3. Contracts

- compound 内部节点父容器读取必须同时兼容：
  - `node.parentId`
  - `node.parent_id`
- `ExecutionService.initializeSteps()` 必须把 compound 内部节点写成：
  - `nodeData.__execution.compoundParentId`
  - `nodeData.__execution.isCompoundInternal = true`
  - `nodeData.__execution.isCompoundContainer = false`
- compound 内部节点不得计入顶层 execution 进度：
  - `totalSteps`
  - `completedSteps`
  - `StepStateMachine.updateExecutionStatus()` 的 tracked steps
- `filterTopLevelExecutionGraph()` 必须把所有带父容器的 compound 内部节点从顶层 DAG 中排除；否则 `iteration-start / loop-start / result / break / continue / 普通内部 agent` 会被错误地直接调度。
- `NodeSchedulerService.createCompoundContext()` 必须用同一套父节点读取规则收集内部子图；不能只认 `parentId`。
- compound 内部 `agent` 若不是直接从 sandbox 节点连入，而是通过 `loop-start / iteration-start / result` 等中间节点把 `sandbox-in` 输入对象继续往下传：
  - `NodeSchedulerService.scheduleNode()` 仍必须把全量 execution steps 传给 `getExecutionSandboxBinding()`；
  - `getExecutionSandboxBinding()` 必须允许从 `input['sandbox-in']` / `sandbox` / `sandbox-out` / `sandbox-output` 中读取 `sessionId`，再回推到真实 sandbox step；
  - `WorkflowAgentAdapter` 与 step workspace watcher 必须复用这个回推得到的 `shared-sandbox` 绑定，不能为 compound 内部 agent 再新建独立 sandbox。
- `break / continue` 命中后：
  - 当前轮剩余 `pending` 的 compound 内部节点必须先显式转成 `skipped`；
  - 若 `break` 命中时当前轮 `result` 节点已经 `schedule-ready`，必须先执行该 `result` 节点，把本轮最新输出写回 `roundOutputs / finalOutputs`，然后再 finalize compound；不能直接跳过它；
  - `break` 再结束当前 compound；
  - `continue` 再推进下一轮并重置内部步骤；
  - execution 完成后不得残留 compound 内部节点 `pending`。

### 4. Validation & Error Matrix

| 条件                                                                     | 预期行为                                                                                    | 断言点                                        |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- | --------------------------------------------- |
| snapshot 子节点只有 `parent_id`                                          | internal step 正确生成 `compoundParentId`，且不进入顶层 DAG                                 | `compound-runtime.util.spec.ts`               |
| `initializeSteps()` 读到 `parent_id` 子节点                              | tracked step 统计排除该内部节点                                                             | `execution.service.spec.ts`                   |
| `createCompoundContext()` 读到 `parent_id` 子节点                        | 正确收集内部节点与内部 DAG 顺序                                                             | `node-scheduler.service.spec.ts`              |
| compound 内部 agent 只拿到 `sandbox-in.sessionId`，没有直接 sandbox 入边 | 仍能回推到真实 sandbox step，并把 `serverSandbox` 绑定传给 workflow agent / watcher         | `node-scheduler.service.spec.ts` + browser QA |
| `break` 命中且后面还有未执行内部节点                                     | 这些节点变成 `skipped`，不能残留 `pending`                                                  | `node-scheduler.service.spec.ts` + browser QA |
| `break` 命中且当前轮 `result` 已就绪                                     | 先执行 `result`，最终 `review-result / final-output` 必须拿到本轮最新输出，而不是上一轮旧值 | `node-scheduler.service.spec.ts` + browser QA |
| `continue` 命中且进入下一轮                                              | 本轮剩余节点先 `skipped`，随后下一轮 reset 回 `pending` 再继续调度                          | browser QA + execution detail                 |
| 内部节点缺少任何父容器标识                                               | 仍允许失败，但错误必须明确指向 compound 归属缺失                                            | runtime error / QA                            |

### 5. Good / Base / Bad Cases

- Good：`iteration-start / continue / agent / result` 都挂在 `iteration` 下；运行时只调度顶层 `iteration`，内部节点由 compound context 驱动。
- Base：`break` 在第 2 轮一开始命中，且当前轮 `result` 仍未就绪，`loop-prompt / loop-agent / loop-state / result` 都显示 `skipped`，父 `loop` 以 `stopReason='break'` 完成。
- Good：共享 sandbox 先连到 `loop` 容器，再经 `loop-start -> agent sandbox-in` 传入 compound 内部；developer/reviewer 及其 sub-agent 都复用同一个 `shared-sandbox` 容器。
- Bad：`iter-agent` 因漏掉父节点字段被当成顶层 root；或者 `loop` 已 completed，但剩余内部节点还显示 `pending`；或者 reviewer 第二轮已通过，但 `review-result / final-output` 仍停留在第一轮驳回文本。

### 6. Tests Required

- `src/modules/execution/__tests__/compound-runtime.util.spec.ts`
  - 断言 `parent_id` 兼容
  - 断言顶层 DAG 过滤会排除 compound 内部节点
- `src/modules/execution/__tests__/execution.service.spec.ts`
  - 断言 `initializeSteps()` 对 `parent_id` 内部节点写入 runtime meta，并排除 tracked step 统计
- `src/modules/execution/__tests__/node-scheduler.service.spec.ts`
  - 断言 `createCompoundContext()` 兼容 `parent_id`
  - 断言 `break` 命中后剩余 pending internal nodes 先转 `skipped`
  - 断言 `break` 命中且 `result` 已就绪时，先执行 `result` 再 finalize
  - 断言 compound 内部 workflow agent 可从 `sandbox-in.sessionId` 回推共享 sandbox 绑定
- Manual QA
  - `QA Iteration Agent Sandbox 20260401`
  - `QA Loop Agent Sandbox 20260401`
  - `QA DevReview Loop Workflow 20260405-C`
  - 确认 `continue` 丢弃当前轮结果，`break` 后剩余内部节点显示 `skipped`

### 7. Wrong vs Correct

#### Wrong

```ts
const topLevelNodes = snapshot.nodes.filter((node) => !node.parentId);

if (context.breakRequested) {
  await this.finalizeCompoundExecution(context, tenantId);
}
```

#### Correct

```ts
const topLevelNodes = snapshot.nodes.filter(
  (node) => !readCompoundParentNodeId(node),
);

if (context.breakRequested) {
  await this.skipPendingCompoundInternalSteps(internalSteps, tenantId);
  await this.finalizeCompoundExecution(context, tenantId);
}
```

---

## 场景：`sandbox / no_sandbox` Agent 双运行态与 workflow `agent` 节点契约

### 1. Scope / Trigger

- 触发条件：修改以下任一文件时，必须回看本节
  - `src/modules/agent-definition/agent-definition.service.ts`
  - `src/modules/agent-definition/dto/create-agent-definition.dto.ts`
  - `src/modules/agent-conversation/agent-conversation.service.ts`
  - `src/modules/agent-conversation/agent-conversation.controller.ts`
  - `src/modules/agent-execution/agent-execution.worker.ts`
  - `src/modules/execution/workflow-agent-adapter.ts`
  - `src/modules/execution/node-scheduler.service.ts`
  - `src/modules/agent/pi-agent-core.adapter.ts`
  - `src/modules/agent/sandbox-agent.adapter.ts`
- 风险点：如果 `runtimeMode`、workflow 端口、tool permission resolve、MCP transport 限制、sandbox→no_sandbox 子 Agent 的运行语义任一处漂移，就会出现“创建时可选、运行时失效”或“UI 看似 no_sandbox，底层仍起 sandbox”的伪支持。

### 2. Signatures

- `CreateAgentDefinitionSchema`
- `AgentDefinitionService.buildRuntimeConfigFromNodes(nodes, edges, agentDefinitionId?, runtimeMode?)`
- `AgentExecutionWorker.resolveAgentRuntimeMode(definitionRuntimeMode, snapshotRuntimeMode): AgentRuntimeMode`
- `AgentConversationService.getPermissionResolutionTarget(conversationId): Promise<{ runtimeMode; sessionId? }>`
- `AgentConversationController.resolveToolPermission(id, toolCallId, dto, tenantId)`
- `WorkflowAgentAdapter.execute(params): Promise<WorkflowAgentExecutionResult>`
- `WorkflowAgentAdapter.buildReadOnlyNativeToolPolicy()`
- `NodeSchedulerService.executeHttpToolNode(step, input, tenantId, executionId)`
- `NodeSchedulerService.resolveSourceHandleValue(sourceStep, sourceHandle)`
- `PiAgentCoreAdapter.assertMcpTransportAllowed(session, transportType)`
- `SandboxAgentAdapter.assertMcpTransportAllowed(session, transportType)`
- Agent 相关 API / 事件：
  - `PUT /agent-definitions/:id/canvas`
  - `POST /agent-definitions/:id/versions`
  - `POST /agent-definitions/:id/publish`
  - `POST /agent-conversations/:id/tool-permissions/:toolCallId/resolve`
  - `POST /workflow-definitions/:id/run`

### 3. Contracts

- Agent 创建时必须显式持久化 `runtimeMode = sandbox | no_sandbox`，创建后固定；后续保存画布、创建版本、发布和会话恢复都必须继续沿用该运行形态。
- 顶层 `no_sandbox` standalone Agent 对话与 workflow `agent` 节点必须走 `InProcessAgentAdapter -> PiAgentCoreAdapter -> pi-agent-core`。
- 顶层 `sandbox` Agent 继续走 `SandboxAgentAdapter` + 容器 runtime。
- `no_sandbox` Agent 仍支持：
  - Skill
  - `search_knowledge`
  - Memory tools
  - HTTP MCP
  - self-evolution tools
- `no_sandbox` Agent 不允许：
  - 内置 coding tools
  - stdio MCP
  - 独立 sandbox workspace / terminal 上下文
- `PiAgentCoreAdapter.beforeToolCall()` 对 `no_sandbox` runtime 仍保留 tool permission gate，但以下场景必须直通，不得再次发出 `awaiting_permission`：
  - session `autonomyMode === 'LLM_SUGGEST'`
  - workflow session `context.workflowState.autoApproveToolPermissions === true`
- workflow `agent` 节点必须优先依据 `workflow_executions.trigger_type === 'system'` 把 `autoApproveToolPermissions=true` 写入 workflow session context；`exec-in.triggerType` 只作为 execution 记录缺失时的兜底，确保定时/系统触发的 `no_sandbox` HTTP MCP、知识与 Memory 工具不会因为 runtime 内二次审批而卡死。
- stdio MCP 必须双重 fail-closed：
  - 发布/创建版本时，若 runtime graph 中绑定了 stdio MCP，返回 `AgentPublishValidationException`
  - workflow 发布时，若 `no_sandbox` workflow agent 通过 `tools-in` 连接了 transport=`stdio` 的 `mcp-tool` 节点，返回 `WorkflowPublishValidationException`
  - 运行时即使混入了 stdio MCP 连接，也必须在 adapter 调用前拒绝执行
- workflow `agent` 节点必须跟随目标 Agent 的 `runtimeMode` 动态切端口：
  - `sandbox`：保留 `sandbox-in`
  - `no_sandbox`：移除 `sandbox-in`
- trigger 命名输出端口与 workflow input field id 必须同名直通：
  - `manual-trigger` / `schedule-trigger` / `webhook-trigger` / `api-event-trigger`
  - 若 source handle 为命名字段（例如 `text-in`），后端必须返回 `result.payload[sourceHandle]`
- `http-tool` 节点必须把 `response-out` 写成 HTTP 响应体本身（`response.body`），这样下游 `input-preprocessor` / `agent` 才能通过端口直接消费正文，而不是只能读调试元数据。
- sandbox 父 Agent 调用 `no_sandbox` 子 Agent 时：
  - child 不起独立 in-process runtime
  - child 并入父 sandbox runtime 配置
  - child 的 `nativeToolPolicy` 强制收敛为只开放 `read`
- `no_sandbox -> sandbox` 子 Agent 不支持，运行时必须明确报错。
- standalone `no_sandbox` 工具权限 resolve 必须按 conversation 的 `runtimeMode` 路由到 in-process session，而不能误打 sandbox adapter。

### 4. Validation & Error Matrix

| 条件                                            | 预期行为                                                                      | 断言点                                            |
| ----------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------- |
| 创建 `no_sandbox` Agent                         | `runtimeMode` 持久化为 `no_sandbox`                                           | DTO / service 单测                                |
| `no_sandbox` Agent 发布时绑定 stdio MCP         | 422 `agent-publish-validation`，错误文案点名 MCP server 名称                  | API 手测 + service 单测                           |
| `no_sandbox` workflow agent 接入 stdio MCP 节点 | 422 `workflow-publish-validation`，错误文案点名 agent 节点与 MCP server 名称  | API 手测 + `workflow-version.service.spec.ts`     |
| `no_sandbox` conversation 收到工具权限审批      | resolve 必须使用 `sessionId` 命中 in-process runtime                          | `agent-conversation.controller.spec.ts`           |
| `LLM_SUGGEST` no_sandbox session 调用工具       | runtime 直接进入 `tool_execution_start/end`，不得重复发 `awaiting_permission` | `pi-agent-core.adapter.spec.ts`                   |
| `system` trigger 的 workflow `agent` 节点       | session context 写入 `autoApproveToolPermissions=true`                        | `workflow-agent-adapter.spec.ts`                  |
| `http-tool.response-out -> input-preprocessor`  | 下游拿到的必须是响应体正文，而不是缺失值或整个调试包                          | `node-scheduler.service.spec.ts`                  |
| workflow `agent` 节点选择 `no_sandbox` Agent    | 输入端口不含 `sandbox-in`                                                     | Studio 单测 + 浏览器手测                          |
| `manual-trigger.text-in -> agent.text-in`       | Agent step.input 必须拿到 launch input 原值                                   | `node-scheduler.service.spec.ts` + execution 手测 |
| `sandbox` 父 Agent 调用 `no_sandbox` 子 Agent   | 子 Agent 只能读父上下文可见资源，不能获得 write/edit/terminal                 | sub-agent 集成测试 + 浏览器手测                   |
| `no_sandbox` 父 Agent 调用 `sandbox` 子 Agent   | 明确报错“不支持调用有 sandbox 的子 Agent”                                     | worker / adapter 单测                             |

### 5. Good / Base / Bad Cases

- Good：顶层 `no_sandbox` Agent 在浏览器对话中能实际调用 Memory、Knowledge、HTTP MCP、自进化；workflow `agent` 节点没有 `sandbox-in`，运行后 step.input 正确收到 launch text。
- Base：sandbox 父 Agent 调用 `no_sandbox` 子 Agent 时，子 Agent 能读取父工作区文件并完成任务，但不会暴露写权限或单独的 runtime session UI。
- Bad：UI 选择了 `no_sandbox`，但运行时仍要求 sandbox 节点；或 workflow trigger 的命名端口看起来连上了，实际 step.input 仍为空。

### 6. Tests Required

- `src/modules/agent-conversation/agent-conversation.controller.spec.ts`
  - 断言 `no_sandbox` 对话的工具权限 resolve 走 in-process runtime
- `src/modules/agent/__tests__/pi-agent-core.adapter.spec.ts`
  - 断言 no_sandbox runtime 支持 Memory/Knowledge/HTTP MCP，并在 stdio MCP 上 fail-closed
  - 断言 `LLM_SUGGEST` 与 `workflowState.autoApproveToolPermissions=true` 不会重复进入 `awaiting_permission`
- `src/modules/agent/__tests__/mcp-tool-bridge.spec.ts`
  - 断言 MCP schema / descriptor 在 no_sandbox runtime 中可用
- `src/modules/execution/__tests__/workflow-agent-adapter.spec.ts`
  - 断言 `workflow_executions.trigger_type=system` 会把 `autoApproveToolPermissions=true` 写入 workflow session context
- `src/modules/workflow-definition/__tests__/workflow-version.service.spec.ts`
  - 断言 `no_sandbox` workflow agent 连接 `stdio` MCP 节点时发布直接阻断
- `src/modules/execution/__tests__/node-scheduler.service.spec.ts`
  - 断言 trigger 命名输出端口会读取 `payload[sourceHandle]`
  - 断言 `http-tool` 会把 `response-out` 写成响应体正文
- `src/modules/agent-execution/subagent/subagent-integration.spec.ts`
  - 断言 `sandbox -> no_sandbox(read-only)` 子 Agent 语义
- Manual/browser E2E
  - 顶层 `no_sandbox` Agent：Memory + Skill、Knowledge、HTTP MCP、自进化
  - `no_sandbox -> no_sandbox` 子 Agent
  - `sandbox -> no_sandbox(read-only)` 子 Agent
  - workflow `agent` 节点动态端口 + 运行成功
  - stdio MCP 发布阻断

### 7. Wrong vs Correct

#### Wrong

```ts
await this.sandboxAgentAdapter.resolveConversationToolPermission(
  conversationId,
  toolCallId,
  dto.action,
);
```

#### Correct

```ts
const target =
  await this.conversationService.getPermissionResolutionTarget(conversationId);

if (target.runtimeMode === "no_sandbox") {
  await this.inProcessAgentRuntime.resolveToolPermission?.(
    target.sessionId!,
    toolCallId,
    dto.action,
  );
}
```

---

## 场景：Agent 画布版本快照、历史发布与分享 gating 合同

### 1. Scope / Trigger

- 触发条件：修改以下任一文件时，必须回看本节
  - `agentloom-server/src/modules/agent-definition/agent-definition.controller.ts`
  - `agentloom-server/src/modules/agent-definition/agent-definition.service.ts`
  - `agentloom-server/src/modules/agent-definition/dto/create-agent-version.dto.ts`
  - `agentloom-server/src/modules/agent-definition/dto/publish-agent.dto.ts`
  - `agentloom-server/src/modules/share/share.service.ts`
  - `agentloom-studio/src/app/routes/agents/agents.$agentId.tsx`
  - `agentloom-studio/src/features/agent/api/agentDefinitionApi.ts`
  - `agentloom-studio/src/features/agent/components/AgentCreateVersionDialog.tsx`
  - `agentloom-studio/src/features/agent/components/AgentVersionHistoryPanel.tsx`
  - `agentloom-studio/src/features/agent/components/AgentPublishDialog.tsx`
- 风险点：如果 Agent 画布顶部入口、版本 DTO 与发布服务的合同不同步，就会出现“前端可点分享但后端必然拒绝”或“历史面板选择了某个版本，发布却仍然偷偷发布当前草稿”的闭环断裂。

### 2. Signatures

- `PUT /agent-definitions/:id/canvas`
- `POST /agent-definitions/:id/versions`
- `POST /agent-definitions/:id/publish`
- `POST /agent-shares`
- `CreateAgentVersionSchema`
- `PublishAgentSchema`
- `AgentDefinitionService.createVersion(agentId, dto, userId)`
- `AgentDefinitionService.publish(agentId, dto, userId)`
- `ShareService.createAgentShare(tenantId, userId, dto)`

### 3. Contracts

- `PUT /agent-definitions/:id/canvas` 继续保存当前草稿定义；Studio 在“保存版本”与“发布当前编辑稿”前，若检测到本地画布 dirty，必须先调用该接口保存草稿，保存失败时中止后续动作。
- `POST /agent-definitions/:id/versions` 请求体合同：
  - `label?: string`
  - `releaseNotes?: string`
  - `release_notes?: string`
  - `changelog?: string`
  - 服务端必须把 `releaseNotes/release_notes/changelog` 归一成 `releaseNotes`
- `createVersion()` 必须把版本说明写入 `agent_versions.snapshot.metadata.releaseNotes`，并在未显式传 `label` 时按 `vN` 或 `vN - <releaseNotes 前 50 字>` 生成默认标签。
- `POST /agent-definitions/:id/publish` 请求体合同：
  - `versionId?: string`
  - `label?: string`
  - `releaseNotes?: string`
  - `release_notes?: string`
  - `changelog?: string`
- `publish()` 必须支持两条路径：
  - 未传 `versionId`：基于当前草稿创建一个新的 published version
  - 传入 `versionId`：直接把对应历史版本设为当前发布版本，并允许覆盖 `label` 与 `snapshot.metadata.releaseNotes`
- 每次发布都必须先清空同一 Agent 其他版本的 `publishedAt`，再把 `agent_definitions.status` 置为 `published`，并把 `agent_definitions.published_version_id` 指向最新发布版本。
- `POST /agent-definitions/:id/publish` 的成功响应必须返回更新后的 agent detail，而不是单独返回 `agent_version`，这样 Studio 才能立即按最新 `status/publishedVersionId` 重算工具栏与分享入口。
- `POST /agent-shares` 仍必须要求目标 Agent 存在 `publishedVersionId`；分享能力不能替代发布。

### 4. Validation & Error Matrix

| 条件                                                         | 预期行为                                                            | 断言点                             |
| ------------------------------------------------------------ | ------------------------------------------------------------------- | ---------------------------------- |
| `POST /agent-definitions/:id/versions` 传 `release_notes`    | DTO 归一为 `releaseNotes`                                           | `create-agent-version.dto.spec.ts` |
| `POST /agent-definitions/:id/versions` 传旧字段 `changelog`  | DTO 继续兼容并归一为 `releaseNotes`                                 | `create-agent-version.dto.spec.ts` |
| `POST /agent-definitions/:id/publish` 传 `versionId`         | 发布指定历史版本，`agent_definitions.publishedVersionId` 指向该版本 | `agent-definition.service.spec.ts` |
| `POST /agent-definitions/:id/publish` 未传 `versionId`       | 基于当前草稿创建新的 published version                              | `agent-definition.service.spec.ts` |
| `POST /agent-definitions/:id/publish` 传不存在的 `versionId` | 返回 `AgentVersionNotFoundException`                                | `agent-definition.service.spec.ts` |
| 未发布 Agent 调 `POST /agent-shares`                         | 服务端拒绝创建分享链接                                              | `share.service.spec.ts`            |
| 当前草稿没有任何节点就发布                                   | 返回 `AgentPublishValidationException`                              | `agent-definition.service.spec.ts` |

### 5. Good / Base / Bad Cases

- Good：用户先保存画布，再创建一个带标签的版本快照，随后从历史面板选择该版本发布；服务端把该历史版本设为唯一 published version，Studio 顶部立刻显示分享入口。
- Base：老客户端仍发送 `changelog` 或 `release_notes`，服务端正常归一成 `releaseNotes`，不会因为字段名漂移丢掉版本说明。
- Bad：前端从历史列表点“发布这个版本”，后端却无视 `versionId` 又基于当前草稿新建版本；或者 Agent 尚未发布却还能成功创建分享链接。

### 6. Tests Required

- `agentloom-server/src/modules/agent-definition/dto/create-agent-version.dto.spec.ts`
  - 断言 `releaseNotes/release_notes/changelog` 归一行为
- `agentloom-server/src/modules/agent-definition/dto/publish-agent.dto.spec.ts`
  - 断言 `versionId/version_id` 与版本说明字段归一行为
- `agentloom-server/src/modules/agent-definition/agent-definition.service.spec.ts`
  - 断言“当前草稿发布”与“指定历史版本发布”两条路径
  - 断言发布后 `publishedVersionId` 与唯一 `publishedAt` 收口
- `agentloom-server/src/modules/share/share.service.spec.ts`
  - 断言未发布 Agent 不能创建分享链接
- Manual QA
  - Studio 中按“保存画布 → 保存版本 → 历史记录 → 发布 → 分享”完整走通一次

### 7. Wrong vs Correct

#### Wrong

```ts
// 历史版本入口最终仍然忽略用户选择，永远发布当前草稿
await this.agentDefinitionService.publish(agentId, userId);
```

#### Correct

```ts
await this.agentDefinitionService.publish(
  agentId,
  {
    versionId,
    label,
    releaseNotes,
  },
  userId,
);
```
