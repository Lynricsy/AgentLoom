# AgentLoom Studio

AgentLoom Studio 是基于 **React 19 + Vite 7** 的前端工作台，负责工作流画布编辑、执行调试、审计查询、治理配置、模板与市场浏览等 Web 体验。

## 技术栈

- React 19 + TypeScript 5.9
- Vite 7
- TanStack Router v1（手工路由树）
- TanStack Query + Zustand（immer / devtools）
- Tailwind CSS v4 + Radix UI + CVA
- ky（全局 snake_case ↔ camelCase 转换）

## 当前关键页面

| 路由                                 | 页面                           | 说明                                                                                         |
| ------------------------------------ | ------------------------------ | -------------------------------------------------------------------------------------------- |
| `/workflows/$workflowId`             | WorkflowCanvasPage             | React Flow 画布编辑器、自动保存、节点配置                                                    |
| `/executions/$executionId`           | ExecutionDebugView             | 只读执行调试视图与垂直时间线                                                                 |
| `/settings/audit-logs`               | AuditLogPage                   | owner/admin 审计日志查询页                                                                   |
| `/settings/security/autonomy-policy` | OrganizationAutonomyPolicyPage | owner-only 组织自治策略设置页                                                                |
| `/settings/resource-quotas`          | ResourceGovernancePage         | owner/admin 资源治理页：quota、tenant/workflow governance、异常 execution 终止               |
| `/settings/monitoring`               | MonitoringDashboardPage        | owner/admin 组织级只读运行监控页：执行趋势、当前队列快照摘要、alerts、hotspots、risk summary |
| `/resources/knowledge-bases`         | KnowledgeBasesPage             | 知识库管理（列表页展示文档数 / 知识节点数 / 策略摘要）                                       |
| `/settings/tool-library`             | ToolLibraryPage                | MCP 工具库                                                                                   |
| `/marketplace`                       | MarketplaceBrowsePage          | 工作流 / 插件市场                                                                            |

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

## 画布控制流容器事实

`features/canvas/` 当前对 `loop / iteration` compound 容器采用以下前端契约：

- 默认展开态容器尺寸由 `lib/compoundLayout.ts` 统一计算，当前默认起点约为 `600 x 540`
- 可见“循环体 / 迭代体”内框不是纯装饰，而是内部子节点的真实拖拽边界
- 子节点 `extent` 表示真实内框盒子本身，最终拖拽 clamp 才会按节点 `measured.width/height`（回退到内置默认尺寸）扣除尺寸；不要在 extent 上提前减一次，否则 React Flow 拖拽时会重复扣减，导致内部节点只能在很窄的范围移动
- compound 子节点保持 `expandParent = false`，父容器本身就是固定边界，不通过拖拽自动撑大

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
