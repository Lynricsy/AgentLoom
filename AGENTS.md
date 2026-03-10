# AGENTLOOM 项目知识库

> **Generated:** 2026-03-09 | **Commit:** 5092f50 | **Branch:** main

## 自动化开发循环规则

你正身处一个自动化开发循环,没有用户能回复你.

1. 进行开发时,请及时进行原子化提交.不要问"要不要提交",直接提交.如果工作开始时发现工作区不干净,那先把未提交的文件提交或者需要ignore的文件ignore再开始工作.
2. 不能停止工作并等待pty或后台agent,必须持续轮询.如果认为还需要很长时间才能完成,可以设置较长的阻塞时间.你一旦停止,系统将认为你的工作已经完成并直接交接给下一步,你将等不到后台工作完成提醒.
3. 不能遗留任何没通过的测试。即使一个未能通过的测试你认为是之前就存在的问题，那也要去找到导致未通过的根本原因并进行修复。又因为之前开发轮次也会执行这条要求，所以理应不会有之前的"遗留问题"导致的未通过的测试，未通过的测试应该都是本次开发导致的回归。
4. 开发时及时更新各个 AGENTS.md，确保知识库与代码保持同步。
5. 如果你是作为code reviewer,同时你发现当前story的部分内容确实依赖于后面的story才能完成,那如果当前story除了这个被阻塞的部分之外其他部分都已经完成的话,可以提前标记为done,但是必须在它所依赖的那个story加上完成这部分被阻塞的任务的任务,确保那个被依赖的story完成后,当前这个未完成的任务会被完成.
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
              ──Socket.IO──→ server (/execution, /knowledge, /notification)

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

- **Story 5.8 已完成**: workflow session 现持久化到 `execution_steps.checkpointData.session`；工具权限端点为 `/executions/:executionId/steps/:stepId/tool-calls/:toolCallId/resolve`；`awaiting_permission` 是 tool-level 状态且 step 保持 `running`；`ToolCallEvent` 现包含 `transitions[{ from?, to, source, timestamp }]`
- **Studio 执行历史/调试视图已接通**: `WorkflowCanvasPage` 可按需展开 `ExecutionHistoryPanel` 浏览 `/workflow-definitions/:id/executions`，点击 `RunCard` 跳转 `/executions/$executionId`；调试页为只读 React Flow + 时间线 + 节点详情三栏布局（移动端纵向堆叠），时间线现为“每个 execution step 一行 + duration bar”，节点详情读取真实 `execution_steps.input` JSONB
- **WASM 集成尚未完成**: `agentloom-studio/src/features/canvas/lib/connectionCompatibility.ts` 是 JS fallback，待 Story-2.4a 替换为 WASM
- **PortDataType 漂移**: Rust(8值) vs Studio TS(8值) vs Server Zod(6值，缺少 model/tool/sandbox/knowledge)
- **Socket.IO `/execution` 事件协议已统一**: typed `ExecutionEvent<T>` 信封 (含 monotonic eventId)，`execution:subscribe`/`execution:unsubscribe` + ACK，事件经 EventBridgeService → ThrottleService → broadcastTypedEvent() 管线。事件名称统一为 `execution.node.*` 前缀 (`status-changed`, `agent-event`, `retrying`, `output-chunk`) + `execution.status.changed`。Gateway 含背压队列 (500 cap, 100ms drain)。认证失败返回 close code 4001，订阅拒绝返回 `{status:'error', error:'FORBIDDEN'}`。断线重连支持 `lastEventId` 增量回放 (EventBridgeService 环形缓冲 500 事件)。但 `/knowledge` namespace 仍为隐式契约
- **通知模块已接通**: Server 新增 `NotificationModule`（REST 列表/偏好、BullMQ `notification` 队列、`/notification` namespace）。`EventBridgeService.emitExecutionStatusChanged()` 会发出 `execution.status.changed`，`emitInterventionRequired()` 会额外发出 `execution.node.intervention-required`；`NotificationListener` 会向租户内 `owner/admin/creator`（Editor+）fan-out 创建 `completed` / `failed` / `intervention_required` 通知，body 含 `workflowId/workflowName/executionId/timelineUrl` 及错误/干预上下文，实时事件名为 `notification.new` / `notification.unread-count`。Studio 的首次成功庆祝现使用 workflow-scoped key `agentloom:workflow:{workflowId}:first-success-celebrated`
- **Studio 认证占位**: `useAuthToken` 使用 localStorage('auth_token') + useSyncExternalStore，标记 TODO(auth) 待替换为真实 Supabase 认证。`useExecutionSocket` 已支持 `authToken?` 参数。Studio 无 Supabase 客户端/auth store
- **执行触发已接通**: VersionToolbar Run 按钮 → `useStartExecution` → POST /workflow-definitions/:id/run → executionStore.initExecution(id)。WorkflowStatusBar 显示 ExecutionStatusIndicator (6 状态 + 进度)
- **docker-compose.dev.yml 仅 Qdrant**: PostgreSQL/Redis/MinIO 需外部部署或使用 Supabase
- **WASM 产物已提交**: `agentloom-type-engine/pkg/` 包含构建后的 .wasm 文件
- **Story 6-1 已完成**: EvidenceModule 已实现（Server: schema + DTO + service + controller + module + exceptions + events；Studio: types + api + query hooks + barrel）。证据记录支持 5 种 source type (`rag_retrieval`/`agent_decision`/`tool_output`/`user_input`/`intervention`)，`parent_evidence_id` 现为自引用 FK。自动证据事件来源为 `knowledge.rag.retrieved`、`execution.node.agent-event`、`execution.node.tool-call-status`、`execution.node.intervention-resolved`；`RagService.search()` 支持 `evidenceContext { executionId, stepId, parentEvidenceId? }`。完整性校验为服务端 source-payload SHA-256 重算，返回 `{ evidenceId, valid, integrityWarning }`。批量写入支持 50ms buffer flush。REST 端点: GET `/executions/:id/evidence` (分页) + GET `/:evidenceId` + GET `/:evidenceId/verify`
- **Story 6-2 已完成**: 溯源链自动构建与完整性校验。Server: `EvidenceService.buildChain()` 递归 CTE 遍历 `parent_evidence_id` 链（maxDepth=50），flat→tree，LEFT JOIN `document_chunks` 检测来源删除/修改，SHA-256 哈希校验。Redis 缓存 TTL 300s，evidence 写入自动失效。`verifyChainIntegrity()` 复用缓存（validate not rebuild）。REST: `GET /executions/:id/evidence/chain?nodeId=xxx` + `X-Cache-Hit` header。Studio: `EvidenceChainNode`/`EvidenceChainResponse`/`IntegrityIssue` 类型 + `fetchEvidenceChain` API + `useEvidenceChain` hook（staleTime 5min）+ barrel exports
