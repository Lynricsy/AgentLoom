# AGENTLOOM STUDIO 知识库

React 19 + Vite 7 前端。Feature-Slice 架构，TanStack Router/Query，Zustand 状态管理。

## 入口

`index.html` → `main.tsx` → `AppProviders` (QueryClient → Toast → Router) → 路由树；`index.html` 当前通过 `public/brand/logo.png` 提供 favicon / apple-touch-icon

## 路由

| 路由                                             | 页面                           | 备注                                                                                                                                                                                                              |
| ------------------------------------------------ | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                                              | —                              | 重定向到 `/workflows/draft`                                                                                                                                                                                       |
| `/workflows/$workflowId`                         | WorkflowCanvasPage             | ReactFlowProvider 包裹                                                                                                                                                                                            |
| `/executions/$executionId`                       | ExecutionDebugView             | 只读执行调试视图，三栏布局                                                                                                                                                                                        |
| `/discover`                                      | DiscoverPage                   | 发现页；复用 Marketplace browse/detail/install 链路，但以“发现”语义和入口呈现                                                                                                                                     |
| `/developer-console/earnings`                    | DeveloperEarningsPage          | 开发者收益仪表盘：汇总卡片 + 月度趋势图 + 插件使用排名 + 结算历史；路由保留，但主侧边栏入口当前暂时隐藏                                                                                                           |
| `/marketplace`                                   | MarketplaceBrowsePage          | 公开市场浏览：Tabs + 搜索 + 排序 + 详情/安装/评价对话框                                                                                                                                                           |
| `/marketplace/my-listings`                       | MyMarketplaceListingsPage      | Marketplace 发布者自助管理页                                                                                                                                                                                      |
| `/s/$token`                                      | PublicSharePage                | Workflow / Agent 公开分享页：预览作者/标题/简介/画布，workflow 可复制到工作流，agent 可导入并展示导入报告                                                                                                         |
| `/settings/skills`                               | SkillBrowsePage                | Skill 管理页：分类 Tabs + 搜索 + 启用状态筛选 + 卡片网格 + 详情/启停对话框 + `CreateSkillDialog`（Monaco 编辑器懒加载 SKILL.md 内容编辑）                                                                         |
| `/resources/knowledge-bases`                     | KnowledgeBasesPage             | 知识库列表页，展示文档数 / 知识节点数 / 策略摘要                                                                                                                                                                  |
| `/resources/knowledge-bases/$knowledgeBaseId`    | KnowledgeBaseDetailPage        | WebSocket 实时状态 + embedding 模型配置绑定 + 策略配置 + 测试检索 + 重建入口                                                                                                                                      |
| `/settings/tool-library`                         | ToolLibraryPage                | MCP imported tools 管理工作台，与 NodePalette 共享查询键                                                                                                                                                          |
| `/settings/audit-logs`                           | AuditLogPage                   | owner/admin 审计日志查询页：筛选 + 分页 + 详情 + 资源时序                                                                                                                                                         |
| `/settings/resource-quotas`                      | ResourceGovernancePage         | owner/admin 资源治理设置页：7 个 canonical quota 字段、tenant/workflow governance pause、异常 execution 终止                                                                                                      |
| `/settings/monitoring`                           | MonitoringDashboardPage        | owner/admin 组织级只读运行监控页：`15m/1h/24h` 窗口、执行趋势、当前队列快照摘要、alerts/hotspots/risk summary、跳转 `/settings/resource-quotas` 与 `/executions/$executionId`                                     |
| `/settings/private-deployment`                   | PrivateDeploymentPage          | owner/admin 私有部署设置页：SMTP/LLM proxy/证书/license 配置，与治理/监控/审计入口形成企业运维面板                                                                                                                |
| `/settings/security/autonomy-policy`             | OrganizationAutonomyPolicyPage | owner-only 组织自治策略设置页：上限查看/更新 + 降级 preview/confirm                                                                                                                                               |
| `/login`                                         | LoginPage                      | 邮箱密码登录 + 注册链接；Google / GitHub OAuth 底层能力保留，但登录页入口当前暂时隐藏                                                                                                                             |
| `/register`                                      | RegisterPage                   | 邮箱密码注册 + 登录链接                                                                                                                                                                                           |
| `/auth/callback`                                 | AuthCallbackPage               | Supabase OAuth PKCE 回调处理                                                                                                                                                                                      |
| `/settings/security`                             | SecuritySettingsPage           | 密码修改 / MFA 管理 / 会话列表                                                                                                                                                                                    |
| `/templates`                                     | TemplateBrowsePage             | Tabs + 搜索 + 网格 + TemplateWizardDialog                                                                                                                                                                         |
| `/agents`                                        | AgentListPage                  | Agent 列表/创建入口                                                                                                                                                                                               |
| `/agents/$agentId`                               | AgentCanvasPage                | Agent 配置编辑器画布；顶部工具栏提供状态 badge、保存画布、保存版本、历史记录、发布与仅在已发布时可见的分享入口                                                                                                    |
| `/agents/$agentId/conversations/new`             | NewConversationDraftPage       | 新对话草稿态页；首条消息发送成功后才创建真实 conversation 并跳转正式对话页                                                                                                                                        |
| `/agents/$agentId/conversations/$conversationId` | AgentConversationPage          | 三列对话 UI (对话列表/消息流/上下文面板)；按 Agent `runtimeMode` 显示 `有沙箱 / 无沙箱` 标记，`no_sandbox` 不渲染工作区/进程上下文面板；输入栏支持图片/文件草稿队列，多附件与文本同发，用户消息可回显全部附件预览 |

TanStack Router v1，手动路由树 (`src/app/routes/`)。`__root.tsx` 包含 auth guard：未认证用户重定向到 `/login`。

## 目录结构

