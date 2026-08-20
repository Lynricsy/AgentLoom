# AGENTLOOM STUDIO 知识库

React 19 + Vite 7 前端工作台。架构主线为 `routes → feature 公共 barrel → feature 内部 → shared`，数据访问使用 TanStack Query，编辑与实时状态使用 Zustand。

## 入口与目录

```text
src/
├── app/                 # providers、router 与 routes
├── features/            # 按业务域组织的 feature slices
│   ├── canvas/          # 工作流画布；细则见 src/features/canvas/AGENTS.md
│   ├── agent-canvas/    # Agent 配置画布
│   ├── execution/       # 执行查询、实时 store 与监控 UI
│   ├── smart-routing/   # 智能路由 API、query keys、hooks 与类型
│   └── ...
├── shared/
│   ├── api/             # ky client、QueryClient
│   ├── components/      # 跨 feature 组合组件
│   ├── ui/              # Radix/CVA 基础原语
│   ├── types/           # API envelope 等跨域类型
│   └── utils/           # case conversion 等纯工具
└── test-setup.ts
```

路由在 `src/app/routes/`，由 TanStack Router 手工注册。路由组件只负责 search params、权限与 feature 页面装配，不承载 feature 内部实现。

## 依赖边界

`eslint.config.js` 根据 `src/features/` 的一级目录动态生成 `no-restricted-imports`：

- feature 内禁止导入其他 feature 的 `components`、`stores`、`api`、`lib`、`hooks`、`types` 深路径，包括目录本身、一级成员与递归成员。
- 跨 feature 依赖必须从目标 feature 的 `index.ts` 公共 barrel 导入。
- `src/app/routes/**/*.{ts,tsx}` 禁止 `@/features/*/**` 深路径，只允许 feature 根 barrel。
- feature barrel 使用具名导出，公开面保持最小；内部文件不因方便而加入 barrel。
- 纯 wire 类型优先放在 `@agentloom/contracts` 或使用 `@agentloom/api-client` 生成模型；真正跨业务域且不属于 wire 的类型才进入 `src/shared/`。

新增 feature 时必须提供 `index.ts`，并让路由与其他 feature 只消费该公开面。

## 状态事实源

- TanStack Query 是服务端实体缓存的唯一事实源。列表、详情、通知计数、Agent 与 Workflow 实体不复制到 Zustand。
- Zustand 只保存画布编辑草稿、socket 瞬态、选择态和纯 UI 状态。
- Agent / Workflow 列表的 filters 与分页属于 URL 状态，由 TanStack Router search params 管理；解析与默认值采用 feature 内的 search schema，例如 `src/features/agent/lib/agentListSearch.ts`。
- `executionStore` 是执行实时状态的唯一事实源。REST execution detail 只在首屏通过 `src/features/execution/hooks/useLiveExecutionDetail.ts` 调用 `initFromSnapshot()` 注入初始快照；后续 socket 事件直接推进 store。
- `initFromSnapshot()` 不覆盖已经收到的实时事件。mutation 通过 invalidate 促使查询重取，不向 execution detail Query cache 写入实时状态。
- Query key 遵循 `all → lists → list(filters) → details → detail(id)` 层级；影响结果的分页、筛选和窗口参数必须进入 key。

## 契约与 API 类型

