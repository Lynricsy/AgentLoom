# AGENTLOOM STUDIO 知识库

React 19 + Vite 7 前端。Feature-Slice 架构，TanStack Router/Query，Zustand 状态管理。

## 入口

`index.html` → `main.tsx` → `AppProviders` (QueryClient → Toast → Router) → 路由树

## 路由

| 路由 | 页面 | 备注 |
|------|------|------|
| `/` | — | 重定向到 `/workflows/draft` |
| `/workflows/$workflowId` | WorkflowCanvasPage | ReactFlowProvider 包裹 |
| `/executions/$executionId` | ExecutionDebugView | 只读执行调试视图，三栏布局 |
| `/settings/knowledge-bases` | KnowledgeBasesPage | |
| `/settings/knowledge-bases/$id` | KnowledgeBaseDetailPage | WebSocket 实时状态 |

TanStack Router v1，手动路由树 (`src/app/routes/`)。

## 目录结构

```
src/
├── app/              # 应用壳: providers.tsx, router.tsx, routes/
├── features/         # 业务功能 (Feature-Slice)
│   ├── canvas/       # 工作流画布 (见子 AGENTS.md) ← 最复杂
│   ├── execution/    # 执行监控 (hooks, stores, types)
│   ├── workflow/     # 工作流列表/管理
│   ├── knowledge/    # 知识库管理
│   ├── notification/ # 应用内通知（api/store/socket/bell dropdown）
│   ├── evidence/    # 证据记录查询/展示 + 溯源链 + 引用面板 + 文档查看器 (types/api/hooks/stores/components/lib)
│   └── llm/          # LLM 模型配置
├── shared/           # 跨 feature 共享层
│   ├── api/          # ky client + queryClient + query key factory
│   ├── components/   # Pagination 等通用组件
│   ├── ui/           # 7 个 CVA 基础组件 (button/input/label/select/slider/tabs/toast)
│   ├── lib/          # cn() = clsx + tailwind-merge
│   ├── types/        # ApiResponse<T>, ApiError, PaginatedResponse<T>
│   └── utils/        # caseConverter (snake↔camel，全局 ky hook 应用)
└── test-setup.ts     # Vitest 全局 setup
```

## 状态管理

**2 个 Zustand stores** (immer + devtools + subscribeWithSelector):

| Store | 路径 | 职责 |
|-------|------|------|
| canvasStore | `features/canvas/stores/` | nodes/edges/viewport/selection/search/dirty/mapping |
| executionStore | `features/execution/stores/` | executionId/status/nodes(output/error/retry/streaming/intervention)/recentEvents(cap 50) |
| evidenceUiStore | `features/evidence/stores/` | isOpen/panelExecutionId/panelNodeId/panelNodeName/selectedEvidenceId/highlightUntil/documentViewer |

**自动保存**: `canvasStore.subscribe()` + 2s debounce → PUT /workflow-versions

## API 层

- **ky** HTTP 客户端 (`shared/api/client.ts`)，全局 snake↔camel 转换 hook
- **TanStack Query**: staleTime=30s, retry=1, 禁用 focus-refetch
- **Query Key Factory**: 每个 feature 独立 `xxxKeys` + `xxxApi` + `useXxx` hooks
- **Socket.IO**: `/execution` namespace，typed events (`execution:subscribe`/`execution:unsubscribe` 带 ACK)，`lastEventId` 断线续传，5s 重连 (max 30s)，`callbacksRef` 模式
  - 事件名称: `execution.node.status-changed`, `execution.node.agent-event`, `execution.node.retrying`, `execution.node.output-chunk`, `execution.node.intervention-required`, `execution.node.intervention-resolved`, `execution.status.changed`
  - Subscribe ACK: `{status: 'subscribed' | 'error', currentState, error?}`，错误时调用 `onError` 回调
  - `useExecutionSocket`: 底层 Socket.IO 连接管理，事件监听，ACK 错误处理
  - `useExecutionMonitor`: 桥接 hook，连接 socket 回调到 executionStore actions
  - 已集成到 `WorkflowCanvasPage`，通过 `useExecutionId` 获取活跃执行 ID