```
src/
├── app/              # 应用壳: providers.tsx, router.tsx, routes/
├── features/         # 业务功能 (Feature-Slice)
│   ├── auth/         # Supabase Auth 集成：stores/auth.store.ts (Zustand), hooks/useAuth.ts, hooks/useAuthToken.ts (backward-compat), hooks/useMfa.ts, components (AuthLayout/OAuthButtons/PasswordInput/MfaEnrollDialog/MfaVerifyDialog/SecuritySettings)
│   ├── canvas/       # 工作流画布 (见子 AGENTS.md) ← 最复杂
│   ├── execution/    # 执行监控 (hooks, stores, types)，workflow agent viewer 的 ToolCallList 也承载 rememberable self-evolution 审批卡片
│   ├── workflow/     # 工作流列表/管理
│   ├── knowledge/    # 知识库管理（策略配置、测试检索、重建索引/重切分、统一 `search_knowledge` 工具提示）
│   ├── mcp/          # MCP imported tools 管理工作台（shared api/keys/queries/mutations/components）
│   ├── notification/ # 应用内通知（api/store/socket/bell dropdown）
│   ├── evidence/    # 证据记录查询/展示 + 溯源链 + 引用面板 + 文档查看器 (types/api/hooks/stores/components/lib)
│   ├── audit-log/   # 审计日志 settings 页（types/api/keys/hooks/permissions/components）
│   ├── organization-autonomy-policy/ # 组织自治策略 settings 页（types/api/keys/hooks/permissions/components）
│   ├── resource-governance/ # 资源治理 settings 页（types/api/keys/hooks/permissions/components），承载 quota/governance/termination 管理入口
│   ├── monitoring/ # 组织级只读运行监控 settings 页（types/api/keys/hooks/components），承载执行趋势、当前队列快照摘要、alerts/hotspots/risk summary 与 drill-down 入口
│   ├── discover/    # 发现页（`DiscoverPage` 仅包装 `MarketplaceBrowsePage mode="discover"`）
│   ├── marketplace/ # Marketplace 发布侧 + 公共浏览侧（browse/detail/reviews/install）
│   ├── developer-console/ # 开发者收益仪表盘（api/components/pages），recharts 月度趋势图
│   ├── template/    # 工作流模板浏览 + 快速创建 (`TemplateBrowsePage` Tabs/搜索/网格, `TemplateCard`, `TemplateWizardDialog` ReactFlow 预览 + 表单 → `useCreateWorkflow()` → 跳转画布, `staleTime=gcTime=10min`, public API)
│   ├── plugin/      # 插件 API 层（types/api/queries/keys），供画布 NodePalette 动态加载已安装插件
│   ├── skill/       # Skill 管理功能（types/api/components/hooks）：`SkillBrowsePage`（`/settings/skills`）、`SkillCard`、`SkillDetailDialog`、`SkillBody`、`SkillPanel`、`SkillConfigPanel`、`CreateSkillDialog`（Monaco 编辑器懒加载）、`skill` 画布节点（工作流画布 + agent-canvas）
│   ├── llm/          # LLM 模型配置（支持 `chat|embedding` 用途与 embedding 维度）
│   ├── share/        # Workflow / Agent 分享管理与公开分享页（types/api/hooks/components）
│   ├── trigger/      # 工作流触发器管理 cron/webhook/api_event（types/api/hooks/components）
│   ├── tenant-key/   # 租户 E2EE 密钥管理（clientCrypto/keyStorage/hooks/components）
│   ├── smart-routing/ # 智能路由 API 层（routingApi/routingKeys/routingQueries），无 UI 组件
│   ├── optimization-suggestion/ # Agent 配置优化建议面板（types/api/hooks/components）
│   ├── intervention-policy/ # 介入策略管理（approve/reject/escalate timeout）
│   ├── private-deployment/ # 私有部署设置页 `/settings/private-deployment`（types/api/hooks/components）
│   ├── workflow-input-schema/ # 工作流输入参数 schema 编辑器（无 api/、无 index.ts，属于例外布局）
│   ├── block-library/ # 可复用块库管理
│   ├── agent/       # Agent CRUD 与版本管理 (api/components/hooks/stores/types)：列表/创建/设置，含 `AgentVersionToolbar`、`AgentCreateVersionDialog`、`AgentVersionHistoryPanel`、`AgentPublishDialog`
│   ├── agent-canvas/ # Agent 配置编辑器画布 (components/hooks/stores)：CPU/memory/timeout/lifecycle 参数编辑、显式 `text -> system-prompt-in` 提示词编排、`agent-main` 的 `nativeToolPolicy/selfEvolutionPolicy` 面板，以及 `sub-agent` 的 override/extension 端口；使用 ReactFlow + AGENT_CANVAS_NODE_REGISTRY 子集，非执行 DAG
│   ├── agent-conversation/ # Agent 对话 UI (components/stores/types)：三列布局 (对话列表/消息流/上下文面板)，`/agents/$agentId/conversations/new` 通过 `NewConversationDraftPage` + `ConversationComposer` 进入草稿态，首条消息调用 `POST /agent-definitions/:agentId/conversations/start` 创建真实会话；Socket.IO `/agent-conversation` namespace 实时消息推送，含可展开自进化审批卡片与“重启到新版本”系统卡片；输入栏支持图片/文件上传，`MessageList` 可渲染图片预览/文件卡片/文本文件预览；`sandbox` 对话显示工作区/进程上下文，`no_sandbox` 仅保留消息流中的 Skill/Knowledge/Memory/MCP/自进化能力
│   └── agent-memory/ # Agent 记忆管理 (35 files)：记忆图谱可视化 (d3-force + dagre + ReactFlow)、记忆检索/创建/编辑、审计日志集成
├── shared/           # 跨 feature 共享层
│   ├── api/          # ky client + queryClient + query key factory
│   ├── components/   # Pagination、brand/BrandMark 等通用组件；`brand/BrandMark` 供登录页与侧边栏复用项目 logo
│   ├── ui/           # 8 个基础组件 (button/input/label/select/slider/switch/tabs/toast)
│   ├── lib/          # cn() = clsx + tailwind-merge
│   ├── types/        # ApiResponse<T>, ApiError, PaginatedResponse<T>
│   └── utils/        # caseConverter (snake↔camel，全局 ky hook 应用)
└── test-setup.ts     # Vitest 全局 setup
```

## 状态管理

**6 个 Zustand stores + 2 个 Agent stores** (immer + devtools + subscribeWithSelector):

| Store                  | 路径                                  | 职责                                                                                                         |
| ---------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| canvasStore            | `features/canvas/stores/`             | nodes/edges/viewport/selection/search/dirty/mapping                                                          |
| executionStore         | `features/execution/stores/`          | executionId/status/nodes(output/error/retry/streaming/intervention)/recentEvents(cap 50)                     |
| evidenceUiStore        | `features/evidence/stores/`           | isOpen/panelExecutionId/panelNodeId/panelNodeName/selectedEvidenceId/highlightUntil/documentViewer           |
| notificationStore      | `features/notification/stores/`       | notifications/unreadCount/isDropdownOpen，socket 增量插入与已读乐观更新                                      |
| authStore              | `features/auth/stores/`               | session/user/loading/initialized，Supabase PKCE 认证状态                                                     |
| agentStore             | `features/agent/stores/`              | Agent 列表与选择状态                                                                                         |
| agentCanvasStore       | `features/agent-canvas/stores/`       | Agent 配置画布状态：nodes/edges/viewport/dirty，AGENT_CANVAS_NODE_REGISTRY 子集节点类型                      |
| agentConversationStore | `features/agent-conversation/stores/` | 对话状态：messages/streaming/conversationList/activeConversationId，Socket.IO `/agent-conversation` 事件驱动 |

**自动保存**: `canvasStore.subscribe()` + 2s debounce → `PATCH /workflow-definitions/:id`；`workflow.version` 仍是草稿修订号/OCC 版本，用户可见发布版号应读取 `publishedReleaseNumber`，未发布记录在 UI 上应使用“快照”语义而不是 `vN`。

