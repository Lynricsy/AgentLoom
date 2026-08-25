# Repository Guidelines

## Project Overview

- `agentloom-studio` 是 AgentLoom 的 React 19 前端工作台，使用 Vite 7、TypeScript、Tailwind CSS 4 与 Radix UI。
- 代码主线是 `src/app/routes → feature 公共 barrel → feature 内部 → shared`；跨包契约遵循仓库根 `AGENTS.md`。
- `src/main.tsx` 只引入统一样式、处理 Vite 旧 chunk 预加载失败，并在 `StrictMode` 下挂载 `AppProviders`。
- 不要在 `src/main.tsx` 重复引入第三方样式；字体和 vendor CSS 由 `src/index.css` 统一收口。

## Architecture & Data Flow

- `src/app/router.tsx` 创建 TanStack Router，启用 `defaultPreload: 'intent'`；路由树在 `src/app/routes/__root.tsx` 手工导入并通过 `rootRoute.addChildren(...)` 注册。
- 路由组件负责 search 参数、认证边界和 feature 页面装配，不承载业务实现；新增路由时同时更新根路由树。
- 根布局处理公开路由、登录跳转、onboarding、桌面/移动壳层和通知 socket；不要在 feature 页面复制这些职责。
- `AppProviders` 的嵌套顺序为 `MotionConfig → ThemeProvider → QueryClientProvider → ToastProvider → RouterProvider`，并在启动时初始化认证 store、注册工具渲染器。
- TanStack Query 管理服务端状态：查询、缓存、失效与 mutation 后重取。默认查询 `staleTime` 为 30 秒、重试一次、窗口聚焦不重取；mutation 不重试。
- Zustand 管理本地编辑草稿、选择态、认证状态、socket 瞬态和其他 UI 状态；不要把服务端列表或详情复制进 store。
- 实时执行由 execution store 接收 socket 事件；`useLiveExecutionDetail` 以 REST 查询作为初始快照，再把实时节点状态合并到展示模型。
- URL 可表达的筛选、分页和标签放入 TanStack Router search 参数；影响结果的所有参数必须进入 Query key。

## Key Directories

```text
src/
├── app/                  # providers、router、手工路由树与 route modules
├── features/             # 按业务域隔离的 feature slices
├── shared/api/           # ky transport、QueryClient 与共享请求
├── shared/components/    # 跨 feature 的组合组件
├── shared/ui/            # Radix/CVA 基础 UI 原语
├── shared/hooks/         # 通用 React hooks
├── shared/lib/           # Supabase、通用基础设施
├── shared/types/         # 少量跨域本地类型
├── shared/utils/         # case conversion 等纯函数
└── test-setup.ts         # Vitest/jsdom 全局测试环境
```

- 核心创作域：`workflow`、`canvas`、`agent`、`agent-canvas`、`agent-conversation`、`workflow-input-schema`、`trigger`、`block-library`。
- 执行与可观测域：`execution`、`monitoring`、`evidence`、`notification`、`audit-log`、`optimization-suggestion`、`routing-decision`、`smart-routing`。
- 资源域：`knowledge`、`agent-memory`、`memory-instance`、`mcp`、`llm`、`skill`、`sandbox`、`workspace`。
- 平台与分发域：`auth`、`organization`、`marketplace`、`template`、`generated-app`、`plugin`、`developer-console`、`discover`、`share`、`onboarding`。
- 管理域：`organization-autonomy-policy`、`intervention-policy`、`resource-governance`、`private-deployment`、`platform-api-token`、`tenant-key`、`user-preference`。
- 工作流画布有额外约束，修改前阅读 `src/features/canvas/AGENTS.md`。

## Development Commands

在 `agentloom-studio/` 中运行：

```bash
pnpm dev             # Vite 开发服务器，默认端口 5173
pnpm build           # tsc -b 后生成 Vite 产物
pnpm preview         # 预览生产构建
pnpm typecheck       # 分别检查 app 与 node TypeScript 配置
pnpm lint            # ESLint 全包检查
pnpm test            # Vitest 单次运行
pnpm test:watch      # Vitest watch 模式
pnpm test:coverage   # V8 coverage，输出 text 与 html
pnpm format          # Prettier 写入格式化
```

## Code Conventions & Common Patterns

