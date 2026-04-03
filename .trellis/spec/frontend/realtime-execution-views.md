# 实时执行视图与 Agent 瀑布流契约

> 适用范围：`agentloom-studio` 与 `agentloom_mobile` 中的 standalone agent 对话、workflow execution 页面、workflow-agent viewer、workspace 文件预览。

## 场景：Studio 的 standalone agent / workflow-agent viewer 必须保留真实消息顺序

### 1. Scope / Trigger
- 触发条件：修改以下任一文件时，必须回看本节
  - `agentloom-studio/src/features/agent-conversation/stores/agent-conversation.store.ts`
  - `agentloom-studio/src/features/execution/lib/workflowAgentViewer.ts`
  - `agentloom-studio/src/features/execution/components/WorkflowAgentViewer.tsx`
  - `agentloom-studio/src/features/execution/api/executionApi.ts`
- 风险点：一旦前端重新按 `thinking -> text -> toolCalls` 拼历史，真实交错顺序会丢失；一旦 viewer 不读 step workspace API，workspace 面板就会退化成空壳。

### 2. Signatures
- `buildWorkflowAgentViewerState(step, nodeState): WorkflowAgentViewerState`
- `normalizeStoredSegments(checkpointData, toolCalls): MessageSegment[]`
- `runWorkflow(workflowId, payload?: RunWorkflowRequest)`
- `getExecution(executionId)`
- `getExecutionStepWorkspaceTree(executionId, stepId)`
- `getExecutionStepWorkspaceFile(executionId, stepId, filePath)`
- 路由：
  - `/executions/$executionId`
  - `/executions/$executionId/steps/$stepId/agent`

### 3. Contracts
- `buildWorkflowAgentViewerState()` 必须优先消费 ordered `segments`，而不是重新根据 `content + toolCalls` 拼顺序。
- 如果 `checkpointData.segments` 存在：
  - `text` / `thinking` 原样保留。
  - `tool_call` 只在对应 tool call 仍存在时保留。
- 如果 `checkpointData.segments` 缺失，只能做 fallback：
  - `partialContent/content` 生成 1 个 text segment。
  - 再按 tool call 顺序补 `tool_call` segments。
  - 这是兼容路径，不是目标形态。
- workflow-agent viewer 必须是只读视图：
  - 允许查看消息流、工具、终端、文件变更、workspace 树、文件预览。
  - 不允许像普通 Agent 对话页一样继续发送新消息。
- workspace 面板必须使用 execution step 作用域 API，而不是 conversation API。
- workspace 刷新后，如果当前选中文件已不存在，必须清空选中态和旧预览，不能继续显示 stale 内容。
- standalone Agent 的 `loadHistory()` 不能无条件整包替换当前 `messages`。
  - 如果 history 响应只是当前消息流的 canonical 前缀，必须保留尚未落库的 live tail。
  - 否则上一轮 `done` 触发的迟到 history 响应，会把下一轮已在 streaming 的 user / assistant 消息覆盖掉。
- standalone Agent 的 failed realtime status 必须同时兼容 `errorMessage` 与 `error`。
  - 连接错误与执行错误必须分开展示，不能把 runtime failed 误报成“连接失败”。
  - 如果历史 assistant message `metadata.incomplete === true` 且存在 `metadata.errorMessage`，消息列表必须直接渲染该 turn 的中断原因。

### 4. Validation & Error Matrix

| 条件 | 预期行为 | 断言点 |
|------|----------|--------|
| step 有 `segments` | viewer 按真实顺序渲染文本/思考/工具 | `workflowAgentViewer.test.ts` |
| standalone agent 的 history 晚于下一轮 live 流返回 | store 保留当前 live tail，不得覆盖新一轮消息 | `agent-conversation.store.test.ts` |
| step 无 `segments`，但有 `partialContent + toolCalls` | viewer 退化成基础 fallback，不抛错 | `workflowAgentViewer.test.ts` |
| 用户快速切换文件或刷新 workspace | 旧请求不得覆盖新文件内容 | `WorkflowAgentViewer.test.tsx` |
| 运行中 `fileChanges` 增加 | viewer 触发 workspace 刷新 | `WorkflowAgentViewer.test.tsx` |
| step 不是 agent 节点 | viewer 路由必须走 guard / 错误态，不得渲染假消息流 | 组件测试 + 手动 QA |