- `@agentloom/contracts` 是 workflow graph、execution events、Agent runtime config 与 `PortDataType` 等跨端 wire 契约的来源。
- `@agentloom/api-client` 提供 server OpenAPI 生成的 interface；没有 fetch runtime。Studio 保留 `src/shared/api/client.ts` 的 ky transport。
- `@agentloom/api-client` 的生成模型不手改；字段变化先修改 server DTO/OpenAPI，再从仓库根运行 `pnpm contracts:regen`。
- `src/shared/types/api.ts` 只保留 OpenAPI models 未表达的 envelope 类型。
- `agent-definition` / `workflow-definition` / `execution` / `agent-conversation` 的 list/detail 响应类型一律取自 `@agentloom/api-client`；`AgentListResponse` / `WorkflowListResponse` / `ExecutionResponse` / `ConversationListItem` 等导出名保留为生成类型别名，不得平行手写。
- 唯一例外是画布编辑态：`WorkflowDefinition` 用 `Omit` 摘掉 `nodes` / `edges` / `viewport` 换成 `CanvasNode` / `CanvasEdge` / `WorkflowGraphViewport`——OpenAPI 3.0 无法无损表达 React Flow 的动态 data/style 字典与 extent 元组，生成模型在这些位置退化为 `{}`/`any`。其余字段（含 `inputSchema`）直接使用生成类型；本地 `WorkflowInputSchema` 只服务编辑器与请求侧。若发现生成类型过宽，修 server schema 后 regen，不在 Studio 强转。
- REST 统一经过 ky hook 做 snake_case/camelCase 转换；Socket wire 按 server 的 camelCase 事件模型消费。
- `src/features/execution/types/contract-fixtures.test.ts` 消费 contracts fixtures，约束执行事件与快照形状。

## Smart Routing 命名

Provider health 的公共 API 归属 `src/features/smart-routing/`：

- 类型：`ProviderHealthState`、`ProviderHealthRecord`
- fetcher：`fetchProviderHealth`
- hook：`useProviderHealth`
- query key：`routingKeys.health`

`src/features/routing-decision/` 和 canvas 只能从 smart-routing barrel 消费这些符号，不建立第二套 health 类型、fetcher 或 key。

## 组件与代码组织

- `components/` 放渲染与组件组合；复杂交互和派生状态进入 `hooks/`；无 React 生命周期的纯计算、payload builder 与 normalizer 进入 `lib/`。
- 画布连接交互分别位于 `src/features/canvas/hooks/useConnectionInteraction.ts`、`useConnectionValidation.ts`、`useCanvasKeyboardShortcuts.ts`；surface 与 overlay 由 `CanvasSurface.tsx`、`CanvasOverlayLayer.tsx` 组合。
- 字段映射派生状态和交互位于 `useFieldMappingDerivedState.ts`、`useFieldMappingInteractions.ts`，展示拆在 `FieldMappingSummary.tsx`、`FieldMappingTreePane.tsx`、`FieldMappingList.tsx` 等组件。
- Knowledge 页面由 `KnowledgeBaseSettingsForm.tsx`、`KnowledgeDocumentsPanel.tsx`、`KnowledgeSearchTester.tsx` 组合。
- 私有部署页面的卡片在 `src/features/private-deployment/components/`，payload 纯函数在 `src/features/private-deployment/lib/privateDeploymentPayloads.ts`。
- Agent 对话布局与输入分别由 `ConversationLayout.tsx`、`ConversationComposer.tsx` 承担，工作区同步位于 `src/features/agent-conversation/hooks/useConversationWorkspaceSync.ts`。

## TypeScript 与表单约定

- `src/` 生产代码不得使用显式 `any`；使用生成类型、具体库泛型、`unknown` + 类型守卫或最小接口表达边界。
- 测试中的 Vitest matcher `expect.any(...)` 不属于 TypeScript `any` 类型。
- react-hook-form + Zod 负责表单状态与校验。
- `shared/ui/select` 是 Radix Select；`SelectItem` 不接受空字符串 value，默认/空值使用 placeholder 或哨兵映射。
- 画布 ReactFlow 的业务节点类型读取 `node.data.nodeType`，`node.type` 只表示渲染类别。

## 测试与命令

```bash
pnpm install
pnpm dev
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

测试与源码同级，使用 Vitest、Testing Library 与 jsdom。API/store mock 使用 `vi.hoisted()` 配合 `vi.mock()`，关键交互可使用稳定的 `data-testid`。

## 环境变量

- `VITE_API_BASE_URL`
- `VITE_AUTOSAVE_DEBOUNCE_MS`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Vite dev proxy 将 `/api` 与 `/socket.io` 转发到 server。