**Canvas 类型兼容性运行时**: `features/canvas/lib/typeEngine/` 现提供主线程单例 `TypeEngineService` façade、底层单例 `TypeEngineRuntime` 与 `runtime.worker.ts`；`connectionCompatibility.ts` 负责同步 guard + cache 读取 + 异步权威检查适配；`WorkflowCanvas.tsx` 在 cache miss 且最终判定 `INCOMPATIBLE` 时会补发持久化错误反馈，避免 preview reset 后丢失原因；`canvasStore.updateNodeData()` 仅在 `inputPorts/outputPorts` 契约签名变化时触发相邻边兼容性重算，并在 refresh 落地前重新基于最新 live `edge.data` merge，以保留并发 `fieldMapping` 编辑，再通过 `refreshEdgeCompatibility()` 标脏让 autosave 持久化新的 `edge.data`；`vite.config.ts` 现通过 `server.fs.allow = [path.resolve(__dirname, '..')]` 放行 sibling `agentloom-type-engine/pkg` wasm 资产，保证 Vite dev 浏览器环境也能拉起 worker + wasm

## API 层

- **ky** HTTP 客户端 (`shared/api/client.ts`)，全局 snake↔camel 转换 hook，注入 `Bearer` token（从 Supabase session 获取），401 时通过 `supabase.auth.refreshSession()` 刷新重试，刷新失败自动 signOut
- **TanStack Query**: staleTime=30s, retry=1, 禁用 focus-refetch
- **Query Key Factory**: 每个 feature 独立 `xxxKeys` + `xxxApi` + `useXxx` hooks
- **Socket.IO**: `/execution` namespace，typed events (`execution:subscribe`/`execution:unsubscribe` 带 ACK)，`lastEventId` 断线续传，5s 重连 (max 30s)，`callbacksRef` 模式
  - 事件名称: `execution.node.status-changed`, `execution.node.agent-event`, `execution.node.retrying`, `execution.node.output-chunk`, `execution.node.intervention-required`, `execution.node.intervention-resolved`, `execution.status.changed`
  - Subscribe ACK: `{status: 'subscribed' | 'error', currentState, error?}`，错误时调用 `onError` 回调
  - `useExecutionSocket`: 底层 Socket.IO 连接管理，事件监听，ACK 错误处理
  - `useExecutionMonitor`: 桥接 hook，连接 socket 回调到 executionStore actions；`execution.node.status-changed` 若带 `result/checkpointData`，必须直接合并到 executionStore，避免 `text-output/json-output` 这类 one-shot 节点只能靠刷新 snapshot 才显示最终输出
  - 已集成到 `WorkflowCanvasPage`，通过 `useExecutionId` 获取活跃执行 ID
- **通知 Socket.IO**: `/notification` namespace，`useNotificationSocket` 复用 execution 的 `resolveSocketUrl + callbacksRef + 单 useEffect` 模式；根布局 `__root.tsx` 负责激活连接，并通过 `NotificationBell`/`NotificationDropdown` 暴露未读数与最近 20 条通知
- **Agent 对话 Socket.IO**: `/agent-conversation` namespace，与 `/execution` 对称，复用 EventBridge 模式实现对话级实时事件推送，支持 JWT + MFA 认证；`useAgentConversationSocket` 管理连接与事件监听，桥接 `agentConversationStore` 更新消息流；`agentConversationStore.actions.sendMessage()` 支持 `string | OutgoingConversationMessage`，会保留 `contentType + metadata.attachments[]`（并兼容 legacy `metadata.attachment`）做 optimistic user message、socket emit 与 history round-trip；`AgentConversationPage` 输入栏会先把图片/文件放进输入栏上方草稿区，再由用户点击发送一次性提交同一条文本 + 多附件消息；单附件上限 `1.5 MB`、单消息附件总量上限 `10 MB`、文本内联上限 `200 KB`，文本文件优先以内联文本资源进入上下文，二进制文件与图片走 `dataBase64`，sandbox runtime 会在 prompt 中额外提示 `/workspace/uploads/...` 路径；`MessageList` 与共享 `ToolCallCard` 负责渲染自进化 diff/风险信息、四档审批按钮（允许一次 / 本会话同类始终允许 / 拒绝一次 / 本会话同类始终拒绝）、“重启到新版本”卡片，以及用户侧全部图片预览/文件卡片/文本文件内容预览；`PreparationCard` / `AgentConversationPage` 会根据 `runtimeMode` 区分“沙箱启动中”与“无沙箱 Agent 无需准备沙箱”，并避免对 `no_sandbox` 会话误请求 sandbox stats
- **Agent 子代理视图事实**: `AgentConversationPage` 的子代理 drill-in 视图优先消费 live `subAgentStreams`；若当前会话只有历史消息，则会优先从 assistant `metadata.subAgentStreams` 恢复与主 agent 相同的文本/思考/工具瀑布；只有旧历史缺少 durable child stream 时，才会退回 `wait_for_subagents` / `get_subagent_status` 结果与 `subagent_completion_notice` 组成的摘要视图；若两者都没有对应 handle 的可展示数据，则不会切换到仅 breadcrumb 变化的假子视图
- **Agent 对话工作区预览优先级**: standalone sandbox Agent 对话冷开时，若 Agent detail 同时带顶层 `workspaceSnapshotId` 与 `sandboxConfig.restoreWorkspaceId`，Studio 必须优先预载 `restoreWorkspaceId` 对应目录树，因为 live sandbox 真正 restore 的是该工作区；只有不存在 `restoreWorkspaceId` 时才回退到 `workspaceSnapshotId`
- **Agent 对话列表项语义**: `ConversationSidebar` 的会话切换点击区域与删除按钮是 sibling 关系，不允许出现 `button` 嵌套 `button` 的交互结构
- **Agent 新对话草稿态**: `/agents/$agentId/conversations/new` 只渲染草稿页，挂载时不得调用 `createConversation()`；`ConversationSidebar` 在该路由下允许 `currentConversationId = null`，首条消息需走 `startConversation()` 成功后再导航到 `/agents/$agentId/conversations/$conversationId`
- **执行 API 层** (`features/execution/api/`):
  - `executionKeys`: TanStack Query key factory (all/lists/details)
  - `executionApi`: `runWorkflow` (POST /workflow-definitions/:id/run), `listExecutions` (GET /workflow-definitions/:id/executions), `getExecution`, `cancelExecution`, `resolveIntervention` (POST /executions/:id/steps/:stepId/intervene)
  - `useExecutionList` / `useExecution`: 列表分页查询 + 执行详情归一化（兼容 `definitionSnapshot` → `workflowVersion.graph`）
  - `executionMutations`: `useRunWorkflow`, `useCancelExecution` (TanStack mutations + cache)
  - **输入参数启动流**: `runWorkflow()` 现接受 `{ inputParams?, schemaVersion?, launchSource? }`；`useStartExecution()` 同步透传这些字段并继续桥接 `executionStore.initExecution(id)`；Web Studio 编辑器启动固定使用 `launchSource: 'web-studio'`，服务端会据此执行当前草稿定义而非 published version snapshot