- **通知 Socket.IO**: `/notification` namespace，`useNotificationSocket` 复用 execution 的 `resolveSocketUrl + callbacksRef + 单 useEffect` 模式；根布局 `__root.tsx` 负责激活连接，并通过 `NotificationBell`/`NotificationDropdown` 暴露未读数与最近 20 条通知
- **执行 API 层** (`features/execution/api/`):
  - `executionKeys`: TanStack Query key factory (all/lists/details)
  - `executionApi`: `runWorkflow` (POST /workflow-definitions/:id/run), `listExecutions` (GET /workflow-definitions/:id/executions), `getExecution`, `cancelExecution`, `resolveIntervention` (POST /executions/:id/steps/:stepId/intervene)
  - `useExecutionList` / `useExecution`: 列表分页查询 + 执行详情归一化（兼容 `definitionSnapshot` → `workflowVersion.graph`）
  - `executionMutations`: `useRunWorkflow`, `useCancelExecution` (TanStack mutations + cache)
- **executionStore** (`features/execution/stores/executionStore.ts`): 维护 `executionId/status/nodes/recentEvents`，并在 `waiting_intervention` 时缓存 `nodeName/requestedAt/decision(partial/structured suggestedContent)/partialContent/submitting`
- **Story 6.5 诊断增强**: execution 事件/快照与执行详情现对齐 `StructuredErrorDetail` / `TypeMismatchInfo`，`executionStore` 会缓存 `errorDetail`；`FailedNodeError` 除 RFC7807 title/detail 外，还会渲染错误分类 badge、字段级错误、类型不匹配对比与重试记录；时间线失败卡片可跳转关联 `node_error` 证据
- **notificationStore** (`features/notification/stores/notificationStore.ts`): 维护 `notifications/unreadCount/isDropdownOpen`，支持 socket 增量插入、服务端列表同步与已读状态本地乐观更新
- **提交动作**: `submitIntervention(executionId, stepId, payload)` 由 store 统一调用执行 API，并负责切换 `intervention.submitting`，让组件层只处理视图与错误呈现
- **快照恢复**: `applySnapshot()` 会优先读取 `step.result.content` 恢复输出，并从 `step.checkpointData.interventionRequestedAt/interventionNodeName/decision/partialContent` 恢复人工介入面板状态
- **认证占位** (`features/execution/hooks/useAuthToken.ts`): `useSyncExternalStore` + localStorage('auth_token')。TODO(auth): 待替换为真实 Supabase 认证
- **执行触发** (`features/execution/hooks/useStartExecution.ts`): POST /run → executionStore.initExecution(id) 桥接
- **Barrel 导出** (`features/execution/index.ts`): 统一导出所有 execution feature 的公共 API
- **evidence feature** (`features/evidence/`): `types/index.ts` 使用 discriminated union `EvidencePacket`（`rag_retrieval | agent_decision | tool_output | user_input | intervention`），`EvidenceVerifyResult` 契约为 `{ evidenceId, valid, integrityWarning, currentHash }`；Story 6.2/6.4 额外引入 `EvidencePacketSummary`、`IntegrityIssue`、`ChainIntegrityStatus`、`EvidenceChainNode`、`EvidenceChainResponse`、`PhysicalLocation.knowledgeBaseId` 与 `chunkContent`，用于 provenance chain 与文档查看器。`evidenceApi.ts` 提供 list/detail/verify/chain/documentContent API，并新增 `fetchAllEvidenceByExecution(executionId, params?)`：按页循环调用 `/executions/:executionId/evidence`（每页 100）并返回拼平后的 `EvidenceRecord[]`；`evidenceKeys.ts` 额外提供 `evidenceKeys.allRecords(executionId, filters?)` 和 `evidenceKeys.documentContent(kbId, docId)`；`evidenceQueries.ts` 提供 `useEvidenceList()`、`useAllEvidenceRecords()`、`useEvidenceDetail(executionId, evidenceId, { enabled? })`、`useEvidenceVerify()`、`useEvidenceChain()`、`useDocumentContent()`，其中 verify 采用 lazy query（`enabled: false`，通过 `refetch()` 触发），`useDocumentContent()` 会依据缓存中的 `expiresIn * 0.8` 计算 staleTime，chain query 使用 `staleTime: 5 * 60 * 1000` 与服务端 Redis TTL 对齐。链节点契约包含 `packetSummary`、`sourceUnavailable`、`sourceModified`、`unavailableReason`、`originalSnapshot`，顶层响应包含 `integrityStatus` 与可选 `cachedAt`。`evidenceUiStore`（Zustand）现管理面板与文档查看器状态：`openPanel(executionId, nodeId?, nodeName?, evidenceId?)`/`selectEvidence(id, {highlight?})`/`openDocumentViewer(state)`/`openFromPhysicalLocation(evidenceId, location)`/`clearHighlight()`/`closePanel()`/`closeDocumentViewer()`/`reset()`，并记录 `panelExecutionId/panelNodeId/panelNodeName/highlightUntil/documentViewer.physicalLocation`。组件层：`EvidenceReferencePanel`（400px 右滑，按 `executionId + nodeId` 拉证据链、支持 Escape 关闭与 2 秒高亮）、`EvidenceCard`（基于真实 `EvidenceRecord` + lazy verify 结构化渲染 5 种 sourceType，卡片与交互按钮分离避免嵌套 button）、`SourceStatusBadge`（valid/modified/unavailable 三态、tooltip 中显示 `currentHash/originalHash/unavailableReason` 并可切换原始快照）、`LocationLink`（直接基于 `PhysicalLocation` 打开 viewer）、`DocumentViewer`（`react-pdf` / `markdown-it` / 文本 `<pre>`，按 page/paragraph/offset/length 做 best-effort 定位高亮）、`DocumentViewerToolbar`（返回、位置标签、外链）、`InlineEvidenceRef`（蓝色上标，hover 懒加载 evidence detail tooltip，点击打开面板并高亮）。`lib/parseEvidenceRefs.ts` 解析 `[ref:evidenceId]` 正则为 `EvidenceRefSegment[]`；`TimelineIO.TextWithRefs` 和 `DecisionAnnotation` 都会渲染内联引用。
- **Story 6.5 证据扩展**: `EvidenceSourceType` 现包含 `node_error`；`EvidenceCard` 支持展示错误类型、节点 ID、错误摘要与类型不匹配对比；`InlineEvidenceRef` 的 source type 标签也已覆盖 `node_error`
- **执行历史** (`features/execution/components/ExecutionHistoryPanel.tsx`): WorkflowCanvasPage 左上角按需展开的运行记录面板，使用 `RunCard` 跳转 `/executions/$executionId`，空态文案为“还没有执行记录”
- **执行调试视图** (`features/execution/components/ExecutionDebugView.tsx`): Desktop 三栏（ReadonlyCanvas + ExecutionTimelineVertical + ExecutionNodeDetail）/ Mobile 纵向堆叠，支持节点联动选择；中间栏使用 `useTimelineData` hook 聚合步骤与证据数据，`ExecutionNodeDetail` 读取 server DTO 暴露的真实 `steps[].input`
- **垂直时间线** (`features/execution/components/timeline/`): 替代旧 `ExecutionTimeline`（Gantt 风格），包含：
  - `ExecutionTimelineVertical`: CSS grid 容器 + `@tanstack/react-virtual` 虚拟滚动 (>50条)，按 `stepOrder` 分组（并行节点并排）
  - `TimelineEntry`: 可展开条目（失败节点自动展开），折叠态也会显示 AutonomyBadge / InterventionTag，包含 `TimelineHeader`、`TimelineDuration`
  - `TimelineIO`: 折叠摘要（输入预览/输出预览/耗时/重试次数）+ 展开结构化 JSON tree 与 timing meta
  - `DecisionAnnotation`: agent 决策注解（AutonomyBadge FIXED/LLM_SUGGEST/LLM_DECIDE、通过 `react-markdown` + `skipHtml` 渲染的 ReasoningBlock、AlternativesList、InterventionTag 修改摘要）
  - `OutputLevelBadge`: L1-L4 输出格式等级徽章
  - `EvidenceChips`: 证据计数芯片（可点击，`openPanel(executionId, nodeId, nodeName)`）
  - `FailedNodeError`: RFC 7807 错误展示，优先消费 `errorDetail`，并兼容字符串 / JSON fallback
  - `useTimelineData`: 聚合 hook，合并 ExecutionStep[] + evidence records；会通过 `useAllEvidenceRecords()` 跨页拉取 evidence、按 step 选择最新 `agent_decision` / `intervention`，并从 `checkpointData` / evidence / `nodeData` fallback 推导 autonomyMode，返回 `TimelineData[]`（含 autonomyMode、outputFormatLevel、evidenceCount）
