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
| `/marketplace` | MarketplaceBrowsePage | 公开市场浏览：Tabs + 搜索 + 排序 + 详情/安装/评价对话框 |
| `/marketplace/my-listings` | MyMarketplaceListingsPage | Marketplace 发布者自助管理页 |
| `/settings/knowledge-bases` | KnowledgeBasesPage | |
| `/settings/knowledge-bases/$id` | KnowledgeBaseDetailPage | WebSocket 实时状态 |
| `/settings/tool-library` | ToolLibraryPage | MCP imported tools 管理工作台，与 NodePalette 共享查询键 |
| `/templates` | TemplateBrowsePage | Tabs + 搜索 + 网格 + TemplateWizardDialog |

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
│   ├── mcp/          # MCP imported tools 管理工作台（shared api/keys/queries/mutations/components）
│   ├── notification/ # 应用内通知（api/store/socket/bell dropdown）
│   ├── evidence/    # 证据记录查询/展示 + 溯源链 + 引用面板 + 文档查看器 (types/api/hooks/stores/components/lib)
│   ├── marketplace/ # Marketplace 发布侧 + 公共浏览侧（browse/detail/reviews/install）
│   ├── template/    # 工作流模板浏览 + 快速创建 (`TemplateBrowsePage` Tabs/搜索/网格, `TemplateCard`, `TemplateWizardDialog` ReactFlow 预览 + 表单 → `useCreateWorkflow()` → 跳转画布, `staleTime=gcTime=10min`, public API)
│   ├── plugin/      # 插件 API 层（types/api/queries/keys），供画布 NodePalette 动态加载已安装插件
│   └── llm/          # LLM 模型配置
├── shared/           # 跨 feature 共享层
│   ├── api/          # ky client + queryClient + query key factory
│   ├── components/   # Pagination 等通用组件
│   ├── ui/           # 8 个基础组件 (button/input/label/select/slider/switch/tabs/toast)
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

**Canvas 类型兼容性运行时**: `features/canvas/lib/typeEngine/` 现提供主线程单例 `TypeEngineService` façade、底层单例 `TypeEngineRuntime` 与 `runtime.worker.ts`；`connectionCompatibility.ts` 负责同步 guard + cache 读取 + 异步权威检查适配；`WorkflowCanvas.tsx` 在 cache miss 且最终判定 `INCOMPATIBLE` 时会补发持久化错误反馈，避免 preview reset 后丢失原因；`canvasStore.updateNodeData()` 仅在 `inputPorts/outputPorts` 契约签名变化时触发相邻边兼容性重算，并在 refresh 落地前重新基于最新 live `edge.data` merge，以保留并发 `fieldMapping` 编辑，再通过 `refreshEdgeCompatibility()` 标脏让 autosave 持久化新的 `edge.data`；`vite.config.ts` 现通过 `server.fs.allow = [path.resolve(__dirname, '..')]` 放行 sibling `agentloom-type-engine/pkg` wasm 资产，保证 Vite dev 浏览器环境也能拉起 worker + wasm

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
  - **输入参数启动流**: `runWorkflow()` 现接受 `{ inputParams?, schemaVersion?, launchSource? }`；`useStartExecution()` 同步透传这些字段并继续桥接 `executionStore.initExecution(id)`；Web Studio 启动固定使用 `launchSource: 'web-studio'`