- **executionStore** (`features/execution/stores/executionStore.ts`): 维护 `executionId/status/nodes/recentEvents`，并在 `waiting_intervention` 时缓存 `nodeName/requestedAt/decision(partial/structured suggestedContent)/partialContent/submitting`
- **执行诊断增强**: execution 事件/快照与执行详情现对齐 `StructuredErrorDetail` / `TypeMismatchInfo`，`executionStore` 会缓存 `errorDetail`；`FailedNodeError` 除 RFC7807 title/detail 外，还会渲染错误分类 badge、字段级错误、类型不匹配对比与重试记录；时间线失败卡片可跳转关联 `node_error` 证据
- **端口类型映射**: `features/canvas/types/mcpToolMapping.ts` 现直接消费 canonical 8-value backend `PortDataType`（`model|text|json|image|audio|tool|sandbox|knowledge`），并保留 legacy `number`/`boolean -> json` 回退；`mcpToolMapping.test.ts` 覆盖 `model/tool/sandbox/knowledge` 与兼容分支
- **notificationStore** (`features/notification/stores/notificationStore.ts`): 维护 `notifications/unreadCount/isDropdownOpen`，支持 socket 增量插入、服务端列表同步与已读状态本地乐观更新
- **提交动作**: `submitIntervention(executionId, stepId, payload)` 由 store 统一调用执行 API，并负责切换 `intervention.submitting`，让组件层只处理视图与错误呈现
- **快照恢复**: `applySnapshot()` 会优先读取 `step.result.content` 恢复输出，并从 `step.checkpointData.interventionRequestedAt/interventionNodeName/decision/partialContent` 恢复人工介入面板状态
- **认证** (`features/auth/`): Supabase Auth PKCE 集成。`auth.store.ts`（Zustand）管理 session/user/loading/initialized 状态，`useAuth` hook 提供 signIn/signUp/signOut/signInWithOAuth 操作，`useAuthToken` hook 保持后向兼容（从 Supabase session 读取 access token）。`useMfa` hook 封装 TOTP 注册/验证/撤销。组件：`AuthLayout`（居中卡片布局）、`OAuthButtons`（保留的 Google/GitHub OAuth 按钮组件，当前登录页入口暂时隐藏）、`PasswordInput`（带可见性切换）、`MfaEnrollDialog`（TOTP QR 码注册 + 验证）、`MfaVerifyDialog`（TOTP 验证码输入）、`SecuritySettings`（密码修改/MFA 管理/活跃会话列表）。依赖 `@supabase/supabase-js`，Supabase client 初始化在 `shared/lib/supabase.ts`
- **执行触发** (`features/execution/hooks/useStartExecution.ts`): POST /run → executionStore.initExecution(id) 桥接
- **Barrel 导出** (`features/execution/index.ts`): 统一导出所有 execution feature 的公共 API
- **Agent feature** (`features/agent/`): Agent CRUD 页面 (列表/创建/设置)。`agentApi.ts` 封装 Agent 定义与版本 REST API，`agentKeys.ts` 提供 TanStack Query key factory，`useAgentList`/`useAgentDetail` query hooks，`useCreateAgent`/`useUpdateAgent`/`usePublishAgent` mutations。`AgentListPage` 支持搜索与状态筛选
- **Agent Canvas feature** (`features/agent-canvas/`): Agent 配置编辑器画布，使用 ReactFlow 渲染 `AGENT_CANVAS_NODE_REGISTRY` 子集节点（CPU/memory/timeout/lifecycle 等运行时参数），非执行 DAG。该画布现在与 workflow 共享显式 `text` 文本常量节点，并使用 `text -> system-prompt-in` 作为 system prompt 的图结构表达；`sub-agent` 端口固定为 override（`system-prompt-in/model-in/schema-in`）与 extension（`tools-in/skills-in/sub-agents-in/knowledge-in/memory-in`）两类，不提供 `sandbox-in`。`AgentNodeConfigPanel` 为 `agent-main` 挂载 `AgentMainConfigPanel`，统一编辑 `nativeToolPolicy` 与 `selfEvolutionPolicy`；该面板容器采用“header 固定 + `min-h-0 flex-1 overflow-y-auto` 内容区”结构，确保矮窗口下鼠标滚轮可以继续查看自进化等长表单选项；`agentCanvasStore` (Zustand) 管理画布状态，支持自动保存到 `agent_versions`
- **Agent Canvas 快照自愈**: `agentCanvasStore` 在消费自进化或历史快照时，必须先把缺失的 `inputPorts/outputPorts` 收敛为 `[]` 再走注册表 hydrate；`text` 节点若仍携带 legacy root-level `text/value/content`，要先回填到 `config.text`。Agent Canvas 读取节点配置时优先用 `AGENT_CANVAS_NODE_REGISTRY`，只有 `http-tool` / `code-tool` 等 workflow/agent 共享节点才回退到通用注册表，避免单个坏节点把整页画布打进 error boundary
- **Agent Conversation feature** (`features/agent-conversation/`): 三列对话 UI (对话列表/消息流/上下文面板)。`NewConversationDraftPage` 复用 `ConversationComposer` 承载 `/agents/$agentId/conversations/new` 草稿态，首条消息调用 `POST /agent-definitions/:agentId/conversations/start` 并在成功后跳转真实 conversation 路由；`agentConversationStore` (Zustand) 管理消息列表与流式状态，页面进入时先通过 `GET /agent-conversations/:id/messages` 加载历史，再通过 Socket.IO `/agent-conversation` namespace 接续实时消息与 mid-stream injection。assistant 历史消息会保留 `toolCalls`，因此知识库检索结果可在消息列表中复现；若 assistant `metadata.subAgentStreams` 存在，child drill-in 会直接用这份 durable stream 恢复历史瀑布，而不是重新根据摘要拼装。对话收到顶层 `conversation.agent.done` 后会重新拉取一次消息历史，把数据库中的最终 assistant 正文作为 canonical 收口，避免纯工具调用轮次因没有 `message_chunk` 而丢失最终回复。`SandboxComputerPanel` 右上角会通过 `GET /agent-conversations/:id/sandbox/stats` 轮询 conversation 绑定沙箱的真实 CPU/MEM/DISK 值，`diskUsage=0` 时显示 `0 B`；执行开始时工具 tab 默认选中，但用户手动切到其他 tab 后不会再被后续工具事件抢回
- **Agent 对话进程监视器**: `SandboxComputerPanel` 现会通过 `GET /agent-conversations/:id/sandbox/processes` 拉取真实进程快照并渲染 PID/CPU/MEM/状态/运行时长表；只有当前视图没有 conversation 级实时进程数据源时，进程页才退回显示最近活动摘要
- **LLM feature** (`features/llm/`): 采用 `Provider → Model` 二级结构，Provider 与模型各自通过独立 query/mutation 管理；Provider 面板、模型配置弹窗与画布 `LlmModelConfigPanel` 现在统一改为直接输入明文 API Key，服务端负责加密托管并回写 provider 级 `apiKeyId`，不再依赖单独的 API Key 选择页；`PrivateCloudConfigSection` 现在直连真实 `/api/v1/llm/test-connection` 与 `/api/v1/llm/private-cloud/models`，支持“复用已托管 key 或本次临时输入 key”两条路径；模型管理页支持 `chat|embedding` 两种用途，embedding 配置可录入 `embeddingDimensions`，列表卡片会展示 `Embedding` 标记与维度，并展示基础价、缓存读/写价与 token 阶梯价 badge；编辑已有模型时必须保留 `pricing.tiers` 与 `cachedReadPer1MTokens/cachedWritePer1MTokens` 元信息；`GlobalModelSelector` 已改为自定义 listbox，按 Provider 分组并显示 `ProviderIcon`，仅展示启用中的 Provider/模型；`ProviderIcon` 在 Studio 深色界面统一使用 `@lobehub/icons-static-png` 的 unpkg dark PNG 资源，并将 `anthropic -> claude-color`、`google -> gemini-color`、`siliconflow -> siliconcloud-color` 等 provider slug 归一到对应产品彩色资产；legacy `icons.lobehub.com/icons/.../color.svg` 与旧 `icons-static-svg` / `icons-static-png light` managed URL 都会被重写到当前 dark canonical 资源；`adaptModelEntityToInfo()` 会保留 `providerEntity` 供编辑态回填 provider 级 `baseUrl/apiKeyId`；`llmModelApi.ts` 对该资源使用 camelCase 请求体（如 `modelType`、`embeddingDimensions`），不要机械套用 `toSnakeBody()`
- **Knowledge feature** (`features/knowledge/`): `KnowledgeBaseDetailPage` 设置表单使用 `embeddingModelConfigId` 绑定 embedding 模型配置，并且只展示 `modelType === 'embedding'` 的模型选项；文档列表与处理状态继续通过 REST + WebSocket 组合刷新
- **Marketplace feature** (`features/marketplace/`): 同时覆盖发布者后台与公共浏览链路。公共侧数据层使用 `publicMarketplaceApi` / `publicMarketplaceQueries` / `publicMarketplaceMutations`，query key 仍集中在 `marketplaceKeys.ts` 的 `publicMarketplaceKeys`；对应 `/marketplace/browse`（公开列表/详情/评论）与已认证 `/marketplace/listings/:id/install|reviews`。public contract 已与 server 收口：列表/评论统一 `{ data, meta }`，install 返回 `{ workflowDefinitionId, name, message }`，submit-review 返回 `{ id, rating, content, createdAt }`；`submitMarketplaceListing()` 直接发送 camelCase DTO（尤其是 `workflowVersionId`），不要再对 Marketplace submit 请求机械套用 `toSnakeBody()`。`usePublicListings()` staleTime 2min，`usePublicListingDetail()` staleTime 5min，`useListingReviews()` staleTime 2min。页面层形成 `MarketplaceBrowsePage` → `MarketplaceDetailDialog` → `MarketplaceInstallDialog/ReviewForm` 闭环：浏览页使用 `meta.total/totalPages`、分类/排序/空态已中文化；`MarketplaceListingCard` 使用 `作者：` / `次安装` 文案；`MarketplaceDetailDialog` 评价总数优先取 `reviewsQuery.data.meta.total ?? listing.reviewCount`，头部同步展示 `Download + {useCount} 次安装`，CTA 为“安装到工作区”；`MarketplaceInstallDialog` 默认名称为 `${title} 副本`，安装成功后改用 `workflowDefinitionId` 跳转 `/workflows/$workflowId`；`MarketplacePublishDialog` 只在 `open=false -> true` 时 reset 表单与 mutation，避免因为 mutation result identity 变化在打开弹窗时触发重复 reset/React 崩溃。该链路的 4 个 marketplace 定向测试文件已通过 23 个测试.
- **Trigger feature** (`features/trigger/`): `features/trigger/`webhook config 只保证 `token + ipWhitelist`，`secret` 仅在创建成功返回中可选出现；`TriggerHistoryStatus` 包含 `signature_failed`；`WebhookConfigForm` 编辑态只展示 URL/Token 与“一次性 secret”提示，不再重复展示 secret；`API Event` 类型支持完整 CRUD 与启停操作，与 / 同等管理；当前 workflow 详情页仍然是 `WorkflowCanvasPage`（`/workflows/$workflowId`），不要为触发器发明独立 detail route
- **MCP feature** (`features/mcp/`): 统一承载 imported tools 的 `mcpKeys` / `mcpApi` / `mcpQueries` / `mcpMutations` / `ToolLibraryPage` / `McpImportDialog`；shared data layer 现已补齐 `POST /mcp/test` 与 `POST /mcp/configs/:id/test` 前端类型，以及 `useTestMcpConnection()` / `useTestSavedMcpConnection()` mutations。`McpImportDialog` 为真正四步流（配置连接 → 测试连接 → 发现/选择工具 → 导入并同页复核回执），import 模式支持 `stdio | sse | streamable_http` 传输选择并跨步骤保留上下文；reimport 模式现先做 saved-config test，再在下一步独立 rediscover。`ToolLibraryPage` 现展示状态 / 来源 / 配置身份 / 导入与更新时间 / 端口摘要等管理元信息，停用确认使用 Radix Dialog 并在关闭后恢复焦点。`features/canvas/api/mcpToolQueries.ts` / `mcpToolKeys.ts` 仍作为兼容适配层复用 shared query key，确保工具库与 NodePalette 的 `Imported Tools` 同步刷新
- **evidence feature** (`features/evidence/`): `types/index.ts` 使用 discriminated union `EvidencePacket`（`rag_retrieval | agent_decision | tool_output | user_input | intervention`），`EvidenceVerifyResult` 契约为 `{ evidenceId, valid, integrityWarning, currentHash }`；额外引入 `EvidencePacketSummary`、`IntegrityIssue`、`ChainIntegrityStatus`、`EvidenceChainNode`、`EvidenceChainResponse`、`PhysicalLocation.knowledgeBaseId` 与 `chunkContent`，用于 provenance chain 与文档查看器。`evidenceApi.ts` 提供 list/detail/verify/chain/documentContent API，并新增 `fetchAllEvidenceByExecution(executionId, params?)`：按页循环调用 `/executions/:executionId/evidence`（每页 100）并返回拼平后的 `EvidenceRecord[]`；`evidenceKeys.ts` 额外提供 `evidenceKeys.allRecords(executionId, filters?)` 和 `evidenceKeys.documentContent(kbId, docId)`；`evidenceQueries.ts` 提供 `useEvidenceList()`、`useAllEvidenceRecords()`、`useEvidenceDetail(executionId, evidenceId, { enabled? })`、`useEvidenceVerify()`、`useEvidenceChain()`、`useDocumentContent()`，其中 verify 采用 lazy query（`enabled: false`，通过 `refetch()` 触发），`useDocumentContent()` 会依据缓存中的 `expiresIn * 0.8` 计算 staleTime，chain query 使用 `staleTime: 5 * 60 * 1000` 与服务端 Redis TTL 对齐；evidence export 相关 `useEvidenceExportJob()` 会在 job 处于 `queued` / `running` 时每 5 秒自动轮询，进入终态后停止。链节点契约包含 `packetSummary`、`sourceUnavailable`、`sourceModified`、`unavailableReason`、`originalSnapshot`，顶层响应包含 `integrityStatus` 与可选 `cachedAt`。`evidenceUiStore`（Zustand）现管理面板与文档查看器状态：`openPanel(executionId, nodeId?, nodeName?, evidenceId?)`/`selectEvidence(id, {highlight?})`/`openDocumentViewer(state)`/`openFromPhysicalLocation(evidenceId, location)`/`clearHighlight()`/`closePanel()`/`closeDocumentViewer()`/`reset()`，并记录 `panelExecutionId/panelNodeId/panelNodeName/highlightUntil/documentViewer.physicalLocation`。组件层：`EvidenceReferencePanel`（400px 右滑，按 `executionId + nodeId` 拉证据链、支持 Escape 关闭与 2 秒高亮）、`EvidenceCard`（基于真实 `EvidenceRecord` + lazy verify 结构化渲染 5 种 sourceType，卡片与交互按钮分离避免嵌套 button）、`SourceStatusBadge`（valid/modified/unavailable 三态、tooltip 中显示 `currentHash/originalHash/unavailableReason` 并可切换原始快照）、`LocationLink`（直接基于 `PhysicalLocation` 打开 viewer）、`DocumentViewer`（`react-pdf` / `markdown-it` / 文本 `<pre>`，按 page/paragraph/offset/length 做 best-effort 定位高亮）、`DocumentViewerToolbar`（返回、位置标签、外链）、`InlineEvidenceRef`（蓝色上标，hover 懒加载 evidence detail tooltip，点击打开面板并高亮）。`lib/parseEvidenceRefs.ts` 解析 `[ref:evidenceId]` 正则为 `EvidenceRefSegment[]`；`TimelineIO.TextWithRefs` 和 `DecisionAnnotation` 都会渲染内联引用。
- **证据扩展**: `EvidenceSourceType` 现包含 `node_error`；`EvidenceCard` 支持展示错误类型、节点 ID、错误摘要与类型不匹配对比；`InlineEvidenceRef` 的 source type 标签也已覆盖 `node_error`
- **audit-log feature** (`features/audit-log/`): 组织级审计日志页位于 `/settings/audit-logs`，由 `auditLogApi.ts` / `auditLogKeys.ts` / `useAuditLogs.ts` 驱动，查询 contract 对齐后端 `GET /audit-logs`、`GET /audit-logs/:id`、`GET /audit-logs/resources/:resourceType/:resourceId/sequence`，支持 `from/to/eventType/resourceType/resourceId/executionId/actorType/actorId/page/pageSize`；`auditLogPermissions.ts` 复用 auth token 角色解码思路，但 direct-route gating 仅允许 `owner/admin`，且在多角色 token 中优先返回 `owner/admin`，避免被 `viewer/creator` 提前遮蔽。`AuditLogPage` 采用 settings 风格筛选 + 分页卡片列表 + 结构化 JSON 详情 + 资源时序查询，不在 header 顶栏新增入口。
- **organization-autonomy-policy feature** (`features/organization-autonomy-policy/`): `/settings/security/autonomy-policy` 复用 settings 风格布局与 token 解码门禁，仅允许 `owner`；通过 `getOrganizationIdFromToken()` 从 auth token 解析 `organizationId/orgId/tenantId` 后调用 `GET/PUT/POST /organizations/:id/autonomy-policy*`，支持“仅更新策略”、`downgrade-preview` 与 `downgrade-confirm` 两段式收紧流程。当前组织策略卡片会展示 `organizationId`、`version`、`updatedAt` 与 `updatedBy` 元信息。共享 `autonomyModePolicy.ts` 提供 `AUTONOMY_MODES`、mode label/description、cap 比较和格式化 helper，供 settings 页、LLM panel 与优化建议阻断 UI 复用。
- **resource-governance feature** (`features/resource-governance/`): `/settings/resource-quotas` 复用 settings 风格布局与 token 解码门禁，允许 `owner/admin`；通过 `resourceGovernanceApi.ts` 对接 `GET /organizations/:id/resource-governance`、`PUT /organizations/:id/resource-governance/quota`、`PUT /organizations/:id/resource-governance/controls`、`POST /organizations/:id/resource-governance/executions/:executionId/terminate` 四个 API。`ResourceGovernancePage` 提供 metadata、7 个 quota 字段表单、tenant/workflow governance controls、异常 execution termination 表单与 action summary；`resourceGovernancePermissions.ts` 负责从 `organizationId/orgId/tenantId` claims 解析组织与租户，并显式区分“治理暂停只阻止新执行进入”与 execution `paused`。
- **monitoring feature** (`features/monitoring/`): `/settings/monitoring` 复用 settings 风格布局与 `resource-governance` token 门禁，仅允许 `owner/admin`；通过 `monitoringApi.ts` 对接 `GET /organizations/:id/monitoring?window=15m|1h|24h`，`monitoringKeys.dashboard(organizationId, window)` 显式把时间窗口放进 query key。页面由 `MonitoringDashboardPage` 组合 summary cards、`recharts` 执行趋势图、alerts/risk summary、metric source 说明与 hotspots；队列深度只在摘要/告警/热点中呈现当前 snapshot，不渲染成历史趋势曲线；页面保持只读，不暴露 quota/governance/termination mutation，并继续区分治理暂停与 execution `paused（人工介入）`。
- **optimization-suggestion feature** (`features/optimization-suggestion/`): 建议状态现支持 `pending | applied | dismissed | blocked`；`analysisMetadata.policyBlock` 承载自治策略阻断原因（含 `autonomyCap/rawMode/canonicalMode/replacementMode/reasonCode/message/blockedAt`）；`OptimizationSuggestionCard` 会显式渲染 blocked badge/reason 并移除 emoji-like type icon，`OptimizationSuggestionsPanel` 会在 422 policy-block 响应时展示组织上限与建议替代模式。
- **E2EE 证据加密补充**: `features/evidence/types/index.ts` 现除了明文 `rag_retrieval/user_input/intervention/node_error` packet 外，还支持 `agent_decision/tool_output` 的 canonical encrypted envelope（`packet.encryptedPacket + summary`）；`EvidenceRecord` / `EvidenceChainNode` 显式包含 `isEncrypted` 与 `encryptionMetadata`。`EvidenceCard` 现优先解 `packet.encryptedPacket`，并保留对 legacy `encryptionMetadata.encryptedPayload` 的 fallback；同时组件 DOM 已去除嵌套 button，避免 hydration 与可访问性问题。
- **tenant-key feature** (): `clientCrypto.ts` 返回 `GeneratedKeyPair { publicKeyPem, privateKeyPem, privateKeyPkcs8, fingerprint }`，`keyStorage.ts` 保存 PKCS8 二进制材料；`useDecryptContent()` 读取本地二进制密钥后按需导入 non-extractable `CryptoKey` 完成解密。`TenantKeyManagement` 优先展示当前 `active` key，并把 `rotating/revoked` key 显示为“历史密钥”；生成/导入/轮换文案已明确说明“私钥不会上传服务器，但本地密钥材料仍受浏览器扩展、同源脚本与本机安全状态影响”。
- **smart-routing feature** (`features/smart-routing/`): 智能路由 API 层 — `routingApi.ts` (fetchRoutingDecisions，`selectedModelId` 现允许 `null`)、`routingKeys.ts` (query key factory，list key 现纳入 `page/pageSize`)、`routingQueries.ts` (useRoutingDecisions hook)、`index.ts` barrel export。画布集成：`smart-routing` 现不再属于 `DYNAMIC_ONLY_NODE_TYPES`，会出现在 NodePalette；`nodeTypeRegistry.ts` 中该节点已改为 canonical 端口 `model-in-0` / `model-in-1` / `model-out`，默认策略为 `FALLBACK_CHAIN`。`SmartRoutingConfigPanel` 现直接读写 `node.data` 根层，并以模型端口 id 维护 `fallbackPriority`；`CanvasNode.tsx` 会按真实连线数量计算 `connectedModelCount` 传给 `SmartRoutingNodeBody`，不再把输入端口数当作“已连接模型数”。
- **执行历史** (`features/execution/components/ExecutionHistoryPanel.tsx`): WorkflowCanvasPage 左上角按需展开的运行记录面板，使用 `RunCard` 跳转 `/executions/$executionId`，空态文案为“还没有执行记录”
- **执行调试视图** (`features/execution/components/ExecutionDebugView.tsx`): Desktop 三栏（ReadonlyCanvas + ExecutionTimelineVertical + ExecutionNodeDetail）/ Mobile 纵向堆叠，支持节点联动选择；中间栏使用 `useTimelineData` hook 聚合步骤与证据数据，`ExecutionNodeDetail` 读取 server DTO 暴露的真实 `steps[].input`
- **垂直时间线** (`features/execution/components/timeline/`): 替代旧 `ExecutionTimeline`（Gantt 风格），包含：
  - `ExecutionTimelineVertical`: CSS grid 容器 + `@tanstack/react-virtual` 虚拟滚动 (>50条)，按 `stepOrder` 分组（并行节点并排）
  - `TimelineEntry`: 可展开条目（失败节点自动展开），折叠态也会显示 AutonomyBadge / InterventionTag，包含 `TimelineHeader`、`TimelineDuration`
  - `TimelineIO`: 折叠摘要（输入预览/输出预览/耗时/重试次数）+ 展开结构化 JSON tree 与 timing meta；与 `ExecutionNodeDetail` 共用 `shared/components/json/JsonTreeView`
  - `DecisionAnnotation`: agent 决策注解（AutonomyBadge FIXED/LLM_SUGGEST/LLM_DECIDE、通过 `react-markdown` + `skipHtml` 渲染的 ReasoningBlock、AlternativesList、InterventionTag 修改摘要）
  - `OutputLevelBadge`: L1-L4 输出格式等级徽章
  - `EvidenceChips`: 证据计数芯片（可点击，`openPanel(executionId, nodeId, nodeName)`）
  - `FailedNodeError`: RFC 7807 错误展示，优先消费 `errorDetail`，并兼容字符串 / JSON fallback
  - `useTimelineData`: 聚合 hook，合并 ExecutionStep[] + evidence records；会通过 `useAllEvidenceRecords()` 跨页拉取 evidence、按 step 选择最新 `agent_decision` / `intervention`，并从 `checkpointData` / evidence / `nodeData` fallback 推导 autonomyMode，返回 `TimelineData[]`（含 autonomyMode、outputFormatLevel、evidenceCount）
