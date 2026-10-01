# agentloom-studio

AgentLoom 的 Web 工作台（React 19 + Vite + TanStack Router/Query + Zustand）：工作流与 Agent 画布、执行监控、Agent 对话、资源管理、治理配置、模板、市场与生成应用。REST 走 `/api/v1`，实时事件走 Socket.IO。设计说明见文档站「贡献者 → 前端」。

## 开发命令

依赖安装在仓库根执行一次 `pnpm install`；以下命令在 `agentloom-studio/` 内运行。

```bash
cp .env.example .env   # 首次：VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 必须填写
pnpm dev               # Vite 开发服务器 :5173，/api 与 /socket.io 代理到 http://localhost:3000
pnpm typecheck         # tsc（tsconfig.app.json + tsconfig.node.json）
pnpm lint              # ESLint（含 feature 边界规则）
pnpm format            # Prettier
pnpm test              # Vitest（jsdom）
pnpm test:watch
pnpm test:coverage
pnpm build             # tsc -b && vite build
pnpm preview           # 预览生产构建
```

OpenAPI 类型再生成在仓库根运行 `pnpm contracts:regen`。

## 文档

- 架构、feature 清单与路由清单：`agentloom-docs/dev/studio/index.md`
- 画布：`agentloom-docs/dev/studio/canvas.md`
- 状态管理与 REST/Socket 约定：`agentloom-docs/dev/studio/state.md`
- 构建期环境变量：`agentloom-docs/deploy/configuration.md`