### 5. Good / Base / Bad Cases
- Good：运行中或运行后进入 `/executions/$executionId/steps/$stepId/agent`，消息流与工具按真实顺序交错，workspace 文件树和文件预览都能查看。
- Base：没有新的 live event 时，viewer 仍可从 checkpoint 恢复出可读历史。
- Bad：`done` 后重新拉 history，再把所有 thinking 放前面、所有工具堆在后面。

### 6. Tests Required
- `agentloom-studio/src/features/agent-conversation/stores/agent-conversation.store.test.ts`
  - 断言 standalone agent history 使用 stored segments。
  - 断言 history 晚到时不会覆盖当前 live tail。
- `agentloom-studio/src/features/execution/lib/workflowAgentViewer.test.ts`
  - 断言 ordered segments、live output merge、tool/file/terminal normalization。
- `agentloom-studio/src/features/execution/components/WorkflowAgentViewer.test.tsx`
  - 断言 workspace tree/file preview/refresh 行为。
- `agentloom-studio/src/features/execution/api/executionApi.test.ts`
  - 断言 step workspace API 和 run payload 契约。

### 7. Wrong vs Correct

#### Wrong

```ts
const segments = [
  ...(thinking ? [{ type: 'thinking', content: thinking }] : []),
  ...(content ? [{ type: 'text', content }] : []),
  ...toolCalls.map((toolCall) => ({ type: 'tool_call', toolCallId: toolCall.id })),
]
```

#### Correct

```ts
const segments = checkpointData.segments?.length
  ? normalizeStoredSegments(checkpointData, toolCalls)
  : fallbackSegments
```

---

## 场景：standalone Agent 已完成会话的工作区目录树 fallback

### 1. Scope / Trigger
- 触发条件：修改以下任一文件时，必须回看本节
  - `agentloom-studio/src/features/agent-conversation/stores/agent-conversation.store.ts`
  - `agentloom-studio/src/features/agent-conversation/components/AgentConversationPage.tsx`
  - `agentloom-studio/src/features/agent-conversation/components/WorkspaceFileTree.tsx`
  - `agentloom_mobile/lib/features/agents/providers/agent_conversation_provider.dart`
  - `agentloom_mobile/lib/features/agents/widgets/conversation_context_panel.dart`
  - `agentloom_mobile/lib/features/agents/api/agent_api.dart`
- 风险点：completed conversation 如果只读 live runtime，就会在刷新或冷开后退化成“工作区暂不可见”；如果前端继续尝试文件预览，又会把服务端 tree-only fallback 误报成加载失败。

### 2. Signatures
- Studio:
  - `loadWorkspaceTree(conversationId): Promise<void>`
  - `AgentConversationPage`
  - `WorkspaceFileTree`
- Flutter:
  - `AgentConversationNotifier.refreshWorkspaceTree()`
  - `AgentConversationNotifier.openWorkspaceFile(path)`
  - `ConversationContextPanel`
  - `ConversationState.hasLoadedWorkspaceTree`
  - `ConversationState.workspaceTreeOnly`
  - `ConversationState.workspacePreviewUnavailableReason`

### 3. Contracts
- standalone conversation 页面在 mount / 冷开时，必须主动拉一次 `GET /agent-conversations/:id/workspace/tree`。
  - 不能只依赖 `conversation.sandbox.file_change` 增量事件，否则 completed 冷开后不会有任何树数据。