- **庆祝效果** (`features/execution/components/CelebrationEffect.tsx`): 基于 `canvas-confetti`，使用 workflow-scoped localStorage key `agentloom:workflow:{workflowId}:first-success-celebrated`，挂载在 `WorkflowCanvasPage`，只在当前会话内同一 execution 从非 `completed` 过渡到 `completed` 时触发
- **VersionToolbar**: 包含 Run 按钮 (Play/运行 ↔ Loader2/执行中)，通过 `onRun`/`isRunning` props 控制
- **工作流输入参数**: `features/workflow/` 现定义 canonical `WorkflowInputSchema` / `WorkflowInputFieldDefinition` / `WorkflowInputFieldVisibility` / `ConversationPlan`；`useWorkflowInputSchema(workflowId, { enabled? })` 继续对接发布态 `GET /workflow-definitions/:id/input-schema`。`features/workflow-input-schema/` 现在由三层组成：`InputSchemaRenderer`（共享 canonical 字段渲染层）、`WorkflowInputSchemaTab`（支持 `form|conversation|hybrid`、字段级 `collectionHint`、creator-side canonical conversation preview 与同源 live preview）以及 `ExecutionLaunchDialog`（Web-first staged collection、summary confirm、`inputParams + schemaVersion + launchSource='web-studio'` 提交）。编辑器中的 `ExecutionLaunchDialog` 现在会优先读取当前草稿 `draftInputSchema`，并在文案上明确提示“本次运行将使用当前编辑稿”；对话 / 混合模式的 Studio 合同要点：1) 只能复用现有 `WorkflowCanvasPage + WorkflowSettingsPanel + VersionToolbar` surface；2) `conversationPlan.maxTurns` 必须真实驱动 staged collection，而不只是展示文案；3) `single_select` / `multi_select` 在对话路径中也必须遵守 canonical `field.options`，并在 prompt 中直接展示可选值；4) Enter 键提交需避开 IME 组合态；5) execution 仍只能在最终确认后创建。viewer/operator 在 `WorkflowInputSchemaTab` 中继续只读，Run 入口仍仅对 `workflow.status === 'published'` 暴露。
- **WorkflowStatusBar**: 包含 ExecutionStatusIndicator，显示 6 种执行状态 + 进度 (completedSteps/totalSteps)
- **发布警告展示**: `PublishSheet` 发布成功且返回 `warnings[]` 时，显示成功 toast 并在 Sheet 内渲染内联展开式警告列表（每条警告可点击展开查看源/目标端口类型详情），用户点击"完成"按钮关闭。不再使用 toast-per-warning 模式
- **工作流发布上下文保持**: 若用户在打开 `VersionHistoryPanel` 的状态下进入 `PublishSheet`，无论是从 toolbar 还是历史面板内触发，`PublishSheet` 关闭后都必须恢复历史抽屉；最新发布记录要立刻出现在抽屉中，不能把用户丢回一个已关闭且看不到结果的上下文
- **NodeConfigPanel**: 选中节点的侧边栏现在也消费 executionStore，展示实时状态、stepId、重试次数、错误信息与 output 文本流；其中 `text-output` / `json-output` 会通过共享 `OutputContentRenderer` 渲染 Markdown / LaTeX / Mermaid / 代码块或结构化 JSON，其余节点保持文本兜底。对于 `execution.node.status-changed` 里直接携带 `result/checkpointData` 的节点，executionStore 会立刻恢复输出内容，因此 one-shot 结果节点 completed 后无需刷新页面。配置区按“自定义面板优先 → DynamicConfigForm(schema fallback) → 空态文案”分发，并把字段级校验状态同步到 `canvasStore.nodeValidationErrors`
- **Canvas / Agent Canvas 输入节点**: `text` 是 workflow 与 agent 两套画布共享的文本常量 source node，`text-output` / `json-output` 仍是结果 sink；workflow `agent`、`agent-main` 与 `sub-agent` 统一通过 `system-prompt-in` 接收系统提示词。`sub-agent` 额外固定 `model-in` / `schema-in` override 与 `tools-in` / `skills-in` / `sub-agents-in` / `knowledge-in` / `memory-in` extension，不提供 `sandbox-in`
- **DynamicConfigForm / LlmAgentConfigPanel / HttpToolConfigPanel**: 统一使用 react-hook-form + zodResolver + 300ms debounce `onApply`；`LlmAgentConfigPanel` 使用 lazy Monaco 编辑 `systemPrompt`，并要求在 mount 后仍能响应外部 config 更新。该面板现会通过 auth token 的组织 claim 查询 organization autonomy policy：显示组织自治上限、禁用超 cap 的新选项、阻止保存 stale over-cap 模式，并对 legacy raw mode 给出显式迁移提示，同时保留 hidden draft round-trip 行为。autonomy mode 的前端读取优先级与 server 对齐为 `autonomyMode -> autonomyConfig.mode -> settings.autonomyMode -> config.autonomyMode`，autosave 会同步写回 `autonomyMode`、`autonomyConfig.mode`、`config.autonomyMode`、`settings.autonomyMode` 四个 canonical mirrors。
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