- 使用 `@/` 导入 `src/` 内模块；Vite 与 Vitest 共用 `vite.config.ts` 中的别名。
- 每个 feature 通过根 `index.ts` 暴露最小公共面，使用具名导出。跨 feature 只能从 `@/features/<name>` 导入，不得读取其 `components`、`stores`、`api`、`lib`、`hooks` 或 `types` 深路径。
- `eslint.config.js` 会读取 `src/features/` 的一级目录动态生成边界规则；`src/app/routes` 也禁止任何 feature 深路径导入。
- feature 内通常按 `api/`、`components/`、`hooks/`、`lib/`、`stores/`、`types/` 拆分：渲染放组件，生命周期与交互放 hooks，无 React 的转换和 payload builder 放 lib。
- Query key 使用层级工厂，例如 `all → lists() → list(filters)` 与 `details() → detail(id)`；mutation 成功后失效相应层级。
- 表单使用 React Hook Form 管理值和提交状态，Zod 定义 schema，并通过 `zodResolver(schema)` 接入；受控 Radix 组件使用 `Controller`。
- Radix Select 的 item 不使用空字符串 `value`；空态使用 placeholder 或明确的哨兵值映射。
- 优先复用 `shared/ui` 和现有 feature 组件，不要另建第二套基础控件或平行领域类型。

## API Client Pattern

- 所有 REST 请求复用 `src/shared/api/client.ts` 的 `apiClient`，不要直接创建新的 ky 实例。
- 默认 `prefixUrl` 是 `VITE_API_BASE_URL`，未配置时为 `/api/v1`；调用 ky 时传相对资源且不要以 `/` 开头。
- `beforeRequest` 从 `localStorage.auth_token` 写入 Bearer token；401 最多重试一次，并通过 Supabase 刷新 session，失败时登出并跳到 `/login`。
- `afterResponse` 仅转换 JSON 响应，通过 `snakeToCamel` 统一为前端 camelCase。
- JSON 请求使用 ky 的 `json:` 选项；提交前用 `toSnakeBody(...)` 转为 snake_case。上传使用 `body: FormData`，不要手设 `Content-Type`，浏览器需要生成 multipart boundary。
- API wire 类型来自 `@agentloom/api-client` 和 `@agentloom/contracts`；不要手改生成模型。OpenAPI 未表达的 envelope 才放本包共享类型。

## Important Files

- `vite.config.ts`：React/Tailwind 插件、`@` 别名、开发代理和内嵌 Vitest 配置。
- `eslint.config.js`：TypeScript/React 规则及 feature barrel 边界。
- `src/app/providers.tsx`：应用 provider 组合与认证初始化。
- `src/app/routes/__root.tsx`：根布局、认证/onboarding 边界和手工 route tree。
- `src/shared/api/client.ts`：认证、重试、case conversion 的 ky transport。
- `src/shared/api/queryClient.ts`：全局 QueryClient 默认值。
- `src/test-setup.ts`：jest-dom、浏览器 API polyfill 与全局模块 mock。

## Runtime/Tooling Preferences

- Vite 开发代理把 `/api` 与支持 WebSocket 的 `/socket.io` 转发到 `http://localhost:3000`；文件系统访问允许 monorepo 上一级目录。
- 环境变量示例在 `.env.example`：`VITE_API_BASE_URL`、`VITE_AUTOSAVE_DEBOUNCE_MS`、`VITE_SUPABASE_URL`、`VITE_SUPABASE_ANON_KEY`。
- 新依赖、跨包契约生成和 monorepo 级命令遵循根 `AGENTS.md`；本文件只约束 Studio 包内实现。

## Testing & QA

- Vitest 配置内嵌在 `vite.config.ts`：全局 API、`jsdom`、10 秒超时，匹配 `src/**/*.test.{ts,tsx}`，且不处理 CSS。
- 测试与源码同级，组件使用 Testing Library 与 `user-event`，hooks 使用 `renderHook`；断言面向用户行为和状态变化。
- `src/test-setup.ts` 每个测试恢复真实 timer，加载 jest-dom，并补齐 `ResizeObserver`、pointer capture、`scrollIntoView`。
- 全局 setup 已 mock theme、Supabase 和 `react-pdf`；单测需要不同分支时在测试内明确覆盖并恢复。
- Query hooks 的测试创建独立 `QueryClient` 与 `QueryClientProvider`，避免共享缓存；模块 mock 需要提升时使用 `vi.hoisted()` 配合 `vi.mock()`。
- 修改行为后优先运行相关文件，例如 `pnpm vitest run src/features/workflow/components/PublishSheet.test.tsx`，再按需要执行包级检查。