- completed conversation 的 workspace fallback 只保留目录树，不保留文件预览。
  - Studio standalone 侧：
    - 只需要恢复目录树。
    - 不需要为了 completed 态新增文件预览面板。
  - Flutter standalone 侧：
    - 成功拉到 tree 后，即使 tree 为空，也要把状态视为“工作区已加载”，不能继续显示“工作区暂不可见”。
    - 当 `openWorkspaceFile()` 收到后端的 tree-only 错误时，必须切到 `workspaceTreeOnly` 模式，并把提示展示在 preview 区域，而不是当成普通红色错误 banner。
- workspace tree 刷新后，如果当前选中文件不再存在，必须清空旧的 `selectedFilePath` / `selectedFileContent`。

### 4. Validation & Error Matrix

| 条件 | 预期行为 | 断言点 |
|------|----------|--------|
| completed conversation 冷开 | Studio / Flutter 都能拉到目录树 | `agent-conversation.store.test.ts` / Flutter 手动 QA |
| tree API 成功但返回空数组 | Flutter 显示“没有文件树”，而不是“工作区暂不可见” | `conversation_context_panel_test.dart` |
| Flutter 点击 completed conversation 文件 | 切到 `workspaceTreeOnly` 模式并显示 tree-only 提示 | `agent_conversation_provider_test.dart` |
| workspace tree 刷新后当前选中文件已失效 | 选中态被清空，不保留 stale 文件 | `agent-conversation.store.test.ts` |
| workspace tree 请求响应晚到且会话已切换/重置 | 不得污染当前会话状态 | `agent-conversation.store.test.ts` |

### 5. Good / Base / Bad Cases
- Good：completed conversation 刷新后仍能看到目录树；Flutter 点击文件时提示“未保留文件内容预览”，Studio 继续仅展示树。
- Base：目录树为空时，Flutter 仍显示 workspace 面板，只是左侧为空树、右侧不给预览。
- Bad：completed conversation 冷开后整个 workspace 面板看起来像没实现；或者 Flutter 把 tree-only 错误直接展示成“读取文件失败”。

### 6. Tests Required
- `agentloom-studio/src/features/agent-conversation/stores/agent-conversation.store.test.ts`
  - 断言 `loadWorkspaceTree()` 会恢复目录树
  - 断言过期 workspace tree 响应不会污染已重置会话
- `agentloom_mobile/test/features/agents/providers/agent_conversation_provider_test.dart`
  - 断言 tree-only 错误会切换 `workspaceTreeOnly`
  - 断言 tree-only 模式下再次点击文件不会继续发起文件预览请求
- `agentloom_mobile/test/features/agents/widgets/conversation_context_panel_test.dart`
  - 断言空 tree 但已加载时显示“没有文件树”
  - 断言 tree-only 模式显示目录结构保留提示

### 7. Wrong vs Correct

#### Wrong

```dart
if (state.fileTree.isEmpty && state.selectedFileContent == null) {
  return const EmptyState(title: '工作区暂不可见');
}
```

#### Correct

```dart
if (!state.hasLoadedWorkspaceTree && state.selectedFileContent == null) {
  return const EmptyState(title: '工作区暂不可见');
}

if (state.workspaceTreeOnly) {
  return TreeOnlyPreviewHint(reason: state.workspacePreviewUnavailableReason);
}
```

---

## 场景：standalone Agent “agent 的电脑”面板必须显示真实资源值

### 1. Scope / Trigger
- 触发条件：修改以下任一文件时，必须回看本节
  - `agentloom-studio/src/features/agent-conversation/components/SandboxComputerPanel.tsx`
  - `agentloom-studio/src/features/agent-conversation/api/conversationApi.ts`
  - `agentloom-studio/src/features/agent-conversation/api/conversationQueries.ts`
  - `agentloom-server/src/modules/agent-conversation/agent-conversation.controller.ts`
  - `agentloom-server/src/modules/sandbox/sandbox.service.ts`
