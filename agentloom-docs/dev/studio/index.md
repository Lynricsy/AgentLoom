---
docType: explanation
---

# Studio 架构

Studio 的代码为什么按 feature 切片组织，跨切片依赖和路由注册又受哪些规则约束？

`agentloom-studio` 是 AgentLoom 的 React 前端工作台。依赖版本以 `agentloom-studio/package.json` 为准（构建工具为 Vite 8、React 19、TanStack Router、Zustand、TanStack Query、ky、`@xyflow/react`、Tailwind CSS 4）。本页解释目录分层、feature 边界、路由树与启动链；画布见 [画布编辑器](/dev/studio/canvas)，状态与数据流见 [状态与数据流](/dev/studio/state)。

## 目录分层

代码主线是 `src/app/routes → feature 公开 barrel → feature 内部 → shared`：

```text
agentloom-studio/src/
├── main.tsx        # 挂载 AppProviders
├── app/            # providers、router、手工路由树与各路由模块
├── features/       # 按业务域隔离的 feature 切片，每个切片根目录有 index.ts
└── shared/
    ├── api/        # ky 客户端、QueryClient、共享请求
    ├── components/ # 跨 feature 的组合组件（侧栏、设置布局、命令面板等）
    ├── ui/         # Radix + CVA 基础 UI 原语
    ├── hooks/      # 通用 React hooks
    ├── lib/        # Supabase 客户端、通用工具（含 cn()）
    ├── providers/  # 主题 provider
    ├── types/      # 少量跨域本地类型
    └── utils/      # 纯函数（含 snake/camel 转换）
```

feature 内部通常按 `api/`、`components/`、`hooks/`、`lib/`、`stores/`、`types/` 拆分：渲染放组件，生命周期与交互放 hooks，不依赖 React 的转换与 payload 构造放 `lib/`。`shared/ui/` 的组件集合以目录内容为准，新增基础控件前先复用已有原语。

## Feature 边界

每个 feature 通过根目录的 `index.ts` 暴露公开面。跨 feature 依赖只能写 `@/features/<name>`，不得读取其他 feature 的 `components`、`stores`、`api`、`lib`、`hooks`、`types` 深路径。

这条规则由 ESLint 强制，定义在 `agentloom-studio/eslint.config.js`：

- 配置加载时用 `readdirSync` 读取 `src/features/` 的一级目录名，为每个 feature 生成一组 `no-restricted-imports` 规则。规则作用于该 feature 自己的文件，禁止导入**其他** feature 的上述六类深路径（`@/features/<other>/components`、`.../components/*`、`.../components/**` 等形式），报错信息为「跨 feature 依赖必须通过目标 feature 的公开 barrel。」。feature 读取自己的深路径不受限制。
- `src/app/routes/**` 另有一条规则，禁止 `@/features/*/**` 任何深路径，报错信息为「路由只能通过 feature 的公开 barrel 导入。」。

新增 feature 目录后不需要改 ESLint 配置，规则在下次运行 lint 时自动包含它。`src/shared/**` 与 `src/app/` 下的非路由文件不在这两条规则的范围内，例如 `agentloom-studio/src/shared/api/client.ts` 与 `agentloom-studio/src/app/providers.tsx` 直接导入了 `@/features/auth/stores/auth.store`。

这样切的取舍：barrel 让 feature 内部可以自由重构，代价是公开面会随跨 feature 需求增长。`agentloom-studio/src/features/canvas/AGENTS.md` 要求新增公开导出前先确认它确实被其他 feature 需要。

### 业务域分组

feature 清单由生成器从 `agentloom-studio/src/features` 目录产出：

<!--@include: ../../_generated/studio-features.md-->

按业务域理解这些切片时，可以用以下分组（只说明归属方式，不是完整清单）：

- **创作**：工作流本身（`workflow`）、画布编辑器（`canvas`）、Agent 定义与 Agent 配置画布、Agent 对话、工作流输入参数、触发器、可复用节点块。
- **执行与可观测**：执行追踪（`execution`）、执行证据、运行监控、通知、审计日志、优化建议、路由决策与智能路由。
- **资源**：知识库、记忆（`agent-memory` 与 `memory-instance`）、MCP、LLM 模型、Skill、沙箱、工作区。
- **平台与分发**：认证（`auth`）、组织、市场、模板、生成应用、插件、开发者控制台、分享、新手引导。
- **管理**：组织自治策略、介入策略、资源治理、私有部署、平台 API Token、租户密钥、用户偏好。

分组只用于阅读；代码中没有对应的目录层级，ESLint 规则对所有 feature 一视同仁。

## 路由树

Studio 使用 TanStack Router 的代码式路由，不使用文件路由插件生成路由树：