| 任务            | 步骤                                                          |
| --------------- | ------------------------------------------------------------- |
| 新路由          | 创建 `src/app/routes/xxx.tsx` → 添加到 `router.tsx` 路由树    |
| 新 feature      | 在 `features/` 创建目录 → api/ + hooks/ + stores/ + types/    |
| 新 UI 组件      | `shared/ui/` (CVA + Radix) 或 `shared/components/` (组合组件) |
| 新服务端状态    | `xxxKeys` factory + `xxxApi` 函数 + `useXxx` query hook       |
| 新 Zustand 状态 | 按 canvasStore 模式: immer + devtools + subscribeWithSelector |

## 架构偏差与注意事项

- **非标准子目录**: `developer-console` 和 `monitoring` 使用 `pages/` 子目录（而非 `components/`）
- **Barrel 导出例外**: `marketplace/index.ts` 使用 wildcard re-export（其余 feature 使用 named export）
- **无 canonical 布局**: `workflow-input-schema` 无 `api/` 目录且无 `index.ts`
- **跨 feature 共享类型**: `canvas/autonomy.types.ts` 位于 feature 根目录，被 organization-autonomy-policy 和 optimization-suggestion 跨 feature 引用
- **shared/ui 组件**: 仅含 8 个基础组件（button/input/label/select/slider/switch/tabs/toast）；其中 tabs 为自定义 Context-based 实现，非 Radix Tabs
- **Query Key Factory 模式**: 各 feature 的 `[feature]Keys.ts` 遵循 `all → lists → list(filters) → details → detail(id)` 层级模式
- **资源页默认语义**: `WorkspaceManagementPage` 默认请求 `includeAutoArchived=false` 并展示 `sourceKind` 标签；筛选文案使用“隐藏执行归档 / 包含执行归档”，`manual` sourceKind 标签显示为“手动工作区”，避免把可复用输入 workspace 与 execution archive 混淆。Studio 的分享导入资源页（`WorkflowListPage` / `AgentListPage` / `KnowledgeBasesPage` / `MemoryInstancesPage` / `McpServerManagementPage` / `SkillBrowsePage`）顶部统一使用来源分类标签 `自己创建 / 分享导入` 切换列表，默认落在 `自己创建`，条目内部不再重复渲染来源 badge；`share_imported` 条目仍需保留“转为自己创建”动作，并在当前分类下即时刷新。Workspace 资源现包含独立详情页 `/resources/workspaces/$workspaceId`，左侧复用 `WorkspaceFileTree`，右侧按 `text | image | pdf | unsupported` 做多态预览，并对 unsupported 文件提供下载兜底；`SandboxManagementPage` 默认请求 `bindingType=resource` 并展示 binding / timeout 标签，避免把 execution archive 与会话沙箱误当成可复用资源。资源页 sandbox start/stop/delete 不能只做 optimistic + invalidate：mutation 成功后还必须把返回 session 写回缓存，并显式 refetch active sandbox list，避免 `stopped -> creating/ready` 必须手动刷新才可见。running sandbox 若 stats 返回 `diskUsage/diskTotal`，UI 必须显示真实磁盘占用；缺失时不能伪装成 `0 B`。若单卡 stats 返回 `404/409`，前端必须把结果收口为 `null`、停止该卡后续 stats 轮询，并刷新 sandbox list/persistent queries 一次，让已删除或已失活的 session 尽快从资源页收敛掉
- **Agent 画布浮层滚动**: `AgentNodeConfigPanel` 这类覆盖在 ReactFlow 之上的长表单浮层，除了 `flex flex-col + min-h-0 flex-1 overflow-y-auto` 的真实滚动布局外，还必须在滚动内容区显式阻断 `wheel` 继续传播给底层画布；因为 Agent/Workflow 画布默认开启 `panOnScroll/zoomOnScroll`，只靠 CSS `overscroll-contain` 不足以保证所有浏览器都能稳定滚动浮层

