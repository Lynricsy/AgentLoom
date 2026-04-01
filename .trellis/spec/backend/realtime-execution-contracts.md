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
- `WorkflowAgentAdapter.execute(params): Promise<WorkflowAgentExecutionResult>`
- `AgentTaskWorker.process(job): Promise<void>`
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
- workflow 执行 viewer 不是 conversation API 的镜像。运行态来源必须是：
  - `execution.state.snapshot`
  - `/execution` live events
  - step-scoped workspace REST API
- `execution.node.output-chunk` 对 workflow-agent 是必需事件，不能只依赖 `execution.node.agent-event(type='message_chunk')`。
- workflow step 的工作区读取必须走 step 作用域 API，而不是 conversation 作用域 API：
  - `GET /executions/:executionId/steps/:stepId/workspace/tree`
  - `GET /executions/:executionId/steps/:stepId/workspace/files/*`
- `workspace.file_change` 若带 `executionId + stepId`，必须桥接成 workflow execution 的 `AgentEvent(type='file_change')`；若只带 `conversationId`，只能推送到 conversation namespace，不能串流。
- execution viewer 冷开时，gateway 必须先发 `execution.state.snapshot`，再补发 active step buffered live events；不能反过来，否则客户端没有 step 映射时会丢实时事件。

### 4. Validation & Error Matrix

| 条件 | 预期行为 | 断言点 |
|------|----------|--------|
| `segments` 已持久化 | viewer 必须按 `text/thinking/tool_call` 的真实顺序恢复历史 | `agent-execution.worker.spec.ts` / `workflow-agent-adapter.spec.ts` |
| conversation turn 运行中已产出 partial output，但最终 runtime error 失败 | worker 仍需持久化 partial assistant turn，刷新后不能丢失 | `agent-execution.worker.spec.ts` |
| `segments` 缺失，但 `partialContent + toolCalls` 存在 | 允许 fallback 恢复基础内容，但会丢交错顺序；这是临时兼容，不是目标形态 | `workflowAgentViewer.test.ts` / `workflow_agent_runtime_test.dart` |
| workflow-agent 冷开时 step 仍在运行 | snapshot 后必须能补到 active step buffered live events | `execution.gateway.spec.ts` |
| `file_change` 事件只带 `conversationId` | 不得推送到 `/execution` namespace | `event-bridge.service.spec.ts` |
| `tool_call` segment 指向不存在的 tool call | `normalizeConversationMessageSegments()` / viewer normalization 必须丢弃该 segment | `workflowAgentViewer.test.ts` |
| step workspace 文件路径为空或越权 | API 返回明确失败，前端不应继续复用旧内容 | `execution.controller.spec.ts` / `workspace-integration.service.spec.ts` |

### 5. Good / Base / Bad Cases
- Good：workflow-agent 运行中途打开 viewer，立刻看到已产生的文本 chunk、工具卡片、workspace 树，并且后续事件继续追加。
- Base：已完成 step 重新进入 viewer，至少能从 `checkpointData.segments + toolCalls + partialContent` 恢复出可读瀑布流。
- Bad：worker 只持久化 `assistantText + toolCalls[]`，前端再按 `thinking -> text -> toolCalls` 重新拼装，导致历史顺序失真。

### 6. Tests Required
- `src/modules/agent-execution/__tests__/agent-execution.worker.spec.ts`
  - 断言 `agent_messages.metadata.segments` 持久化。
- `src/modules/execution/__tests__/agent-task.worker.spec.ts`
  - 断言 workflow agent 的 `checkpointData.segments`、`partialContent`、`toolCalls` 持续更新。
- `src/modules/execution/__tests__/workflow-agent-adapter.spec.ts`
  - 断言 workflow-agent 的运行中 checkpoint 包含 ordered segments。
- `src/modules/execution/__tests__/execution.gateway.spec.ts`
  - 断言订阅时先发 snapshot，再补发 active step buffered live events。
- `src/modules/execution/__tests__/execution.controller.spec.ts`
  - 断言 step workspace tree/file API 返回 step 作用域数据。
- `src/modules/agent-execution/__tests__/workspace-integration.service.spec.ts`
  - 断言 step workspace 目录树 / 文件内容 / watcher 绑定正确。
- `src/modules/execution/__tests__/event-bridge.service.spec.ts`
  - 断言 `workspace.file_change` 正确桥接到 workflow execution。

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

| 条件 | 预期行为 | 断言点 |
|------|----------|--------|
| 对话结束时仍有 live container | 写入 `metadata.workspaceTreeSnapshot` | `workspace-integration.service.spec.ts` |
| 对话结束时无 `persistencePath` | 仍应保存目录树快照，不能跳过 | `workspace-integration.service.spec.ts` |
| live container 已释放，但 metadata 有 `workspaceTreeSnapshot` | `GET /workspace/tree` 返回目录树快照 | `workspace-integration.service.spec.ts` |
| live container 已释放，但 metadata 有 `workspaceTreeSnapshot` | `GET /workspace/files/*` 返回明确的 tree-only 错误 | `workspace-integration.service.spec.ts` |
| live container 已释放，metadata 无快照 | 维持现有 `没有运行中的沙箱容器` 错误 | `workspace-integration.service.spec.ts` |

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
await persistConversationWorkspaceTreeSnapshot(
  conversationId,
  tenantId,
  tree,
);
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

| 条件 | 预期行为 | 断言点 |
|------|----------|--------|
| 同一 execution 的第二个 workflow 节点引用同一 persistent sandbox | 追加 binding，不得冲突失败 | `sandbox.service.spec.ts` |
| 不同 execution 仍保留旧 binding 时 attach | 抛 `SandboxInvalidStateException` | `sandbox.service.ts` attach 分支 |
| execution 终态清理 | 移除该 execution 的全部 bindings，而不是只清平铺字段 | `sandbox.service.spec.ts` |
| `failed` persistent sandbox 被再次引用 | 自动走 `startSandbox()`，并清理旧容器元数据 | `sandbox.service.spec.ts` |
| `startSandbox()` 作用于 `ready`/`creating` | 抛 `SandboxInvalidStateException` | `sandbox.service.ts` |

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
if (session.status === 'failed' || session.status === 'stopping') {
  throw new SandboxInvalidStateException(session.id, session.status, 'use');
}
```

#### Correct

```ts
if (session.status === 'stopping') {
  throw new SandboxInvalidStateException(session.id, session.status, 'use');
}

if (session.status === 'stopped' || session.status === 'failed') {
  await this.startSandbox(session.id, tenantId);
}
```
