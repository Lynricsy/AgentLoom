# AGENTLOOM STUDIO 知识库

React 19 + Vite 7 前端。Feature-Slice 架构，TanStack Router/Query，Zustand 状态管理。

## 入口

`index.html` → `main.tsx` → `AppProviders` (QueryClient → Toast → Router) → 路由树

## 路由

| 路由 | 页面 | 备注 |
|------|------|------|
| `/` | — | 重定向到 `/workflows/draft` |
| `/workflows/$workflowId` | WorkflowCanvasPage | ReactFlowProvider 包裹 |
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
- **执行 API 层** (`features/execution/api/`):
  - `executionKeys`: TanStack Query key factory (all/lists/details)
  - `executionApi`: `runWorkflow` (POST /workflow-definitions/:id/run), `getExecution`, `cancelExecution`, `resolveIntervention` (POST /executions/:id/steps/:stepId/intervene)
  - `executionMutations`: `useRunWorkflow`, `useCancelExecution` (TanStack mutations + cache)
- **认证占位** (`features/execution/hooks/useAuthToken.ts`): `useSyncExternalStore` + localStorage('auth_token')。TODO(auth): 待替换为真实 Supabase 认证
- **执行触发** (`features/execution/hooks/useStartExecution.ts`): POST /run → executionStore.initExecution(id) 桥接
- **Barrel 导出** (`features/execution/index.ts`): 统一导出所有 execution feature 的公共 API
- **VersionToolbar**: 包含 Run 按钮 (Play/运行 ↔ Loader2/执行中)，通过 `onRun`/`isRunning` props 控制
- **WorkflowStatusBar**: 包含 ExecutionStatusIndicator，显示 6 种执行状态 + 进度 (completedSteps/totalSteps)
- **NodeConfigPanel**: 选中节点的侧边栏现在也消费 executionStore，展示实时状态、stepId、重试次数、错误信息与 output 文本流
- **InterventionPanel** (`features/canvas/components/panels/InterventionPanel.tsx`): 人工介入操作面板，approve/modify/reject 三种操作。嵌入 NodeConfigPanel 的 NodeExecutionSection，仅在 `waiting_intervention` 状态显示。展示 AI 决策建议(confidence/rationale)和部分内容预览

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