## 测试约定

- `*.test.{ts,tsx}` 与源码同级
- `@testing-library/react` + jsdom
- API mock: `vi.mock('@/shared/api/client')`
- Store mock: `vi.hoisted()` + `vi.mock()` zustand stores
- Factory: `makeXxx()` 函数创建测试数据
- `data-testid` 用于元素定位

## 复杂度热点

- `McpImportDialog.tsx` (1239L) — 四步导入流（配置→测试→发现→导入）
- `PrivateDeploymentPage.tsx` (1222L) — 私有部署 SMTP/LLM proxy/证书/license 配置
- `FieldMappingPanel.tsx` (1122L) — L2 树形字段映射 + 智能建议 + 批量拖拽 + undo
- `ResourceGovernancePage.tsx` (1092L) — quota/governance/termination 三合一管理
- `InterventionPolicyTab.tsx` (1051L) — 介入策略 approve/reject/escalate timeout
- `WorkflowCanvas.tsx` (728L) — 5 overlays + connection validation + DAG preview
- `KnowledgeBaseDetailPage.tsx` (700L) — WebSocket + form + pagination + upload
- `LlmModelConfigPanel.tsx` (678L) — 多模型配置面板
- `nodeTypeRegistry.ts` (590L) — 21 种节点类型配置 (纯数据，含 smart-routing/input-preprocessor/memory/agent/skill)
- `canvasStore.ts` (535L) — 画布完整状态管理

## 环境变量

- `VITE_API_BASE_URL` — API 地址
- `VITE_AUTOSAVE_DEBOUNCE_MS` — 自动保存延迟
- `VITE_SUPABASE_URL` — Supabase Auth 基础地址；私有部署走反向代理时可留空，前端会回退到当前站点 origin 并请求 `/auth/*`
- `VITE_SUPABASE_ANON_KEY` — Supabase 匿名公钥
- Vite proxy: `/api` → `:3000`，`/socket.io` → `:3000` (ws)