- 风险点：如果面板只显示静态 `CPU/MEM` 标签，用户会误以为“Agent 的电脑”有资源监控但实际是空壳；如果把缺失的 disk stats 回退成 `0 B`，又会把“未知”伪装成“空工作区”。

### 2. Signatures
- `GET /api/v1/agent-conversations/:id/sandbox/stats`
- `fetchConversationSandboxStats(conversationId): Promise<SandboxStats>`
- `useConversationSandboxStats(conversationId, sandboxStatus)`
- `SandboxComputerPanel`
- `ContainerStats`

### 3. Contracts
- `SandboxComputerPanel` 右上角必须显示**实际值**，不能只保留标签：
  - `CPU <percent>`
  - `MEM <usage / limit>`
  - `DISK <usage / total>`
- 面板必须通过 `GET /agent-conversations/:id/sandbox/stats` 拉取 conversation 绑定的 active sandbox stats，不能让前端自行扫资源列表。
- `sandboxStatus === 'running'` 时必须持续轮询；离开 running 后允许保留上一份成功数据作为只读展示。
- `diskUsage=0` 时必须显示 `0 B / ...`。
- `diskUsage/diskTotal` 缺失时必须显示占位值（如 `--`），不能自行推导 `0 B`。
- `404/409` 必须被视为“当前没有可用 sandbox stats”，而不是全局红错态。

### 4. Validation & Error Matrix

| 条件 | 预期行为 | 断言点 |
|------|----------|--------|
| conversation 有活跃 sandbox 且 stats 可用 | 面板显示真实 CPU/MEM/DISK 值 | `SandboxComputerPanel.test.tsx` |
| `diskUsage=0` | 面板显示 `0 B / ...` | `SandboxComputerPanel.test.tsx` |
| `GET /agent-conversations/:id/sandbox/stats` 返回 404/409 | hook 返回 `null`，面板显示占位值，不抛全局错误 | query hook 测试或手动 QA |
| sandbox 进入 `running -> idle` | 停止轮询，但保留最近一次成功数据 | 手动 QA |

### 5. Good / Base / Bad Cases
- Good：Agent 真正写入文件后，`agent 的电脑` 面板里的 `DISK` 会变大；空工作区显示 `0 B / 2.0 GB`。
- Base：当前会话还没拿到 active sandbox stats 时，面板显示 `CPU -- / MEM -- / DISK --`。
- Bad：右上角永远只有 `CPU / MEM` 字样，不显示任何值；或者 disk stats 缺失时直接渲染成 `0 B`。

### 6. Tests Required
- `agentloom-studio/src/features/agent-conversation/components/SandboxComputerPanel.test.tsx`
- `agentloom-server/src/modules/agent-conversation/agent-conversation.controller.spec.ts`
- 手动 QA：
  - Agent 对话页确认 `agent 的电脑` 面板出现真实值
  - 让 Agent 在工作区写入 marker 文件，确认 `DISK` 数值变化

### 7. Wrong vs Correct

#### Wrong

```tsx
<div className="flex items-center gap-1 text-[10px] text-muted-foreground">
  <Cpu className="h-3 w-3" />
  <span>CPU</span>
</div>
```

#### Correct

```tsx
<HeaderMetric icon={Cpu} label="CPU" value={cpuLabel} />
```

## 场景：Flutter execution 页面与 workflow-agent viewer 的终态收敛

### 1. Scope / Trigger
- 触发条件：修改以下任一文件时，必须回看本节
  - `agentloom_mobile/lib/main.dart`
  - `agentloom_mobile/lib/config/theme.dart`
  - `agentloom_mobile/lib/features/notifications/platform/push_platform_support.dart`
  - `agentloom_mobile/lib/features/notifications/providers/push_notification_provider.dart`
  - `agentloom_mobile/lib/features/notifications/services/notification_service.dart`
  - `agentloom_mobile/lib/features/execution/providers/execution_monitor_provider.dart`
  - `agentloom_mobile/lib/features/execution/services/execution_socket_service.dart`
  - `agentloom_mobile/lib/features/execution/screens/execution_monitor_screen.dart`
  - `agentloom_mobile/lib/features/execution/screens/workflow_agent_viewer_screen.dart`
  - `agentloom_mobile/lib/features/execution/lib/workflow_agent_runtime.dart`
  - `agentloom_mobile/lib/features/workflows/api/workflow_api.dart`
  - `agentloom_mobile/lib/routes/app_router.dart`