- 每个路由模块用 `createRoute({ getParentRoute: () => rootRoute, path, component })` 声明自己的 URL。所有路由都直接挂在根路由下，没有嵌套 layout 路由。
- `agentloom-studio/src/app/routes/__root.tsx` 逐个 import 这些路由对象，再用 `rootRoute.addChildren([...])` 组装 `routeTree`。新增路由文件后必须在这里登记，否则路由不存在。
- `agentloom-studio/src/app/router.tsx` 用 `createRouter({ routeTree, defaultPreload: 'intent' })` 创建路由器，并通过 `declare module '@tanstack/react-router'` 注册类型。

URL 由各模块里的 `path` 字面量决定，文件名只是约定。多数文件名与 URL 对应（`.` 对应 `/`，`$x` 对应参数），但存在例外：`agentloom-studio/src/app/routes/share.$token.tsx` 声明的是 `/s/$token`。

路由清单由生成器从 `agentloom-studio/src/app/routes` 产出：

<!--@include: ../../_generated/studio-routes.md-->

### 根布局与认证守卫

`__root.tsx` 的 `RootLayout` 是所有页面的外壳，按以下顺序判断：

1. 公开路由：`/login`、`/register`、`/auth/callback`，以及以 `/s/`、`/generated-apps/public/` 开头的路径。判断基于 `window.location.pathname`。
2. 认证状态加载中且不是公开路由：渲染全屏加载指示。
3. 未认证且不是公开路由：跳转 `/login?returnUrl=<当前路径>`。
4. 已认证但 auth store 的 `needsOnboarding` 为真且不在 `/onboarding`：跳转 `/onboarding`。
5. 公开路由与 onboarding 只渲染 `<Outlet />`，不带侧栏。
6. 其他路由渲染应用壳：`/settings` 开头的路径用 `SettingsLayout`，其余在桌面宽度下用 `AppSidebar`、小屏用 `MobileTopBar`；外加 `CommandPalette`。

根布局还在非公开路由上建立 `/notification` socket（`useNotificationSocket`）。feature 页面不应重复实现登录跳转、onboarding 跳转或壳层。

## 启动链

```text
index.html → src/main.tsx → AppProviders → RouterProvider → RootLayout → 路由组件
```

- `agentloom-studio/src/main.tsx` 引入 `index.css`，监听 `vite:preloadError`（部署后旧 chunk 失效时用 `sessionStorage` 标记并刷新一次页面），在 `StrictMode` 下渲染 `AppProviders`。第三方样式统一在 `index.css` 中 `@import`，不在 `main.tsx` 重复引入。
- `agentloom-studio/src/app/providers.tsx` 在模块加载时调用 `registerAllToolRenderers()`；组件挂载后调用 `useAuthStore.getState().initialize()`。Provider 嵌套顺序为 `MotionConfig`（`reducedMotion="user"`）→ `ThemeProvider` → `QueryClientProvider` → `ToastProvider` → `RouterProvider`，`ReactQueryDevtools` 与 `RouterProvider` 同级。

## 构建与测试配置

`agentloom-studio/vite.config.ts` 同时是 Vite 与 Vitest 的配置（从 `vitest/config` 导入 `defineConfig`）：

| 配置 | 值 | 作用 |
| --- | --- | --- |
| `plugins` | `react()`、`tailwindcss()` | React 与 Tailwind CSS 4 插件 |
| `resolve.alias` | `@` → `src` | Vite 与 Vitest 共用的路径别名 |
| `server.port` | `STUDIO_DEV_PORT`，默认 `5173` | 开发服务器端口 |
| `server.fs.allow` | 包的上一级目录 | 允许读取 monorepo 中其他包的文件（类型引擎 worker 加载 `agentloom-type-engine/pkg/` 下的 WASM） |
| `server.proxy['/api']` | `STUDIO_DEV_API_TARGET`，默认 `http://localhost:3000` | REST 请求转发到 server |
| `server.proxy['/socket.io']` | 同上，`ws: true` | Socket.IO 握手与 WebSocket 转发到 server |
| `test.environment` | `jsdom` | 测试 DOM 环境 |
| `test.setupFiles` | `./src/test-setup.ts` | 全局测试初始化 |
| `test.include` | `src/**/*.test.{ts,tsx}` | 测试文件匹配 |
| `test.testTimeout` | `10000` | 单测超时（毫秒） |
| `test.css` | `false` | 测试不处理 CSS |
| `test.coverage` | `v8`，报告 `text`、`html` | 覆盖率 |

开发时 REST 基址取 `VITE_API_BASE_URL`，未设置时为 `/api/v1`，经代理到达 server。本地启动步骤见 [本地开发环境](/dev/setup)，Studio 环境变量见 [配置参考](/deploy/configuration)。