- **庆祝效果** (`features/execution/components/CelebrationEffect.tsx`): 基于 `canvas-confetti`，使用 workflow-scoped localStorage key `agentloom:workflow:{workflowId}:first-success-celebrated`，挂载在 `WorkflowCanvasPage`，只在当前会话内同一 execution 从非 `completed` 过渡到 `completed` 时触发
- **VersionToolbar**: 包含 Run 按钮 (Play/运行 ↔ Loader2/执行中)，通过 `onRun`/`isRunning` props 控制
- **WorkflowStatusBar**: 包含 ExecutionStatusIndicator，显示 6 种执行状态 + 进度 (completedSteps/totalSteps)
- **发布警告展示**: `PublishSheet` 发布成功且返回 `warnings[]` 时，显示成功 toast 并在 Sheet 内渲染内联展开式警告列表（每条警告可点击展开查看源/目标端口类型详情），用户点击"完成"按钮关闭。不再使用 toast-per-warning 模式
- **NodeConfigPanel**: 选中节点的侧边栏现在也消费 executionStore，展示实时状态、stepId、重试次数、错误信息与 output 文本流
- **InterventionPanel** (`features/canvas/components/panels/InterventionPanel.tsx`): 人工介入操作面板，approve/modify/reject 三种操作。嵌入 NodeConfigPanel 的 NodeExecutionSection，仅在 `waiting_intervention` 状态显示。组件通过 `useExecutionActions().submitIntervention()` 提交动作，展示 AI 决策建议(confidence/rationale)、部分内容预览以及请求时间上下文，并会把结构化建议内容格式化为可读文本