- 风险点：只靠 WebSocket 不够，终态事件或 ACK 偶发丢失时，Flutter Web 会长期停在 `running`；workspace 面板如果不跟随 `fileChanges` 刷新，也会看起来像“实时没实现”；如果 Flutter Web 在 `runApp()` 前强依赖 Firebase Web SDK 或远端 CJK 字体，真实 QA 会直接落成白屏或中文方块。

### 2. Signatures
- `PushPlatformSupport.isSupported`
- `PushPlatformSupport.registrationPlatform`
- `NotificationService.initialize()`
- `NotificationService.requestPermission()`
- `NotificationService.getToken()`
- `executionMonitorProvider(executionId)`
- `extractMonitorSnapshot(state)`
- `extractMonitorRuntime(state)`
- `extractMonitorConnectionMode(state)`
- `WorkflowAgentViewerScreen(executionId, stepId)`
- `buildWorkflowAgentConversationState(...)`
- `getExecutionStepWorkspaceTree(executionId, stepId)`
- `getExecutionStepWorkspaceFile(executionId, stepId, filePath)`
- 路由：
  - `/executions/:executionId`
  - `/executions/:executionId/steps/:stepId/agent`

### 3. Contracts
- Flutter Web 启动链不能依赖 Firebase Push 可用。
  - `main.dart` 只允许在原生移动端执行 `Firebase.initializeApp()` 与 `FirebaseMessaging.onBackgroundMessage(...)`。
  - Web 平台上的 push 初始化必须显式 no-op，不能在 build/login 恢复路径里再次触发 Firebase Web SDK 动态加载。
- `PushPlatformSupport` 是 Flutter push 能力判断的单一事实源。
  - `isSupported == false` 时，`push_notification_provider` 不得继续调用 `NotificationService.initialize()/requestPermission()/getToken()`。
  - `NotificationService` 自身也必须在 unsupported 平台上返回可恢复的空行为，而不是向上抛运行时异常。
- Flutter Web 文本渲染不能依赖远端 Noto 字体。
  - `AppTheme.textTheme` 必须提供本地 CJK `fontFamilyFallback`，至少覆盖正文与标题文本。
  - 远端字体拉取失败时，中文正文必须继续可读，不能退化成方块。
- `ExecutionMonitorConnected` 期间也必须继续 REST polling，对账终态。
- 收到 `execution.status.changed` 且状态进入终态时，provider 不能直接冻结当前 snapshot；必须先再拉一次 `GET /executions/:executionId`，用最终 REST detail 收口。
- 如果最终 REST 失败，才允许 fallback 到当前 snapshot + runtime merge。
- workflow execution 页面上的 agent 节点卡片只显示摘要入口；点击后跳只读 workflow-agent viewer。
- Flutter Web 上通过 `pushNamed()` 进入 viewer 时，浏览器 URL 必须同步更新；否则真实刷新/返回会失效。
- workflow-agent viewer 中，workspace tree 必须在以下情况刷新：
  - 首次绑定 step
  - `fileChanges` 数量增加
  - 用户点击“刷新工作区”
- workspace 刷新后，如果当前选中文件已不存在，必须清空 `_selectedFilePath` 与 `_selectedFileContent`。
- Socket.IO payload/ACK 必须先做 `Map<Object?, Object?> -> Map<String, dynamic>` 兼容，不能直接假设所有 payload 都是 `Map<String, dynamic>`。
- standalone Agent 的 failed realtime status 必须同时兼容 `errorMessage` 与 `error`，并把运行时失败 banner 与连接失败 banner 分开。
- 如果历史 assistant message `metadata.incomplete === true` 且存在 `metadata.errorMessage`，消息气泡必须在该条消息下方显示中断原因，避免刷新后只剩不完整正文。