- **executionStore** (`features/execution/stores/executionStore.ts`): 维护 `executionId/status/nodes/recentEvents`，并在 `waiting_intervention` 时缓存 `nodeName/requestedAt/decision(partial/structured suggestedContent)/partialContent/submitting`
- **执行诊断增强**: execution 事件/快照与执行详情现对齐 `StructuredErrorDetail` / `TypeMismatchInfo`，`executionStore` 会缓存 `errorDetail`；`FailedNodeError` 除 RFC7807 title/detail 外，还会渲染错误分类 badge、字段级错误、类型不匹配对比与重试记录；时间线失败卡片可跳转关联 `node_error` 证据
- **端口类型映射**: `features/canvas/types/mcpToolMapping.ts` 现直接消费 canonical 8-value backend `PortDataType`（`model|text|json|image|audio|tool|sandbox|knowledge`），并保留 legacy `number`/`boolean -> json` 回退；`mcpToolMapping.test.ts` 覆盖 `model/tool/sandbox/knowledge` 与兼容分支
- **notificationStore** (`features/notification/stores/notificationStore.ts`): 维护 `notifications/unreadCount/isDropdownOpen`，支持 socket 增量插入、服务端列表同步与已读状态本地乐观更新
- **提交动作**: `submitIntervention(executionId, stepId, payload)` 由 store 统一调用执行 API，并负责切换 `intervention.submitting`，让组件层只处理视图与错误呈现
- **快照恢复**: `applySnapshot()` 会优先读取 `step.result.content` 恢复输出，并从 `step.checkpointData.interventionRequestedAt/interventionNodeName/decision/partialContent` 恢复人工介入面板状态
- **认证占位** (`features/execution/hooks/useAuthToken.ts`): `useSyncExternalStore` + localStorage('auth_token')。TODO(auth): 待替换为真实 Supabase 认证
- **执行触发** (`features/execution/hooks/useStartExecution.ts`): POST /run → executionStore.initExecution(id) 桥接
- **Barrel 导出** (`features/execution/index.ts`): 统一导出所有 execution feature 的公共 API
- **Marketplace feature** (`features/marketplace/`): 同时覆盖发布者后台与公共浏览链路。公共侧数据层使用 `publicMarketplaceApi` / `publicMarketplaceQueries` / `publicMarketplaceMutations`，query key 仍集中在 `marketplaceKeys.ts` 的 `publicMarketplaceKeys`；对应 `/marketplace/browse`（公开列表/详情/评论）与已认证 `/marketplace/listings/:id/install|reviews`。public contract 已与 server 收口：列表/评论统一 `{ data, meta }`，install 返回 `{ workflowDefinitionId, name, message }`，submit-review 返回 `{ id, rating, content, createdAt }`；`usePublicListings()` staleTime 2min，`usePublicListingDetail()` staleTime 5min，`useListingReviews()` staleTime 2min。页面层形成 `MarketplaceBrowsePage` → `MarketplaceDetailDialog` → `MarketplaceInstallDialog/ReviewForm` 闭环：浏览页使用 `meta.total/totalPages`、分类/排序/空态已中文化；`MarketplaceListingCard` 使用 `作者：` / `次安装` 文案；`MarketplaceDetailDialog` 评价总数优先取 `reviewsQuery.data.meta.total ?? listing.reviewCount`，头部同步展示 `Download + {useCount} 次安装`，CTA 为“安装到工作区”；`MarketplaceInstallDialog` 默认名称为 `${title} 副本`，安装成功后改用 `workflowDefinitionId` 跳转 `/workflows/$workflowId`。该链路的 4 个 marketplace 定向测试文件已通过 23 个测试。
- **Trigger feature** (`features/trigger/`): `features/trigger/`webhook config 只保证 `token + ipWhitelist`，`secret` 仅在创建成功返回中可选出现；`TriggerHistoryStatus` 包含 `signature_failed`；`WebhookConfigForm` 编辑态只展示 URL/Token 与“一次性 secret”提示，不再重复展示 secret；`API Event` 为 preview-only：dialog 提交按钮禁用、表单只读、card 不允许编辑/启停，server 对 create/update/toggle 返回 409；当前 workflow 详情页仍然是 `WorkflowCanvasPage`（`/workflows/$workflowId`），不要为触发器发明独立 detail route
- **MCP feature** (`features/mcp/`): 统一承载 imported tools 的 `mcpKeys` / `mcpApi` / `mcpQueries` / `mcpMutations` / `ToolLibraryPage` / `McpImportDialog`；shared data layer 现已补齐 `POST /mcp/test` 与 `POST /mcp/configs/:id/test` 前端类型，以及 `useTestMcpConnection()` / `useTestSavedMcpConnection()` mutations。`McpImportDialog` 为真正四步流（配置连接 → 测试连接 → 发现/选择工具 → 导入并同页复核回执），import 模式支持 `stdio | sse | streamable_http` 传输选择并跨步骤保留上下文；reimport 模式现先做 saved-config test，再在下一步独立 rediscover。`ToolLibraryPage` 现展示状态 / 来源 / 配置身份 / 导入与更新时间 / 端口摘要等管理元信息，停用确认使用 Radix Dialog 并在关闭后恢复焦点。`features/canvas/api/mcpToolQueries.ts` / `mcpToolKeys.ts` 仍作为兼容适配层复用 shared query key，确保工具库与 NodePalette 的 `Imported Tools` 同步刷新
- **evidence feature** (`features/evidence/`): `types/index.ts` 使用 discriminated union `EvidencePacket`（`rag_retrieval | agent_decision | tool_output | user_input | intervention`），`EvidenceVerifyResult` 契约为 `{ evidenceId, valid, integrityWarning, currentHash }`；额外引入 `EvidencePacketSummary`、`IntegrityIssue`、`ChainIntegrityStatus`、`EvidenceChainNode`、`EvidenceChainResponse`、`PhysicalLocation.knowledgeBaseId` 与 `chunkContent`，用于 provenance chain 与文档查看器。`evidenceApi.ts` 提供 list/detail/verify/chain/documentContent API，并新增 `fetchAllEvidenceByExecution(executionId, params?)`：按页循环调用 `/executions/:executionId/evidence`（每页 100）并返回拼平后的 `EvidenceRecord[]`；`evidenceKeys.ts` 额外提供 `evidenceKeys.allRecords(executionId, filters?)` 和 `evidenceKeys.documentContent(kbId, docId)`；`evidenceQueries.ts` 提供 `useEvidenceList()`、`useAllEvidenceRecords()`、`useEvidenceDetail(executionId, evidenceId, { enabled? })`、`useEvidenceVerify()`、`useEvidenceChain()`、`useDocumentContent()`，其中 verify 采用 lazy query（`enabled: false`，通过 `refetch()` 触发），`useDocumentContent()` 会依据缓存中的 `expiresIn * 0.8` 计算 staleTime，chain query 使用 `staleTime: 5 * 60 * 1000` 与服务端 Redis TTL 对齐。链节点契约包含 `packetSummary`、`sourceUnavailable`、`sourceModified`、`unavailableReason`、`originalSnapshot`，顶层响应包含 `integrityStatus` 与可选 `cachedAt`。`evidenceUiStore`（Zustand）现管理面板与文档查看器状态：`openPanel(executionId, nodeId?, nodeName?, evidenceId?)`/`selectEvidence(id, {highlight?})`/`openDocumentViewer(state)`/`openFromPhysicalLocation(evidenceId, location)`/`clearHighlight()`/`closePanel()`/`closeDocumentViewer()`/`reset()`，并记录 `panelExecutionId/panelNodeId/panelNodeName/highlightUntil/documentViewer.physicalLocation`。组件层：`EvidenceReferencePanel`（400px 右滑，按 `executionId + nodeId` 拉证据链、支持 Escape 关闭与 2 秒高亮）、`EvidenceCard`（基于真实 `EvidenceRecord` + lazy verify 结构化渲染 5 种 sourceType，卡片与交互按钮分离避免嵌套 button）、`SourceStatusBadge`（valid/modified/unavailable 三态、tooltip 中显示 `currentHash/originalHash/unavailableReason` 并可切换原始快照）、`LocationLink`（直接基于 `PhysicalLocation` 打开 viewer）、`DocumentViewer`（`react-pdf` / `markdown-it` / 文本 `<pre>`，按 page/paragraph/offset/length 做 best-effort 定位高亮）、`DocumentViewerToolbar`（返回、位置标签、外链）、`InlineEvidenceRef`（蓝色上标，hover 懒加载 evidence detail tooltip，点击打开面板并高亮）。`lib/parseEvidenceRefs.ts` 解析 `[ref:evidenceId]` 正则为 `EvidenceRefSegment[]`；`TimelineIO.TextWithRefs` 和 `DecisionAnnotation` 都会渲染内联引用。
- **证据扩展**: `EvidenceSourceType` 现包含 `node_error`；`EvidenceCard` 支持展示错误类型、节点 ID、错误摘要与类型不匹配对比；`InlineEvidenceRef` 的 source type 标签也已覆盖 `node_error`
- **E2EE 证据加密补充**: `features/evidence/types/index.ts` 现除了明文 `rag_retrieval/user_input/intervention/node_error` packet 外，还支持 `agent_decision/tool_output` 的 canonical encrypted envelope（`packet.encryptedPacket + summary`）；`EvidenceRecord` / `EvidenceChainNode` 显式包含 `isEncrypted` 与 `encryptionMetadata`。`EvidenceCard` 现优先解 `packet.encryptedPacket`，并保留对 legacy `encryptionMetadata.encryptedPayload` 的 fallback；同时组件 DOM 已去除嵌套 button，避免 hydration 与可访问性问题。
- **tenant-key feature** (): `clientCrypto.ts` 返回 `GeneratedKeyPair { publicKeyPem, privateKeyPem, privateKeyPkcs8, fingerprint }`，`keyStorage.ts` 保存 PKCS8 二进制材料；`useDecryptContent()` 读取本地二进制密钥后按需导入 non-extractable `CryptoKey` 完成解密。`TenantKeyManagement` 优先展示当前 `active` key，并把 `rotating/revoked` key 显示为“历史密钥”；生成/��入/轮换文案已明确说明“私钥不会上传服务器，但本地密钥材料仍受浏览器扩展、同源脚本与本机安全状态影响”。
- **smart-routing feature** (`features/smart-routing/`): 智能路由 API 层 — `routingApi.ts` (fetchRoutingDecisions，`selectedModelId` 现允许 `null`)、`routingKeys.ts` (query key factory，list key 现纳入 `page/pageSize`)、`routingQueries.ts` (useRoutingDecisions hook)、`index.ts` barrel export。画布集成：`smart-routing` 现不再属于 `DYNAMIC_ONLY_NODE_TYPES`，会出现在 NodePalette；`nodeTypeRegistry.ts` 中该节点已改为 canonical 端口 `model-in-0` / `model-in-1` / `model-out`，默认策略为 `FALLBACK_CHAIN`。`SmartRoutingConfigPanel` 现直接读写 `node.data` 根层，并以模型端口 id 维护 `fallbackPriority`；`CanvasNode.tsx` 会按真实连线数量计算 `connectedModelCount` 传给 `SmartRoutingNodeBody`，不再把输入端口数当作“已连接模型数”。
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
- **工作流输入参数**: `features/workflow/` 现定义 canonical `WorkflowInputSchema` / `WorkflowInputFieldDefinition` / `WorkflowInputFieldVisibility` / `ConversationPlan`；`useWorkflowInputSchema(workflowId, { enabled? })` 继续对接发布态 `GET /workflow-definitions/:id/input-schema`。`features/workflow-input-schema/` 现在由三层组成：`InputSchemaRenderer`（共享 canonical 字段渲染层）、`WorkflowInputSchemaTab`（支持 `form|conversation|hybrid`、字段级 `collectionHint`、creator-side canonical conversation preview 与同源 live preview）以及 `ExecutionLaunchDialog`（Web-first staged collection、summary confirm、`inputParams + schemaVersion + launchSource='web-studio'` 提交）。对话 / 混合模式的 Studio 合同要点：1) 只能复用现有 `WorkflowCanvasPage + WorkflowSettingsPanel + VersionToolbar` surface；2) `conversationPlan.maxTurns` 必须真实驱动 staged collection，而不只是展示文案；3) `single_select` / `multi_select` 在对话路径中也必须遵守 canonical `field.options`，并在 prompt 中直接展示可选值；4) Enter 键提交需避开 IME 组合态；5) execution 仍只能在最终确认后创建。viewer/operator 在 `WorkflowInputSchemaTab` 中继续只读，Run 入口仍仅对 `workflow.status === 'published'` 暴露。
- **WorkflowStatusBar**: 包含 ExecutionStatusIndicator，显示 6 种执行状态 + 进度 (completedSteps/totalSteps)
- **发布警告展示**: `PublishSheet` 发布成功且返回 `warnings[]` 时，显示成功 toast 并在 Sheet 内渲染内联展开式警告列表（每条警告可点击展开查看源/目标端口类型详情），用户点击"完成"按钮关闭。不再使用 toast-per-warning 模式
- **NodeConfigPanel**: 选中节点的侧边栏现在也消费 executionStore，展示实时状态、stepId、重试次数、错误信息与 output 文本流；配置区按“自定义面板优先 → DynamicConfigForm(schema fallback) → 空态文案”分发，并把字段级校验状态同步到 `canvasStore.nodeValidationErrors`
- **DynamicConfigForm / LlmAgentConfigPanel / HttpToolConfigPanel**: 统一使用 react-hook-form + zodResolver + 300ms debounce `onApply`；`LlmAgentConfigPanel` 使用 lazy Monaco 编辑 `systemPrompt`，并要求在 mount 后仍能响应外部 config 更新
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

- schema 驱动节点表单：`features/canvas/lib/configSchemaToZod.ts` 负责把 `NodeConfigSchema` 转为 Zod；`DynamicConfigForm` 渲染 string/enum/number/boolean 字段，并在任一字段 blur 后触发整表校验，以满足多必填字段同时报错的交互约束

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
- `nodeTypeRegistry.ts` (590L) — 16 种节点类型配置 (纯数据，含 smart-routing)

## 环境变量

- `VITE_API_BASE_URL` — API 地址
- `VITE_AUTOSAVE_DEBOUNCE_MS` — 自动保存延迟
- Vite proxy: `/api` → `:3000`，`/socket.io` → `:3000` (ws)
