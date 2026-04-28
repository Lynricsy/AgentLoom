# AgentLoom Studio

AgentLoom Studio 是基于 **React 19 + Vite 7** 的前端工作台，负责工作流画布编辑、执行调试、审计查询、治理配置、模板与市场浏览等 Web 体验。当前 `/login` 页面仅展示邮箱密码登录，Google / GitHub OAuth 的底层实现仍保留，但入口暂时隐藏；`/developer-console/earnings` 路由仍然存在，但主侧边栏不再展示“开发者”入口。

## 技术栈

- React 19 + TypeScript 5.9
- Vite 7
- TanStack Router v1（手工路由树）
- TanStack Query + Zustand（immer / devtools）
- Tailwind CSS v4 + Radix UI + CVA
- ky（全局 snake_case ↔ camelCase 转换）

## 品牌资产

- 浏览器 favicon / apple-touch-icon 统一来自 `public/brand/logo.png`
- 登录页与主侧边栏通过共享组件 `src/shared/components/brand/BrandMark.tsx` 复用同一套品牌图标展示
- 根目录 `Logo/logo-transparent.png` 是当前跨端品牌源图，Studio 内的 `public/brand/logo.png` 为运行时派生副本

## 当前关键页面

| 路由                                             | 页面                           | 说明                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------------------------ | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/workflows/$workflowId`                         | WorkflowCanvasPage             | React Flow 画布编辑器、自动保存、节点配置；workflow `agent` 可通过显式 `text` 常量节点连接 `system-prompt-in`，`text-output` / `json-output` 卡片支持直接打开详情查看完整输出                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `/executions/$executionId`                       | ExecutionDebugView             | 只读执行调试视图与垂直时间线                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `/settings/audit-logs`                           | AuditLogPage                   | owner/admin 审计日志查询页                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `/settings/security/autonomy-policy`             | OrganizationAutonomyPolicyPage | owner-only 组织自治策略设置页                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `/settings/resource-quotas`                      | ResourceGovernancePage         | owner/admin 资源治理页：quota、tenant/workflow governance、异常 execution 终止                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `/settings/monitoring`                           | MonitoringDashboardPage        | owner/admin 组织级只读运行监控页：执行趋势、当前队列快照摘要、alerts、hotspots、risk summary                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `/resources/knowledge-bases`                     | KnowledgeBasesPage             | 知识库管理（列表页展示文档数 / 知识节点数 / 策略摘要）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `/resources/sandboxes`                           | SandboxManagementPage          | 持久化 sandbox 资源页；默认只显示 `bindingType=resource` 的可复用沙箱，start/stop/delete 会先 optimistic 更新，再显式刷新 active list，避免状态必须手动刷新才收口                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `/resources/workspaces`                          | WorkspaceManagementPage        | 持久化 workspace 列表页；默认隐藏 execution 自动归档快照，并显示来源标签                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `/resources/workspaces/$workspaceId`             | WorkspaceDetailPage            | 持久化 workspace 详情页；目录树 + Monaco 文本预览/编辑 + 图片 / PDF 预览，其他文件提供下载兜底                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `/agents/$agentId`                               | AgentCanvasPage                | Agent 画布编辑器；顶部工具栏提供状态、保存画布、保存版本、历史记录、发布，以及仅在已发布时才显示的分享入口                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `/agents/$agentId/conversations/new`             | NewConversationDraftPage       | 新对话草稿页；首条消息发送成功后才创建真实 conversation 并跳转正式会话；只有 sandbox Agent 会显示右侧持久化工作区预览，no_sandbox 草稿态直接使用全宽消息区                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `/agents/$agentId/conversations/$conversationId` | AgentConversationPage          | 三列对话页；sandbox Agent 会在 live workspace 就绪前先显示持久化工作区目录预览，右侧电脑面板通过会话级 `sandbox/stats` + `sandbox/processes` 展示真实进程快照，并保留文件变更/工具运行上下文；no_sandbox 对话不再预留右侧电脑/工作区占位列，页面仅保留消息流与输入区；执行开始时工具 tab 默认选中，但用户手动切到其他 tab 后不会再被后续工具事件抢回；同一 conversation 的 history/workspace 刷新为 single-flight，点击“刷新当前对话”时会暂停后台轮询并以无默认超时的请求刷新当前 conversation 的 runtime，而不是新建会话；子代理 drill-in 视图优先显示 live 瀑布，历史消息若带 `metadata.subAgentStreams` 则按与主 agent 相同的瀑布流恢复，只有旧历史缺少 durable stream 时才回退摘要；支持图片/文件草稿队列、多附件同发与附件预览 |
| `/settings/tool-library`                         | ToolLibraryPage                | MCP 工具库                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `/marketplace`                                   | MarketplaceBrowsePage          | 工作流 / 插件市场                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `/generated-apps`                                | GeneratedAppListPage           | 一句话生成应用工作台：创建 Generated App 后启动自动生成与验证、查看 readiness、管理符合门禁的公开分享链接                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `/generated-apps/$appId`                         | GeneratedAppDetailPage         | Generated App 创建者详情页：AppSpec、验收场景、Gate 结果、Traceability、Artifacts、Resource bindings、自动生成与验证运行、公开链接管理、公开提交记录管理与生成证据/运行记录查看                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `/generated-apps/public/$token`                  | GeneratedAppPublicRuntimePage  | Generated App 公开 runtime 入口：无需登录，只展示 title、description、dataUseNotice、有限 AppSpec、动态业务表单、runtime preview link 和结构化 submission 报告/结果，不渲染 Studio 壳层                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |

`WorkflowListPage`、`AgentListPage`、`KnowledgeBasesPage`、`MemoryInstancesPage`、`McpServerManagementPage` 与 `SkillBrowsePage` 当前统一采用顶部来源分类标签 `自己创建 / 分享导入` 切换列表，默认展示 `自己创建`，条目内部不再重复显示来源 badge；`share_imported` 项仍保留“转为自己创建”动作。

`AgentCanvasPage` 当前将版本管理主路径收敛到顶部工具栏：保存版本使用独立对话框，历史记录使用独立右侧面板，发布使用独立弹层；分享按钮只在 Agent 已发布时出现，避免把用户引到未发布必然失败的分享路径。

## Agent 对话工作区预览事实

- `AgentConversationPage` 在 sandbox Agent 对话冷开时，会先尝试加载持久化工作区目录预览，再等待 live sandbox 的 authoritative tree 接管。
- 若 Agent detail 同时包含顶层 `workspaceSnapshotId` 与 `sandboxConfig.restoreWorkspaceId`，前端必须优先使用 `restoreWorkspaceId` 作为 preview preload 来源；因为 live sandbox 真正恢复的就是该工作区。
- 只有不存在 `restoreWorkspaceId` 时，才回退到顶层 `workspaceSnapshotId`。
- 执行中 `loadHistory()` 与 `loadWorkspaceTree()` 对同一 conversation 会共享单个 in-flight 请求，避免 3s 定时器把慢请求叠成并发风暴。
- 点击消息里的“刷新当前对话”时，页面会暂停 history/workspace/sandbox 后台轮询，等当前 conversation 的 runtime refresh 完成或失败后再恢复轮询；后续继续对话也会自动使用当前已发布配置。

## Agent 子代理视图事实

- `AgentConversationPage` 的子代理 drill-in 视图优先消费 live `subAgentStreams`，因此实时执行中的 child 可以继续按消息瀑布与工具调用展开。
- 当页面只有历史消息时，前端会优先读取 `assistant.metadata.subAgentStreams` 恢复 child waterfall；只有旧历史缺少 durable stream 时，才会从 `wait_for_subagents` / `get_subagent_status` 结果和 `subagent_completion_notice` 合成摘要视图。
- 若 live 与历史都没有该 handle 的可展示数据，点击“进入子代理视图”不会再制造只改变 breadcrumb 的假切换。
- workflow Agent viewer 也会把 `step.checkpointData.subAgentStreams` 与 live `nodeState.subAgentStreams` 合并后展示；刷新执行页后，已完成 child 仍能按文本/思考/工具瀑布恢复，而不是退化成摘要。

## Discover 安装事实

- `MarketplaceInstallDialog` 在 discover / marketplace 安装 workflow 时，名称输入框默认直接使用 listing 标题，不再自动追加“副本”。
- discover 安装成功后的 workflow 会只引用当前租户新建的 workspace / sandbox 资源；前端不再继续回显来源模板里的 workspace 或 persistent sandbox 标识。

## Agent 对话附件事实

- `AgentConversationPage` 输入栏支持图片与文件上传；选中的附件会先显示在输入栏上方草稿区，点击发送后才会真正发出。
- 同一条用户消息可同时携带文本、多个图片和多个文件；前端以 `metadata.attachments[]` 作为 canonical 结构，并兼容历史上的单附件 `metadata.attachment`。
- 单附件上限 `1.5 MB`，单消息附件总量上限 `10 MB`，文本文件内联上限 `200 KB`。
- 文本文件优先以内联文本资源进入 Agent 上下文，图片与二进制文件以附件形式发送。
- `MessageList` 会为同一条用户消息渲染全部附件的图片预览、文件卡片与文本文件内容预览；sandbox runtime 若给出工作区路径，消息卡片也会展示该路径。

## Agent 新对话草稿事实

- `/agents/$agentId/conversations/new` 当前渲染 `NewConversationDraftPage`，挂载时不会调用创建 conversation 的 API。
- 草稿页复用 `ConversationComposer`，首条消息发送时调用 `POST /agent-definitions/:agentId/conversations/start`，成功后才导航到 `/agents/$agentId/conversations/$conversationId`。
- 用户直接离开草稿页时，历史列表不会新增空会话；`ConversationSidebar` 在草稿态允许没有当前会话 id。

## Feature-Slice 结构

```text
src/
├── app/
│   └── routes/
├── features/
│   ├── canvas/
│   ├── execution/
│   ├── audit-log/
│   ├── organization-autonomy-policy/
│   ├── resource-governance/
│   ├── monitoring/
│   ├── knowledge/
│   ├── marketplace/
│   ├── notification/
│   └── ...
├── shared/
│   ├── api/
│   ├── ui/
│   ├── components/
│   └── utils/
└── test-setup.ts
```

## 画布快照恢复事实

`features/canvas/` 当前在 `canvasStore.applyServerSnapshot()` 落地服务端工作流快照前，会先修复不完整的端口定义：

- 已知端口按节点注册表回填 `direction / dataType / schema / maxConnections` 等 canonical 字段
- 未知端口则按已有 `dataType / schema` 推导默认 schema
- 目标是兼容历史快照、API 直改或导入数据里残留的半残 `PortDefinition`，避免页面在 UI / type-engine 读取 `port.schema.kind` 时直接崩溃
- `CanvasNodeShell`、`NodeInfoCard` 与 `NodeConfigPanel` 对未知 `nodeType` 也会走通用降级展示：保留原始端口/配置数据并显示“未知节点类型”，而不是因单个坏节点让整个画布进入 error boundary
- `agentCanvasStore` 对 Agent 自进化/历史快照也要做同级别 hydration：若持久化节点缺少 `inputPorts/outputPorts`，前端必须回退为 `[]` 再按注册表补齐；`text` 节点若仍是 legacy root-level `text/value/content`，要先回填到 `config.text`，避免单个坏节点让 Agent 画布白屏

`features/workflow/api/versionQueries.ts` 现在也会在消费版本列表 / 已发布版本接口时，对 `version.snapshot.nodes[*].data.inputPorts/outputPorts` 执行同类 hydration。这样即使服务端返回的是历史半残版本快照，版本历史侧边栏和任何后续消费 `snapshot` 的前端路径也不会再绕过主画布 store 直接命中 `schema.kind` 崩溃。

## 画布输入节点事实

`features/canvas/` 与 `features/agent-canvas/` 当前共享同一套“显式提示词节点”心智模型：

- `text` 节点是文本常量 source node，配置面板使用 `TextConfigPanel`，节点 body 使用 `TextNodeBody` 做摘要预览
- `text-output` / `json-output` 仍然只是执行结果收口节点，不承担系统提示词配置
- workflow `agent`、Agent `agent-main` 与 Agent `sub-agent` 的系统提示词输入统一是 `system-prompt-in`
- `sub-agent` 端口语义分为 override 与 extension 两类：`system-prompt-in` / `model-in` / `schema-in` 属于覆盖，`tools-in` / `skills-in` / `sub-agents-in` / `knowledge-in` / `memory-in` 属于扩展
- `sub-agent` 不提供 `sandbox-in`；沙箱始终继承主 Agent 的运行时

## 输出节点查看事实

`features/canvas/` 当前对 `text-output` / `json-output` 节点采用“卡片轻量预览 + 详情富渲染”的双层语义：

- 节点 body 本身是可点击的预览卡；在手机端点击后会打开全屏详情弹层，在桌面端打开大尺寸对话框
- `text-output` 详情复用共享 `MarkdownRenderer`，支持 Markdown、LaTeX、Mermaid 与代码块
- `json-output` 详情优先使用结构化 JSON 树视图；如果输出尚未形成合法 JSON（例如流式中间态），则回退为原文代码视图
- 右侧 `NodeConfigPanel` 的“输出流”区域与详情弹层共用 `OutputContentRenderer`，避免桌面 / 手机两套输出语义漂移
- `execution.node.status-changed` 若带 `result/checkpointData`，Studio 会直接合并到 executionStore，因此 `text-output` / `json-output` 这类 one-shot 节点在 completed 后无需刷新页面即可显示最终结果

## 工作流预览渲染事实

`features/canvas/WorkflowPreviewCanvas.tsx` 当前是 template / marketplace / public share 等非编辑场景的共享工作流预览层：

- 复用 `CanvasNodeShell` 与 `SmartEdge`，因此预览外观与正式工作流画布保持一致，而不是退化成 React Flow 默认黑色方块
- `lib/workflowPreview.ts` 会基于快照里的 `data.nodeType` 推导真实节点 category，并对 `inputPorts/outputPorts` 执行与正式画布一致的 hydration
- 预览 edge 会统一映射为只读 `smart` edge，并通过 `.workflow-preview-canvas` 关闭节点/连线命中，避免在预览页误触编辑交互
- 预览默认保留平移与缩放交互：拖动画布可浏览局部，滚轮 / 触控可缩放，但节点与连线仍保持只读
- 当快照中的 `nodeType` 完全无法识别时，预览才会回退到 React Flow 默认节点，作为坏数据兜底而不是常态路径

## 画布控制流容器事实

`features/canvas/` 当前对 `loop / iteration` compound 容器采用以下前端契约：

- 默认展开态容器尺寸由 `lib/compoundLayout.ts` 统一计算，当前默认起点约为 `600 x 540`
- 可见“循环体 / 迭代体”内框不是纯装饰，而是内部子节点的真实拖拽边界
- 子节点 `extent` 表示真实内框盒子本身，最终拖拽 clamp 才会按节点 `measured.width/height`（回退到内置默认尺寸）扣除尺寸；不要在 extent 上提前减一次，否则 React Flow 拖拽时会重复扣减，导致内部节点只能在很窄的范围移动
- compound resize 后的边界同步必须优先读取 live `measured/width/height`，不能优先读取 `style.width/height`；因为 React Flow 的 `dimensions` 变化不会自动把新尺寸写回 `style`
- compound 子节点保持 `expandParent = false`，父容器本身就是固定边界，不通过拖拽自动撑大
- `loop-start / iteration-start` 的固定上下文输出（如 `round/state`、`item/index`）由运行时自动生成；额外透传端口与标签的真实事实源仍在父 `loop / iteration` 容器输入上，但 start 节点配置面板也允许直接编辑这些透传端口，并会同步回父容器与 start 节点输出，避免用户误以为缺少端口编辑能力

## LLM 模型管理前端事实

`features/llm/` 当前已经提供：

- `Provider → Model` 二级结构：Provider 与模型分离管理，Provider 负责 `baseUrl / apiKey / protocol / enablement`，模型负责能力、上下文窗口、定价与默认值
- `LlmModelManagementPage`：左侧 Provider 列表，右侧配置面板；Provider 凭据直接填写明文 API Key，由服务端加密托管；支持连接测试、远端模型发现、LiteLLM fallback 检索、手动补录模型
- 模型列表与 LiteLLM 检索结果会同时展示基础输入/输出价、缓存读/写价与 token 阶梯价 badge
- `GlobalModelSelector` 已改为自定义 listbox，按 Provider 分组，组头与已选摘要均显示 Provider 图标，只展示启用中的 Provider/模型
- 兼容层 `adaptModelEntityToInfo()` 会保留 `providerEntity`，避免编辑已有模型时丢失 Provider 级 `baseUrl/apiKeyId` 与缓存/阶梯定价元信息
- `PrivateCloudConfigSection` 现在直接调用真实私有云测试/拉模型接口，既能复用已托管的 Provider key，也能在当前表单里临时输入 API Key 做联调

## 资源治理前端事实

`features/resource-governance/` 当前已经提供：

- 后端契约镜像类型：quota、tenant/workflow governance state、治理动作响应、异常 execution termination response
- 4 个 API 封装：
  - `GET /organizations/:id/resource-governance`
  - `PUT /organizations/:id/resource-governance/quota`
  - `PUT /organizations/:id/resource-governance/controls`
  - `POST /organizations/:id/resource-governance/executions/:executionId/terminate`
- TanStack Query hooks：读取状态 + quota mutation + controls mutation + termination mutation
- token-based permissions helper：允许 `owner/admin`，并从 `organizationId/orgId/tenantId` claims 解析组织 / 租户信息
- `ResourceGovernancePage`：metadata、7 个 quota 字段表单、tenant/workflow governance controls、异常 execution termination 表单与 action summary
- 前端文案显式区分“治理暂停只阻止新执行进入”与 execution `paused`

## 监控仪表板前端事实

`features/monitoring/` 当前已经提供：

- 后端契约镜像类型：`summary`、`trend`、`alerts`、`hotspots`、`riskSummary`，并显式建模 `scope/window/lastUpdatedAt/metricSources`
- 只读 API 封装：`GET /organizations/:id/monitoring?window=15m|1h|24h`
- TanStack Query hooks：`monitoringKeys.dashboard(organizationId, window)` 与 `useMonitoringDashboard()`，窗口值会进入 query key
- `MonitoringDashboardPage`：owner/admin 门禁、`15m|1h|24h` 窗口切换、summary cards、`recharts` 执行趋势图、alert/risk summary、metric source 说明、热点列表
- 监控页保持只读，只提供 `/settings/resource-quotas` 与 `/executions/:id` drill-down，不在 dashboard 内复刻治理 mutation
- 文案显式区分“治理暂停”与 execution `paused（人工介入）`
- 队列深度只来自当前 `agent-task` queue snapshot，会出现在摘要/告警/热点中，但不会被展示成跨窗口历史队列曲线

## 开发命令

```bash
pnpm install
pnpm dev
pnpm test
pnpm typecheck
pnpm build
```

## 资源治理相关验证

```bash
pnpm exec vitest run src/features/resource-governance/components/ResourceGovernancePage.test.tsx src/app/routes/settings/resource-quotas.test.tsx
pnpm exec vitest run src/features/monitoring/api/monitoringKeys.test.ts src/features/monitoring/pages/MonitoringDashboardPage.test.tsx src/app/routes/settings/monitoring.test.tsx
pnpm typecheck
pnpm build
```

## 测试约定

- `*.test.{ts,tsx}` 与源码同级
- `@testing-library/react` + jsdom
- `vi.hoisted()` + `vi.mock()` 管理 API / token / toast / hooks mock
- 使用 `data-testid` 稳定定位 settings 页面关键区域

## 环境变量

- `VITE_API_BASE_URL`
- `VITE_AUTOSAVE_DEBOUNCE_MS`

Vite dev proxy 默认转发：

- `/api` → `:3000`
- `/socket.io` → `:3000`

## 相关文档

- `AGENTS.md`：持久化前端知识库
- `src/features/resource-governance/`：资源治理前端实现
- `src/app/routes/settings/resource-quotas.tsx`
- `src/features/monitoring/`：组织级只读运行监控前端实现
- `src/app/routes/settings/monitoring.tsx`
