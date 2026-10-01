# Repository Guidelines

## 概述

React 19 + Vite Web 工作台；主线 `src/app/routes → feature barrel → feature 内部 → shared`。跨包规则见根 `AGENTS.md`。
架构、feature/路由清单：`agentloom-docs/dev/studio/index.md`；画布：`dev/studio/canvas.md`（另读 `src/features/canvas/AGENTS.md`）；状态与 REST/Socket：`dev/studio/state.md`。

## 本包硬规则

- 用 `@/` 导入 `src/` 内模块。
- 每个 feature 只经根 `index.ts` 具名导出最小公共面；跨 feature 只能从 `@/features/<name>` 导入，禁止读 `components|stores|api|lib|hooks|types` 深路径（`eslint.config.js` 强制，`src/app/routes` 同样禁止）。
- feature 内按 `api/ components/ hooks/ lib/ stores/ types/` 拆分：渲染放组件，生命周期与交互放 hooks，无 React 的转换与 payload builder 放 lib。
- 路由组件只负责 search 参数、认证边界和页面装配；新增路由同时更新 `src/app/routes/__root.tsx` 的手工路由树。
- 根布局负责公开路由、登录跳转、onboarding、壳层和通知 socket，feature 页面不复制这些职责。
- TanStack Query 是服务端实体唯一来源，Zustand 只放本地/瞬态状态，不把服务端列表或详情复制进 store。
- URL 可表达的筛选、分页、标签放 Router search 参数；影响结果的参数必须进入 Query key。Query key 用层级工厂（`all → lists → list(filters) → details → detail(id)`），mutation 成功后失效对应层级。
- REST 快照只 hydrate 一次，之后由 socket 事件驱动，不被 refetch 覆盖。
- 所有 REST 请求复用 `src/shared/api/client.ts` 的 `apiClient`，不新建 ky 实例；资源路径相对且不以 `/` 开头。
- client 只把 JSON 响应转为 camelCase，不转换请求体：请求体字段大小写按目标 server DTO 决定（需要 snake_case 时显式 `toSnakeBody(...)`）。上传用 `body: FormData`，不手设 `Content-Type`。
- wire 类型来自 `@agentloom/api-client` 与 `@agentloom/contracts`，不手改生成模型；OpenAPI 未表达的 envelope 才放本包共享类型。
- 表单用 React Hook Form + Zod（`zodResolver`），受控 Radix 组件用 `Controller`；Radix Select item 不使用空字符串 `value`。
- 优先复用 `shared/ui` 与现有 feature 组件，不另建第二套基础控件或平行领域类型。
- 第三方样式与字体只经 `src/index.css` 收口，不在 `src/main.tsx` 重复引入。
- 新增浏览器运行时变量需同步 `.env.example`、`agentloom-deploy/docker/studio.Dockerfile` 的占位符替换、Compose 与 `agentloom-deploy/.env.template`。

## 测试硬规则

- 测试与源码同级；组件用 Testing Library + `user-event`，hooks 用 `renderHook`，断言面向用户行为。
- Query hooks 测试各自创建 `QueryClient`；需要提升的 mock 用 `vi.hoisted()` + `vi.mock()`；覆盖全局 mock 分支后在测试内恢复。

## 命令

见本包 `README.md`。

## 改动时更新

新 feature / 路由 → 仓库根 `pnpm docs:gen`，用户可见功能补 `agentloom-docs/guide/` 页面；节点类型 → 见 `agentloom-docs/dev/howto/add-node-type.md`。