## 样式

- **Tailwind v4** `@theme` design tokens (CSS custom properties)
- **仅暗色模式**
- **Radix UI** accessible primitives + **CVA** (class-variance-authority)
- **cn()** = clsx + tailwind-merge
- **BEM-like** canvas 专用类在 `index.css`
- **prefers-reduced-motion** 覆盖

## 表单

react-hook-form + @hookform/resolvers + Zod v4

## 如何扩展

| 任务 | 步骤 |
|------|------|
| 新路由 | 创建 `src/app/routes/xxx.tsx` → 添加到 `router.tsx` 路由树 |
| 新 feature | 在 `features/` 创建目录 → api/ + hooks/ + stores/ + types/ |
| 新 UI 组件 | `shared/ui/` (CVA + Radix) 或 `shared/components/` (组合组件) |
| 新服务端状态 | `xxxKeys` factory + `xxxApi` 函数 + `useXxx` query hook |
| 新 Zustand 状态 | 按 canvasStore 模式: immer + devtools + subscribeWithSelector |

## 测试约定

- `*.test.{ts,tsx}` 与源码同级
- `@testing-library/react` + jsdom
- API mock: `vi.mock('@/shared/api/client')`
- Store mock: `vi.hoisted()` + `vi.mock()` zustand stores
- Factory: `makeXxx()` 函数创建测试数据
- `data-testid` 用于元素定位

## 复杂度热点

- `WorkflowCanvas.tsx` (728L) — 5 overlays + connection validation + DAG preview
- `KnowledgeBaseDetailPage.tsx` (700L) — WebSocket + form + pagination + upload
- `LlmModelConfigPanel.tsx` (678L) — 多模型配置面板
- `canvasStore.ts` (535L) — 画布完整状态管理
- `nodeTypeRegistry.ts` (540L) — 13 种节点类型配置 (纯数据)

## 环境变量

- `VITE_API_BASE_URL` — API 地址
- `VITE_AUTOSAVE_DEBOUNCE_MS` — 自动保存延迟
- Vite proxy: `/api` → `:3000`，`/socket.io` → `:3000` (ws)
