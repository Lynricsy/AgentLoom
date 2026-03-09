# AGENTLOOM 项目知识库

> **Generated:** 2026-03-09 | **Commit:** 5092f50 | **Branch:** main

## 自动化开发循环规则

你正身处一个自动化开发循环,没有用户能回复你.

1. 进行开发时,请及时进行原子化提交.不要问"要不要提交",直接提交.如果工作开始时发现工作区不干净,那先把未提交的文件提交或者需要ignore的文件ignore再开始工作.
2. 不能停止工作并等待pty或后台agent,必须持续轮询.如果认为还需要很长时间才能完成,可以设置较长的阻塞时间.你一旦停止,系统将认为你的工作已经完成并直接交接给下一步,你将等不到后台工作完成提醒.
3. 不能遗留任何没通过的测试。即使一个未能通过的测试你认为是之前就存在的问题，那也要去找到导致未通过的根本原因并进行修复。又因为之前开发轮次也会执行这条要求，所以理应不会有之前的"遗留问题"导致的未通过的测试，未通过的测试应该都是本次开发导致的回归。
4. 开发时及时更新各个 AGENTS.md，确保知识库与代码保持同步。

## 概览

AgentLoom — 多智能体工作流编排平台。用户通过可视化画布将 AI Agent 组合为 DAG 工作流并执行。

## 项目结构

```
AgentLoomAUTO/
├── agentloom-server/         # NestJS v11 + Fastify v5 后端 (见子 AGENTS.md)
├── agentloom-studio/         # React 19 + Vite 7 前端 (见子 AGENTS.md)
├── agentloom-type-engine/    # Rust WASM 端口兼容性检查器 (见子 AGENTS.md)
├── docker-compose.dev.yml    # 仅 Qdrant (其余服务为外部/Supabase)
├── _bmad/                    # BMAD agent 系统配置 (勿修改)
├── _bmad-output/             # BMAD 生成的文档
└── package.json              # 根 package (仅 @modelcontextprotocol/sdk)
```

**非标准 monorepo**: 无 pnpm-workspace.yaml，三个包各自独立管理 node_modules 和 lockfile。

## 在哪找什么

| 任务 | 位置 | 备注 |
|------|------|------|
| 添加后端 API 端点 | `agentloom-server/src/modules/` | NestJS 模块，每模块有 controller/service/dto |
| 添加数据库表 | `agentloom-server/src/database/schema/` | Drizzle ORM，需 `pnpm db:generate` |
| 修改全局中间件/守卫 | `agentloom-server/src/common/` | guards/interceptors/middleware/filters |
| 添加前端路由 | `agentloom-studio/src/app/routes/` | TanStack Router，手动路由树 |
| 添加前端 feature | `agentloom-studio/src/features/` | Feature-Slice 架构 |
| 添加画布节点类型 | `agentloom-studio/src/features/canvas/` | 见 canvas 子 AGENTS.md |
| 修改端口类型兼容性 | `agentloom-type-engine/src/checker/` | Rust，需 `wasm-pack build` |
| 共享 UI 组件 | `agentloom-studio/src/shared/ui/` | CVA + Radix + Tailwind |
| 环境变量 | `agentloom-server/.env.example` / `agentloom-studio/.env.example` | |

## 跨包架构

```
type-engine (Rust/WASM)
  └── [计划中 Story-2.4a] → studio (目前为 JS fallback)

studio (React) ──HTTP REST──→ server (/api/v1)
              ──Socket.IO──→ server (/execution, /knowledge)

server (NestJS) → PostgreSQL (Supabase/Drizzle) + Redis (BullMQ) + Qdrant + MinIO
```

**类型共享**: 无共享包。通过约定/手动镜像同步（有漂移风险）。
**大小写转换**: Studio 全局 ky hook 自动 snake_case ↔ camelCase。

## 关键约定

- **NO CI/CD** — 仅开发环境
- **Fastify** 非 Express，**Drizzle** 非 TypeORM，**Zod** 非 class-validator，**Vitest** 非 Jest
- **ESLint**: flat config + typescript-eslint + prettier (singleQuote, trailingComma:all)
- **`no-explicit-any: off`** — 项目允许 any（但应尽量避免）
- **Server 80% 覆盖率阈值**，Studio 无阈值
- **多租户**: 全局中间件链 TenantMiddleware → TenantTransactionInterceptor → AuthGuard → TenantGuard → RolesGuard
- **vi.hoisted()** 在测试中广泛使用，mock factory 函数模式
- **Testcontainers PostgreSQL** 用于 E2E 测试

## 命令

```bash
# Server
cd agentloom-server
pnpm install && pnpm start:dev    # 开发 (watch mode)
pnpm test                          # 单元测试
pnpm test:e2e                     # E2E (需 Docker)
pnpm test:cov                     # 覆盖率 (80% 阈值)
pnpm db:generate                  # 生成 Drizzle 迁移
pnpm db:migrate                   # 执行迁移
pnpm db:studio                    # Drizzle Studio UI

# Studio
cd agentloom-studio
pnpm install && pnpm dev          # 开发 (Vite)
pnpm test                          # 单元测试
pnpm typecheck                    # tsc --noEmit
pnpm build                        # 生产构建

# Type Engine
cd agentloom-type-engine
cargo test                         # 测试
cargo bench                       # 基准测试
wasm-pack build --target bundler --release  # 构建 WASM
```

## 注意事项

- **WASM 集成尚未完成**: `agentloom-studio/src/features/canvas/lib/connectionCompatibility.ts` 是 JS fallback，待 Story-2.4a 替换为 WASM
- **PortDataType 漂移**: Rust(8值) vs Studio TS(8值) vs Server Zod(6值，缺少 model/tool/sandbox/knowledge)
- **Socket.IO `/execution` 事件协议已统一**: typed `ExecutionEvent<T>` 信封 (含 monotonic eventId)，`execution:subscribe`/`execution:unsubscribe` + ACK，事件经 EventBridgeService → ThrottleService → broadcastTypedEvent() 管线。事件名称统一为 `execution.node.*` 前缀 (`status-changed`, `agent-event`, `retrying`, `output-chunk`) + `execution.status-changed`。Gateway 含背压队列 (500 cap, 100ms drain)。认证失败返回 close code 4001，订阅拒绝返回 `{status:'error', error:'FORBIDDEN'}`。但 `/knowledge` namespace 仍为隐式契约
- **docker-compose.dev.yml 仅 Qdrant**: PostgreSQL/Redis/MinIO 需外部部署或使用 Supabase
- **WASM 产物已提交**: `agentloom-type-engine/pkg/` 包含构建后的 .wasm 文件