### 4. Validation & Error Matrix

| 条件 | 预期行为 | 断言点 |
|------|----------|--------|
| Flutter Web 冷开且 `gstatic/firebasejs` 不可达 | 登录页/执行页仍能启动，不得在 `runApp()` 前白屏 | `theme_test.dart` + 手动 QA |
| Flutter Web 冷开且远端 CJK 字体不可达 | 中文正文继续可读，不得退化成方块 | `theme_test.dart` + 手动 QA |
| `PushPlatformSupport.isSupported == false` | push provider / service 走 no-op，不发起 Firebase Push 初始化 | `push_notification_provider_test.dart` / `notification_service_test.dart` |
| 终态 `execution.status.changed` 先到，step 状态事件后到或丢失 | provider 通过最终 REST detail 收口到 completed/failed | `execution_monitor_provider_test.dart` |
| WebSocket 连接正常但终态事件漏到前端状态机 | polling 最终把状态收敛到终态 | `execution_monitor_provider_test.dart` |
| Socket ACK / event 为 `Map<Object?, Object?>` | parser 正常归一化，不吞事件 | `execution_socket_service_test.dart` |
| workflow-agent viewer 收到新的 `fileChanges` | workspace 自动刷新 | 组件测试 + 手动 QA |
| Flutter Web 从 execution 点击 agent 卡片 | URL 变为 `/executions/:executionId/steps/:stepId/agent` | `execution_monitor_navigation_test.dart` |

### 5. Good / Base / Bad Cases
- Good：fresh 登录后打开 execution，点击 agent 卡片进入 viewer；运行中能看到文本/工具瀑布流，完成后状态头翻到 `completed`，workspace 文件预览仍可读取。
- Base：viewer 冷开时已完成，仍能从 snapshot + runtime 恢复消息流和文件树。
- Bad：运行时文本和工具能看见，但 `done` 后又被历史重组覆盖；或者 execution API 已 completed，Flutter 头部仍长期显示 `running`。

### 6. Tests Required
- `agentloom_mobile/test/config/theme_test.dart`
  - 断言主题为标题/正文文本提供本地 CJK fallback。
- `agentloom_mobile/test/features/notifications/platform/push_platform_support_test.dart`
  - 断言 Web/Android/iOS 的 capability 判断与 registration platform。
- `agentloom_mobile/test/features/notifications/providers/push_notification_provider_test.dart`
  - 断言 unsupported 平台不触发 push 初始化。
- `agentloom_mobile/test/features/notifications/services/notification_service_test.dart`
  - 断言 unsupported 平台返回 no-op 而不是触发 Firebase 访问。
- `agentloom_mobile/test/features/execution/providers/execution_monitor_provider_test.dart`
  - 终态 REST 收口
  - Connected 状态下 polling 兜底收口
  - agent `output_chunk` 写入 runtime output + segments
- `agentloom_mobile/test/features/execution/services/execution_socket_service_test.dart`
  - ACK / payload map 兼容
- `agentloom_mobile/test/features/execution/widgets/execution_waterfall_test.dart`
  - agent 卡片摘要与跳转入口
- `agentloom_mobile/test/features/agents/screens/agent_conversation_screen_test.dart`
  - standalone agent 的 segments / tool waterfall 回归
- Manual QA
  - Flutter Web fresh 登录
  - 10+ 节点 workflow rerun
  - 进入 workflow-agent viewer，验证 workspace 文件预览与 URL 回退

### 7. Wrong vs Correct

#### Wrong

```dart
if (payload.status.isTerminal) {
  _onTerminalState(currentSnapshot, runtime: currentRuntime);
}
```

