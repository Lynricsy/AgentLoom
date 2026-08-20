# AgentLoom Studio

AgentLoom 的 React 19 + Vite 7 Web 工作台，覆盖工作流与 Agent 画布、执行监控、Agent 对话、资源管理、治理配置、模板、市场和 Generated App 体验。

## 技术栈

- TypeScript 5.9、React 19、Vite 7
- TanStack Router、TanStack Query
- Zustand（immer / devtools）
- Tailwind CSS v4、Radix UI、CVA
- ky；REST 请求和响应统一进行 snake_case/camelCase 转换
- Vitest、Testing Library、jsdom

## 架构

```text
src/
├── app/                 # providers、router、routes
├── features/            # 独立业务域及其公共 barrel
├── shared/              # API transport、UI 原语、跨域组件与工具
└── test-setup.ts
```

依赖方向为 `routes → feature barrel → feature 内部 → shared`。ESLint 禁止 route 或 feature 通过 `components|stores|api|lib|hooks|types` 深路径跨 feature 导入；跨域使用目标 feature 的 `index.ts`。

## 数据与契约

- TanStack Query 是服务端实体缓存的唯一事实源。
- Zustand 保存画布草稿、socket 瞬态、选择态与纯 UI 状态。
- Agent / Workflow 列表 filters 与分页存入 TanStack Router search params。
- execution live store 是执行实时状态的唯一事实源；Query detail 只通过 `initFromSnapshot()` 注入初始快照。
- `@agentloom/contracts` 提供跨端 wire schema 与类型。
- `@agentloom/api-client` 提供 server OpenAPI 生成 interface，不包含 fetch runtime；生成产物不手改。
- Provider health 的公共符号为 `ProviderHealthState`、`ProviderHealthRecord`、`fetchProviderHealth`、`useProviderHealth` 和 `routingKeys.health`，统一从 smart-routing barrel 导入。
- `src/` 生产代码不使用显式 `any`。

## 开发

仓库使用根 pnpm workspace：

```bash
pnpm install
pnpm --filter agentloom-studio dev
pnpm --filter agentloom-studio typecheck
pnpm --filter agentloom-studio lint
pnpm --filter agentloom-studio test
pnpm --filter agentloom-studio build
```

OpenAPI models 再生成入口：

```bash
pnpm contracts:regen
```

该命令需要 server 的 OpenAPI 导出依赖可用，包括 Redis。

## 环境变量

- `VITE_API_BASE_URL`
- `VITE_AUTOSAVE_DEBOUNCE_MS`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

开发代理将 `/api` 和 `/socket.io` 转发到 server。浏览器品牌资源位于 `public/brand/logo.png`。

详细前端约定见 `AGENTS.md`；工作流画布约定见 `src/features/canvas/AGENTS.md`。