#### Correct

```dart
if (payload.status.isTerminal) {
  await _finalizeTerminalState(
    executionId: executionId,
    snapshot: currentSnapshot,
    runtime: currentRuntime,
  );
}
```

---

## 场景：Studio workflow 运行页与调试页中的 compound 节点状态收敛

### 1. Scope / Trigger
- 触发条件：修改以下任一文件时，必须回看本节
  - `agentloom-studio/src/features/canvas/components/WorkflowCanvas.tsx`
  - `agentloom-studio/src/features/execution/components/ReadonlyCanvas.tsx`
  - `agentloom-studio/src/features/execution/components/ExecutionDebugView.tsx`
  - `agentloom-studio/src/features/execution/stores/executionStore.ts`
- 风险点：compound runtime 如果没有把内部节点终态收敛好，Studio 在 workflow 运行页和 execution 调试页里会把 `break / continue` 后未执行的节点错误展示成“等待中”，用户会误判为流程没跑完。

### 2. Signatures
- `WorkflowCanvasPage`
- `ReadonlyCanvas`
- `ExecutionDebugView`
- `/workflows/$workflowId`
- `/executions/$executionId`

### 3. Contracts
- workflow 运行页在 execution 进行中必须持续展示节点状态高亮：
  - 已完成的顶层节点显示 `已完成`
  - 当前活跃 compound 容器显示 `运行中`
  - 尚未进入本轮的内部节点允许显示 `空闲/等待`
- execution 调试页必须直接反映 execution step 终态，而不是自行猜测 compound 行为：
  - `iteration` 成功后，`Iteration Start / Continue / Iteration Agent / Result` 要显示各自最终状态
  - `condition` 未命中的分支节点要显示 `已跳过`
  - `loop` 中 `break` 命中后，本轮未执行的 `loop-prompt / loop-next-state / loop-state / loop-agent / loop-result` 要显示 `已跳过`，不能停留在 `等待中`
- execution 已 completed 时，调试页不应再出现“内部节点 pending 但 execution 已完成”的可见矛盾。

### 4. Validation & Error Matrix

| 条件 | 预期行为 | 断言点 |
|------|----------|--------|
| `iteration` 运行中 | workflow 页能看到顶层资源节点完成、compound 容器运行中、内部节点等待本轮执行 | browser QA |
| `iteration` 完成 | 调试页显示 `Iteration Agent` 已完成，`Result` 已完成 | browser QA |
| `condition` 未命中 fail 分支 | 调试页显示 `Condition Agent Fail` 为 `已跳过` | browser QA |
| `loop` 被 `break` 提前结束 | 调试页把当前轮未执行内部节点显示成 `已跳过` | browser QA |
| execution 已 completed | 调试页 banner 与时间线状态一致，不得一个显示完成一个显示等待 | browser QA |

### 5. Good / Base / Bad Cases
- Good：`loop` 在第 2 轮命中 `break` 后，调试页中剩余内部节点统一显示 `已跳过`，父 `loop` 显示 `已完成`。
- Base：`iteration` 中 `continue` 命中后，最终聚合结果只保留未被丢弃轮次的输出。
- Bad：workflow 页显示 `loop` 已完成，但调试页里 `loop-agent / result` 还显示 `等待中`。

### 6. Tests Required
- Manual QA
  - `QA Condition 端口表达式 20260401`
  - `QA Iteration Agent Sandbox 20260401`
  - `QA Loop Agent Sandbox 20260401`
  - 覆盖 workflow 运行页节点高亮与 execution 调试页状态收敛

### 7. Wrong vs Correct

#### Wrong

```ts
// UI 把 compound 未执行节点继续展示成 waiting
status = step.status === 'pending' ? 'waiting' : step.status
```

#### Correct

```ts
// UI 直接消费 execution step 最终状态，允许 skipped 透传到调试与高亮层
status = step.status
```
