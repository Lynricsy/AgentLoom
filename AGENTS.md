# AGENTLOOM 项目知识库

> **Generated:** 2026-03-20 | **Commit:** 98f67df | **Branch:** main

## 自动化开发循环规则

1. 进行开发时,请及时进行原子化提交和推送.不要问"要不要提交",直接提交.如果工作开始时发现工作区不干净,那先把未提交的文件提交或者需要ignore的文件ignore再开始工作.任务完成后,**必须**进行提交
2. 不能遗留任何没通过的测试。即使一个未能通过的测试你认为是之前就存在的问题，那也要去找到导致未通过的根本原因并进行修复。又因为之前开发轮次也会执行这条要求，所以理应不会有之前的"遗留问题"导致的未通过的测试，未通过的测试应该都是本次开发导致的回归。
3. 开发时及时使用init-deep更新各个 AGENTS.md，和README.md，确保知识库与代码保持同步。
4. **AGENTS.md 内容规范**：AGENTS.md 是**持久性架构知识库**，仅记录当前系统状态的事实性描述。**严禁写入**以下内容：
   - Story/Epic 编号引用（如 "Story 8-3"、"Epic 2"）
   - 完成状态标记（如 "已完成"、"已收口"、"✅"、"code-review remediation"）
   - 变更历史日志（如 "X 现在变为 Y"、"从 A 改为 B"）
   - 开发过程记录（如 "审查修复补充"、"某 Story 补充"）
   
   正确写法：描述系统**当前是什么**，而非**曾经发生了什么**。工作日志请使用 `record-agent-log` 工具记录。
5. 测试账号：test@example.invalid,密码： <TEST_ACCOUNT_PASSWORD>

## 概览

AgentLoom — 多智能体工作流编排平台。用户通过可视化画布将 AI Agent 组合为 DAG 工作流并执行。

## 项目结构

```
AgentLoomAUTO/
├── agentloom-server/         # NestJS v11 + Fastify v5 后端 (见子 AGENTS.md)
├── agentloom-studio/         # React 19 + Vite 7 前端 (见子 AGENTS.md)
├── agentloom-deploy/         # 私有化部署资产 (Docker Compose + Helm + 运维脚本) (见子 AGENTS.md)
├── agentloom-docs/           # VitePress 2 文档站 (中英双语 + OpenAPI + Mermaid) (见子 AGENTS.md)
├── agentloom-type-engine/    # Rust WASM 端口兼容性检查器 (见子 AGENTS.md)
├── agentloom-plugin-sdk/     # TypeScript 插件开发 SDK (Zod 3 + tsup dual output) (见子 AGENTS.md)
├── agentloom-plugin-cli/     # 插件脚手架 CLI (create/dev/build/keys/publish 命令) (见子 AGENTS.md)
├── agentloom-plugin-template/ # 示例插件模板 (text-to-uppercase)
├── agentloom_mobile/         # Flutter 3.41.2 移动端应用 (Riverpod + GoRouter + Dio) (见子 AGENTS.md)
├── docker-compose.dev.yml    # 仅 Qdrant (其余服务为外部/Supabase)
├── _bmad/                    # BMAD agent 系统配置 (勿修改)
├── _bmad-output/             # BMAD 生成的文档
└── package.json              # 根 package (仅 @modelcontextprotocol/sdk)
```

**非标准 monorepo**: 无 pnpm-workspace.yaml，各包各自独立管理依赖和 lockfile。

## 在哪找什么

| 任务 | 位置 | 备注 |
|------|------|------|
| 添加后端 API 端点 | `agentloom-server/src/modules/` | NestJS 模块，每模块有 controller/service/dto |
| 添加数据库表 | `agentloom-server/src/database/schema/` | Drizzle ORM，需 `pnpm db:generate` |
| 修改全局中间件/守卫 | `agentloom-server/src/common/` | guards/interceptors/middleware/filters |
| 管理 ACP stdio server 与协议适配层 | `agentloom-server/src/modules/acp-gateway/` + `agentloom-server/src/acp-stdio.ts` | initialize/authenticate、`session/new` / `session/prompt` / `session/cancel` / `session/load` / `session/update`、真实 `fs/read_text_file` / `fs/write_text_file` client-proxy + server-sandbox surface、真实 `terminal/create` / `terminal/output` / `terminal/wait_for_exit` / `terminal/kill` / `terminal/release` server-sandbox surface、canonical `readTextFile` / `writeTextFile` 与仅在 client 同时启用 `terminal.create` / `terminal.output` 时暴露的 `terminal: { create: true }` capability negotiation（兼容 initialize legacy alias）、写入前官方 `session/request_permission` request/response、基于 `sandbox_sessions` 的 ACP-local sandbox workspace 解析、`/workspace/` 边界 + `realpath` / symlink / traversal / oversize / binary guardrails、session-bound terminal registry + durable continuity metadata、默认 1MB ring buffer / 5 并发 / 300s lifetime timeout kill、spawn 前危险 command/pattern/path/cwd 拒绝与正式审计、per-request `outputByteLimit` bounded retrieval、exited/killed terminal output stable error、manual kill 与 cleanup kill 审计、`session/cancel` 与 stdio 连接关闭 cleanup、cold-recovery `session/load` fail-closed、conversation-session 级工具权限恢复、JSON-RPC 2.0 错误映射、连接状态、独立 stdio 入口 |
| 管理服务端插件注册与生态 | `agentloom-server/src/modules/plugin/` | `.alp` multipart 注册 + canonical archive RSA-PSS 验签、`plugins`/`plugin_developer_keys`/`plugin_usage_records`/`plugin_earnings` 表、`PluginSandboxService`（Extism WASM 沙箱）、开发者密钥管理 API、`plugin-execution`/`earnings-settlement` 队列、插件市场 CRUD、使用量记录、收益结算 |
| 管理 Skill 定义与内容 | `agentloom-server/src/modules/skill/` | `SkillModule`: Skill CRUD + MinIO 存储 + `SkillStorageService`（SKILL.md 上传/下载/解析）+ `SkillResolverService`（生成 `<available_skills>` XML 注入 agent/workflow 系统提示）+ REST API、5 个内置种子 Skill |
| 管理 Studio Skill 功能 | `agentloom-studio/src/features/skill/` | Skill 管理页面 `/settings/skills`（分类 Tabs + 搜索 + 启停）+ 画布 `skill` 节点 + `SkillBody`/`SkillPanel`/`SkillConfigPanel`/`CreateSkillDialog`（Monaco 编辑器懒加载） |
| 管理 Mobile Skill 功能 | `agentloom_mobile/lib/features/skills/` | Skill 列表/详情/编辑屏（仅 name/description，无 SKILL.md 编辑）+ Riverpod providers + API 层 |
| 管理 Agent 配置优化建议闭环 | `agentloom-server/src/modules/optimization-suggestion/` + `agentloom-studio/src/features/optimization-suggestion/` | 周期分析 `agent_execution_records`、生成/应用/忽略建议、采纳率统计、Studio live Agent Config 建议面板 |
| 管理审计日志与保留归档 | `agentloom-server/src/modules/evidence/` + `agentloom-studio/src/features/audit-log/` | evidence 域统一审计写入、组织级 `audit-logs` 查询 API、按资源序列回放、hot/archive merged recall、`audit-log-retention` 单例归档调度、Studio `/settings/audit-logs` 查询页 |
| 管理资源配额与异常执行治理 | `agentloom-server/src/modules/resource-governance/` + `agentloom-studio/src/features/resource-governance/` | `tenant_quotas` / `execution_governance_controls` typed store、`runWorkflow()` 准入阻断、tenant-aware API 限流/日配额、治理操作审计/通知、Studio `/settings/resource-quotas` 管理页 |
| 管理组织级运行监控仪表板 | `agentloom-server/src/modules/monitoring/` + `agentloom-studio/src/features/monitoring/` | owner/admin 只读 monitoring dashboard、`15m/1h/24h` 时间窗口、execution/governance/notification/audit 聚合与当前 queue snapshot 摘要、Studio `/settings/monitoring` 页面与 deep link |
| 管理私有部署配置与部署资产 | `agentloom-server/src/modules/private-deployment/` + `agentloom-studio/src/features/private-deployment/` + `agentloom-deploy/` | owner/admin 私有部署设置 API 与 `/settings/private-deployment` 页面、受管 secret 引用 / RSA-PSS license 校验、Docker Compose / Helm / 备份恢复脚本与私有部署手册 |
| 管理 Agent 定义与版本 | `agentloom-server/src/modules/agent-definition/` | Agent CRUD + 版本管理 + canvas 保存 + 发布/归档，`agent_definitions`/`agent_versions` 表 |
| 管理 Agent 对话 | `agentloom-server/src/modules/agent-conversation/` + `agentloom-studio/src/features/agent-conversation/` + `agentloom_mobile/lib/features/agents/` | 对话生命周期 CRUD、消息历史 API、`agent_conversations`/`agent_messages` 表、Studio 三列对话 UI、Mobile 对话屏 |
| 管理 Agent 执行引擎 | `agentloom-server/src/modules/agent-execution/` | 对话执行 worker + Socket.IO `/agent-conversation` gateway + workspace 文件集成、`WorkflowAgentAdapter` 桥接工作流 `agent` 节点 |
| 管理 Agent Memory | `agentloom-server/src/modules/agent-memory/` + `agentloom-studio/src/features/agent-memory/` + `agentloom_mobile/lib/features/memory/` | Agent 记忆系统：图谱存储/检索/可视化，Socket.IO `/memory` namespace，Studio 图谱可视化（d3-force + dagre），Mobile 5 屏管理 |
| 管理可复用块 | `agentloom-server/src/modules/reusable-block/` + `agentloom-studio/src/features/block-library/` | 可复用工作流块的 CRUD + 版本管理，画布 `reusable-block` 节点封装/展开 |
| 管理 Agent 配置画布 | `agentloom-studio/src/features/agent-canvas/` | Agent 配置编辑器画布（CPU/memory/timeout/lifecycle 参数，非执行 DAG），使用 ReactFlow + `AGENT_CANVAS_NODE_REGISTRY` 子集 |
| 管理 Agent CRUD 页面 | `agentloom-studio/src/features/agent/` | Agent 列表/创建/设置页面，query hooks，mutations |
| 管理共享资源注册表 | `agentloom-server/src/modules/shared-resources/` | `SharedResourceRegistry` 通用 provider 接口（type/create/destroy/share），sandbox 为首个实现 |
| 管理 Workspace 快照 | `agentloom-server/src/modules/workspace/` | Workspace 持久化服务，`workspace_snapshots` 表 |
| 管理工作流分享链接 | `agentloom-server/src/modules/share/` | 管理端 `/workflow-shares`，公共短链 `/s/:token` |
| 管理 Studio 认证与安全 | `agentloom-studio/src/features/auth/` | Supabase PKCE 认证、Zustand auth store、OAuth/MFA 组件、`/login` `/register` `/auth/callback` `/settings/security` 路由 |
| 管理移动端认证与安全 | `agentloom_mobile/lib/features/auth/` + `agentloom_mobile/lib/features/settings/` | OAuth (Google/GitHub) + url_launcher、原生 MFA TOTP 屏幕、密码修改/会话管理/安全设置 |
| 添加前端路由 | `agentloom-studio/src/app/routes/` | TanStack Router，手动路由树 |
| 添加前端 feature | `agentloom-studio/src/features/` | Feature-Slice 架构 |
| 添加画布节点类型 | `agentloom-studio/src/features/canvas/` | 见 canvas 子 AGENTS.md |
| 修改端口类型兼容性 | `agentloom-type-engine/src/checker/` | Rust，需 `wasm-pack build` |
| 添加插件 SDK 类型/校验/辅助函数 | `agentloom-plugin-sdk/src/` | standalone TS 包，输出 ESM+CJS |
| 共享 UI 组件 | `agentloom-studio/src/shared/ui/` | CVA + Radix + Tailwind |
| 添加移动端 feature | `agentloom_mobile/lib/features/` | Feature 目录，每 feature 含 screens/ |
| 修改移动端路由 | `agentloom_mobile/lib/routes/` | GoRouter + StatefulShellRoute |
| 移动端共享组件 | `agentloom_mobile/lib/shared/` | providers/models/widgets |
| 环境变量 | `agentloom-server/.env.example` / `agentloom-studio/.env.example` / `agentloom_mobile/.env.*` | |
| 管理沙箱容器镜像与 HTTP 适配 | `agentloom-deploy/sandbox/` | Fastify HTTP + pi-coding-agent 运行时 |
| 管理 pi-agent-core 适配器 | `agentloom-server/src/modules/agent/pi-agent-core.adapter.ts` | InProcessAgent 委托运行时 |
| 管理 pi 配置生成 | `agentloom-server/src/modules/sandbox/pi-config-generator.service.ts` | Agent 定义 → pi 配置文件 |
| 管理工具 schema 转换 | `agentloom-server/src/modules/agent/tool-schema-converter.ts` | Zod ↔ TypeBox 边界转换 |
| 添加/编辑文档 | `agentloom-docs/zh/` / `agentloom-docs/en/` | VitePress 2，中英双语，prebuild 同步 OpenAPI spec |

## 跨包架构

```
type-engine (Rust/WASM)
  └── studio（TypeEngineService + Web Worker/WASM runtime + 受控 fallback）

studio (React) ──HTTP REST──→ server (/api/v1)
              ──Socket.IO──→ server (/execution, /agent-conversation, /knowledge, /notification, /memory)

mobile (Flutter) ──HTTP REST──→ server (/api/v1)
              ──Socket.IO──→ server (/execution, /agent-conversation namespace, JWT auth)

server (NestJS) → PostgreSQL (Supabase/Drizzle) + Redis (BullMQ) + Qdrant + MinIO

pi-mono (外部仓库，提供两个核心包):
  pi-coding-agent: 完整编码 Agent 运行时，用作沙箱容器 AI 引擎
  pi-agent-core:   Agent 生命周期管理库，InProcessAgentAdapter 通过 PiAgentCoreAdapter 委托
  沙箱容器:        agentloom/sandbox:latest (archlinux + pi-coding-agent + Fastify HTTP)
                   暴露 POST /v1/session、POST /v1/prompt (SSE)、POST /v1/abort、GET /health
  服务端集成:      InProcessAgentAdapter 委托 PiAgentCoreAdapter 处理 live runtime 操作
                   SandboxAgentAdapter 通过 HTTP POST + SSE 流与容器化 Agent 通信
                   PiConfigGeneratorService 从 Agent 定义生成 pi 配置文件挂载到容器 /config/
                   tool-schema-converter.ts 在 Zod ↔ TypeBox 集成边界做双向转换

Agent 与 Workflow 为两个并行顶层概念:
  Workflow: DAG 编排 → /execution namespace → workflow_executions/execution_steps
  Agent:    独立配置 → /agent-conversation namespace → agent_conversations/agent_messages
  桥接:     WorkflowAgentAdapter 允许 Agent 作为工作流 `agent` 节点执行
  沙箱共享: sandbox_sessions 双 FK (execution_id OR agent_conversation_id, CHECK 至少一个非空)
  Skill 注入: SkillResolverService 生成 <available_skills> XML，在 agent 对话与 workflow 执行启动时注入系统提示
```

**类型共享**: 无共享包。通过约定/手动镜像同步（有漂移风险）。
**大小写转换**: Studio 全局 ky hook 自动 snake_case ↔ camelCase。

## 关键约定

- **NO CI/CD** — 仅开发环境
- **Fastify** 非 Express，**Drizzle** 非 TypeORM，**Zod** 非 class-validator，**Vitest** 非 Jest
- **ESLint**: flat config + typescript-eslint + prettier (singleQuote, trailingComma:all)
- **`no-explicit-any: off`** — 项目允许 any（但应尽量避免）
- **Server 80% 覆盖率阈值**，Studio 无阈值
- **Plugin SDK** 使用 **Zod 3.x**（面向插件生态兼容），通过 **tsup** 输出 ESM+CJS + `.d.ts/.d.cts`，包含 `signing/` 模块提供 RSA-PSS 签名与验证工具函数
- **多租户**: 全局中间件链 TenantMiddleware → TenantTransactionInterceptor → AuthGuard → TenantGuard → RolesGuard
- **vi.hoisted()** 在测试中广泛使用，mock factory 函数模式
- **Testcontainers PostgreSQL** 用于 E2E 测试

## 命令

```bash
# Server
cd agentloom-server
pnpm install && pnpm start:dev    # 开发 (watch mode)
pnpm start:acp:stdio              # ACP stdio 独立入口
pnpm test                          # 单元测试
pnpm test:e2e                     # E2E (需 Docker)
pnpm test:cov                     # 覆盖率 (80% 阈值)
pnpm db:generate                  # 生成 Drizzle 迁移
pnpm db:migrate                   # 执行迁移
pnpm db:seed                      # 种子数据 (5 个预置模板 + 5 个内置 Skill)
pnpm db:studio                    # Drizzle Studio UI
pnpm openapi:export               # 导出 OpenAPI 3.0 spec 到 sdk/openapi.json
pnpm sdk:generate                 # 顺序执行 spec 导出 + TS/Python SDK 生成
pnpm sdk:build:ts                # 校验 TypeScript SDK 类型

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

# Plugin SDK
cd agentloom-plugin-sdk
pnpm install                       # 安装依赖
pnpm build                         # tsup 输出 ESM+CJS + 类型声明
pnpm test                          # Vitest 测试
pnpm typecheck                     # tsc --noEmit

# Plugin CLI
cd agentloom-plugin-cli
pnpm install                       # 安装依赖
pnpm build                         # tsup 构建
pnpm test                          # Vitest 测试

# Plugin Template
cd agentloom-plugin-template
pnpm install                       # 安装依赖
pnpm build                         # tsup 构建
pnpm test                          # Vitest 测试

# Mobile (需 Flutter 3.41.2 via FVM)
cd agentloom_mobile
flutter pub get                    # 安装依赖
flutter analyze                    # 静态分析
flutter test                       # 单元测试
flutter test --coverage            # 覆盖率
dart run build_runner build        # 代码生成 (freezed/json_serializable)

# Docs
cd agentloom-docs
pnpm install && pnpm dev          # 开发 (VitePress)
pnpm build                        # 生产构建
pnpm lint:md                      # Markdown lint

# Sandbox Container
cd agentloom-deploy/sandbox
bash build.sh                      # 构建 agentloom/sandbox:latest 镜像
npm test                           # 容器 HTTP 适配层测试

# Docker Compose 部署（工作目录: agentloom-deploy/）
cd agentloom-deploy
docker compose -f docker-compose.supabase.yml up -d  # 首次：启动 Supabase 栈
docker compose up -d                                  # 启动主应用栈
docker compose build --no-cache studio && docker compose up -d studio   # 仅重建前端
docker compose build --no-cache server && docker compose up -d server worker  # 仅重建后端
docker compose build --no-cache studio server && docker compose up -d  # 重建前后端
docker compose ps -a                                  # 查看服务状态
docker compose logs -f studio                         # 跟踪日志
# 访问: http://localhost:8080 (Studio) | http://localhost:8080/api/v1/ (API)
# 详见 agentloom-deploy/AGENTS.md "开发环境 Docker Compose 操作手册" 章节
```

## 注意事项

- **E2EE**: `TenantKeyModule` 管理 RSA-4096 公钥，`LlmEncryptionService` 执行 hybrid RSA-OAEP + AES-256-GCM 加密。`AgentTaskWorker` 在完成路径加密 LLM 输出，`EvidenceService` 加密 `agent_decision`/`tool_output` 证据。`tenant_encryption_keys` 为 append-only 历史模型（`organization_id + key_fingerprint` 唯一 + 单 active partial unique index）。Studio 私钥以 PKCS8 二进制存入 IndexedDB，解密时导入 non-extractable CryptoKey
- **Smart Routing**: `SmartRoutingModule` 提供 6 种服务端策略纯函数（TOKEN_OPTIMIZED / COST_OPTIMIZED / QUALITY_FIRST / LATENCY_FIRST / HISTORICAL_BEST / FALLBACK_CHAIN）+ `learning/` 子模块（MLP 在线训练 / Elo rating / KNN）。Studio 端 `RoutingStrategy` type 定义 10 种 UI 选项（含 random / round_robin / rules / llm_as_router / knn / mlp / elo / memory_bank / wasm_plugin / fallback_chain）。`FALLBACK_CHAIN` 支持非认证失败时自动切换模型重试。`routing_decisions.selected_model_id` 为 nullable。Studio 端 `smart-routing` 节点 canonical 端口为 `model-in-0` / `model-in-1` / `model-out`，默认策略为 `FALLBACK_CHAIN`
- **PortDataType**: Rust / Studio / Server 统一使用 canonical 10 值 `model|text|json|image|audio|tool|sandbox|knowledge|skill|agent`，Studio `mcpToolMapping` 兼容 legacy `number`/`boolean -> json` 回退
- **SkillModule**: `SkillModule` 提供 Skill CRUD REST API（`/skills`）、`SkillStorageService`（SKILL.md 上传/下载/MinIO 存储 + YAML frontmatter 解析）和 `SkillResolverService`（按 tenant 查询 enabled skills 并生成 `<available_skills>` XML 片段注入 agent 对话系统提示与工作流执行系统提示）。5 个内置 Skill（code-review/documentation/test-generation/refactoring/debugging）由 `pnpm db:seed` 通过 `seedSkills()` upsert 到 `skills` 表（slug-based 幂等），sentinel UUID `00000000-0000-0000-0000-000000000000` 标记系统内置记录，`isBuiltin=true` 不可删除。`skill` 画布节点在 `node-scheduler` 中有 `case 'skill':` 分支，Agent 执行前通过 `SkillResolverService` 注入上游 skill 内容
- **Socket.IO `/execution` 协议**: typed `ExecutionEvent<T>` 信封（含 monotonic eventId），`execution:subscribe`/`execution:unsubscribe` + ACK，事件名 `execution.node.*` + `execution.status.changed`。Gateway 含背压队列（500 cap, 100ms drain），断线重连支持 `lastEventId` 增量回放。`/knowledge` namespace 仍为隐式契约
- **Workflow Session**: 持久化到 `execution_steps.checkpointData.session`；工具权限端点 `/executions/:executionId/steps/:stepId/tool-calls/:toolCallId/resolve`；`awaiting_permission` 是 tool-level 状态且 step 保持 `running`
- **ShareModule**: 管理端 `/workflow-shares` RBAC + 公开只读 `/s/:token`。分享创建要求 `publishedVersionId` 非空，公开读取从 snapshot 返回 `nodes/edges/viewport`，原子递增 `view_count/copy_count`
- **Studio 认证**: `features/auth/` 集成 Supabase Auth（PKCE 流程），`auth.store.ts`（Zustand）管理会话/用户/loading 状态，`useAuth` hook 提供 signIn/signUp/signOut/OAuth 操作，`useAuthToken` hook 保持后向兼容。ky HTTP 客户端注入 `Bearer` token、401 时通过 `supabase.auth.refreshSession()` 刷新重试、刷新失败自动 signOut。路由包含 `/login`、`/register`、`/auth/callback`（OAuth PKCE 回调）、`/settings/security`（密码修改/MFA 管理/会话列表）。`__root.tsx` 包含 auth guard（未认证重定向到 `/login`）。MFA 支持 TOTP 注册（`MfaEnrollDialog`）与验证（`MfaVerifyDialog`）。依赖 `@supabase/supabase-js`，环境变量 `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`
- **执行触发**: VersionToolbar Run → `useStartExecution` → `POST /workflow-definitions/:id/run` → `executionStore.initExecution(id)`。Studio 编辑器内的 Run 固定带 `launchSource='web-studio'`，服务端据此执行当前 `workflow_definitions` 草稿快照；编辑器外 / mobile / API / trigger 仍使用已发布版本快照。WorkflowStatusBar 显示 6 状态 + 进度
- **通知模块**: `NotificationModule` 提供 REST + BullMQ queue + Socket.IO `/notification` namespace。fan-out 创建 `completed` / `failed` / `intervention_required` 通知。支持 `in_app` / `email` / `push` 三通道
- **Trigger 系统**: 支持 `cron` / `webhook` / `api_event` 三种类型。Webhook 签名验证失败记录 `signature_failed` 历史。`api_event` 通过 `POST /api/v1/api-events` 接收外部事件，由 `EventSourceAdapterRegistry` 分发到注册的适配器（`GithubWebhookAdapter` HMAC-SHA256 验签、`GenericEventAdapter` 通用透传），匹配 enabled `api_event` trigger 后 fan-out 触发工作流执行。执行创建在租户事务提交后才入队
- **Intervention Policy**: `intervention_policies` 表驱动介入策略，支持 approve/reject/escalate timeout 动作，`MAX_ESCALATION_ATTEMPTS = 3`
- **工作流输入参数**: `input_schema` JSONB 列存储 `WorkflowInputSchema`，支持 `form|conversation|hybrid` 三种 `collectionMode`。`RunWorkflowDto` 支持 `launchSource`；其中 `launchSource='web-studio'` 时，输入校验与 execution snapshot 都以当前草稿定义为准，而非 published version snapshot
- **工作流版本语义**: `workflow_definitions.version` 仅作为草稿修订号 / OCC 版本，供自动保存与冲突检测使用；用户可见的工作流版本号来自发布快照上的 `workflow_versions.snapshot.metadata.releaseNumber`，只在快照首次发布时分配。列表/详情接口暴露 `publishedReleaseNumber`，未发布保存项应视为“快照”而不是“版本”。
- **OptimizationSuggestionModule**: `optimization_suggestions` 表保存 `model_downgrade|timeout_adjustment|tool_pruning|autonomy_upgrade` 四类建议，带 direct-tenant RLS 与 authenticated DML grant；`OptimizationAnalysisScheduler` 使用固定 scheduler ID 的 BullMQ `upsertJobScheduler()` 注册 `optimization-analysis` 周期任务（`0 2 * * 1`, UTC）；Server 提供 list/apply/dismiss/stats API，并在 apply 复用 `workflow_definitions.version` OCC、在 apply/dismiss 都使用 `pending` 状态 SQL guard；Studio 在 live `llm-agent` `NodeConfigPanel` 下挂载建议面板，以 `autonomyMode` 作为 canonical 自主性字段，并在 dirty canvas / server version refresh 时避免静默覆盖本地编辑
- **ResourceGovernanceModule**: `tenant_quotas` 表提供 7 个 canonical quota 字段（并发执行、日执行量、日 API 调用量、存储预算、分钟级 API rate limit、sandbox CPU%、sandbox 内存）；`execution_governance_controls` 表以 `scope + targetId + status + reason` 保存 tenant/workflow 治理暂停状态。`ExecutionService.runWorkflow()` 在写入 `workflow_executions` 前调用资源治理准入判断；`CustomThrottlerGuard` 会对 JWT 与 API key 请求解析租户并应用 `apiRateLimitPerMinute` 与 `dailyApiCallLimit`。治理阻断统一使用 `ResourceGovernanceDecisionBlockedException`（分钟级 API 限流返回 429 + `Retry-After` / `X-RateLimit-*`，其余治理/配额阻断返回 409），并写正式审计。治理更新、execution start blocked、异常 execution termination 通过 EventEmitter2 驱动通知；Studio 管理入口位于 `/settings/resource-quotas`
- **PrivateDeploymentModule**: `private_deployment_settings` 表保存组织级私有部署 SMTP / LLM proxy / certificates / license 配置，使用 direct-tenant RLS、`organization_id` 唯一索引与 authenticated DML grant。Server 提供 `GET/PUT /organizations/:id/private-deployment`（仅 owner/admin），响应只暴露受管 secret ref，不回显明文，license 使用 `APP_PRIVATE_DEPLOYMENT_LICENSE_PUBLIC_KEY` 做 RSA-PSS 验签；Studio 管理入口位于 `/settings/private-deployment`，页内显式链接 `/settings/resource-quotas`、`/settings/monitoring`、`/settings/audit-logs` 形成组合式企业运维入口；`agentloom-deploy/` 提供私有化 Docker Compose、Helm、环境模板与 PostgreSQL/MinIO 备份恢复脚本
- **AuditLogSystem**: `audit_logs` / `audit_log_archives` 属于 evidence 域，保持 append-only hot/archive 双表 + JSONB `before/after/metadata`；`AuditLogService.record()` 是唯一正式写入口，HTTP opt-in capture 与 execution/intervention listener 共用同一 evidence 写入能力。组织级查询接口为 `GET /audit-logs`、`GET /audit-logs/:id`、`GET /audit-logs/resources/:resourceType/:resourceId/sequence`，运行时权限固定 `owner/admin`（复用 `audit:read` 语义）；retention 通过 `audit-log-retention` 队列上的 `upsertJobScheduler()` 单例任务驱动，worker 在 raw base DB transaction 中执行 copy-then-delete，读侧继续 tenant-aware / RLS，并按 `(createdAt,id)` 做 hot/archive merged recall 与去重。Studio 审计页位于 `/settings/audit-logs`，前端 feature 在 `agentloom-studio/src/features/audit-log/`
- **PluginModule**: `plugins` 表保存租户插件元数据（`org_id + plugin_id` 唯一，含 `manifest`、`node_definitions`、`signature`、`content_hash`、`wasm_bundle_url`、`occ_version` 与 tenant RLS）。`plugin_developer_keys` 表管理开发者 RSA 公钥（`org_id + key_fingerprint` 唯一，active/revoked 状态）。`plugin_usage_records` 表记录每次插件执行的使用量（含 billingAmount、executionDurationMs、inputTokens、outputTokens）。`plugin_earnings` 表记录收益结算周期（含 totalRevenue、developerShare、platformShare、listingCommission，`payoutStatusEnum`: pending/processing/completed/failed）。收益分成模型：总收入 × 0.70 = 开发者毛收入，毛收入 × 0.15 = 上架佣金，开发者净收入 = 毛收入 - 佣金（≈59.5%），平台份额 = 总收入 × 0.30。`/plugins` 提供 `.alp` multipart 注册、列表、详情、状态更新与删除；`/plugins/marketplace` 提供插件上架/列表/详情/更新 CRUD；`/plugins/developer-keys` 提供开发者密钥管理。`PluginExecutionWorker` 执行成功后 fire-and-forget 调用 `PluginUsageService.recordUsage()`。`EarningsSettlementWorker`（`earnings-settlement` 队列）按周期汇总使用量并计算收益分成，含幂等性检查。`PluginSandboxService` 使用 `@extism/extism` 创建隔离 WASM 实例（`runInWorker: true`），平台硬限制固定 `timeoutMs=30000` / `maxMemoryPages=4096`
- **Marketplace**: 公共 browse/search/detail/reviews/install 链路。安装 RBAC `owner/admin/creator/operator`。发布审核基于 `workflowDefinitions.status + publishedVersionId`。`marketplace_listings` 支持 `listingType`（workflow/plugin）和 `pricingModel`（free/per_execution），`workflowVersionId` 为 nullable 以支持插件上架
- **导出/导入**: 导出使用 `agentloom-workflow-v1` 信封 + `sanitizeDefinition()` 递归剥离敏感信息。导入含 Zod 校验 + `cloneDefinitionWithNewIds()`。创建工作流支持 `template_slug` / `share_token` / `marketplace_listing_id` 三种克隆源（互斥）
- **Open API & SDK**: `PlatformApiTokenModule` 管理 API Key（`al_` prefix + SHA-256 hash）。`AuthGuard` 双重认证 JWT → X-Api-Key fallback。`CustomThrottlerGuard` 100 req/min 限流。支持 TS-fetch / Python SDK 生成
- **Agent-Workflow 分离**: Agent 与 Workflow 为两个并行顶层概念。Agent 拥有独立的定义/版本/对话/执行体系，通过 `WorkflowAgentAdapter` 可作为工作流 `agent` 节点执行。Agent 配置画布（`agent-canvas`）为参数编辑器（CPU/memory/timeout/lifecycle），非执行 DAG。`sandbox_sessions` 表使用双 FK（`execution_id` OR `agent_conversation_id`）+ CHECK 约束（至少一个非空）实现沙箱会话在工作流与 Agent 对话间的复用
- **Workflow Sandbox 语义**: workflow runtime 以 `(execution_id, sandboxNodeId)` 作为 sandbox session / persistent binding 粒度；persistent sandbox 通过 `sandbox_sessions.config.activeBindings` 追踪同一 execution 内的多节点引用。一个 sandbox 节点可以同时供多个下游 agent 共享；多个 sandbox 节点也可以引用同一 persistent sandbox 资源，但生命周期按节点独立释放。session 模式在该节点最后一个直接 consumer 完成后销毁，persistent 模式解绑后回到 `ready/idle`
- **SharedResourceRegistry**: `shared-resources` 模块提供通用 `SharedResourceProvider<TConfig, TInstance>` 接口（type/create/destroy/share），sandbox 为首个 provider 实现，支持跨 workflow/agent 的资源共享
- **Socket.IO `/agent-conversation` 协议**: 与 `/execution` namespace 对称，复用 EventBridge 模式实现对话级实时事件推送，支持 JWT + MFA 认证
- **docker-compose.dev.yml 仅 Qdrant**: PostgreSQL/Redis/MinIO 需外部部署或使用 Supabase
- **WASM 产物已提交**: `agentloom-type-engine/pkg/` 包含构建后的 `.wasm` 文件
- **沙箱容器运行时 (pi-coding-agent)**: `agentloom/sandbox:latest` 基于 archlinux 镜像，内嵌 `pi-coding-agent` + Fastify HTTP 适配层。容器暴露 `POST /v1/session`（创建会话）、`POST /v1/prompt`（SSE 流式应答，兼容 JSON-RPC 2.0 envelope 与直接 AgentEvent 两种格式）、`POST /v1/abort`（取消）、`GET /health`（健康检查）。LLM API Key 通过环境变量注入。standalone Agent 对话与 `WorkflowAgentAdapter` 当前默认都走该 sandbox runtime；若 Agent 未显式配置 sandbox，则服务端会合成默认 `SandboxConfig { cpu:1, memory:512, disk:2, timeout:2 }`。`PiConfigGeneratorService` 从 Agent 定义生成 pi 配置文件挂载到容器 `/config/`
- **Sandbox Prompt Timeout**: `SandboxAgentAdapter` 对沙箱容器 `POST /v1/prompt` 的默认 HTTP 超时为 15 分钟，用于覆盖 workflow 多 agent / 共享 sandbox 长链路；ACP terminal 自身的 300s lifetime timeout 不受影响
- **InProcessAgentAdapter (pi-agent-core)**: `InProcessAgentAdapter` 作为持久化包装层，将 live runtime 操作委托给 `PiAgentCoreAdapter`（基于 `pi-agent-core` 的 `Agent` 类），自身维护 workflow checkpoint、conversation durable snapshot、replay ledger。`streamFn` 适配器桥接 Vercel AI SDK `streamText()` 与 pi-agent-core 的 `StreamFn` 接口。工具 schema 通过 `tool-schema-converter.ts` 在 Zod ↔ TypeBox 之间转换
- **ESM 动态导入**: pi-mono 包为纯 ESM，NestJS (CommonJS) 侧通过 `await import()` 动态导入。`pi-imports.ts` 提供统一的惰性导入入口（`importPiAgentCore()`、`importPiAi()`）
- **沙箱工具回调**: `SandboxAgentAdapter` 同时维护两类回调链路。1) Promise gate 工具权限：仅当 `/v1/prompt` 显式提供 `permissionCallbackUrl` 时，容器才会通过 `POST /agent-conversations/:id/tool-permission` 发起权限回调，30s 超时默认拒绝。2) session-local 工具执行：memory/subagent 等工具会在建会话时以 remote tool descriptor 注入容器，并通过 `POST /api/v1/agent-runtime/sessions/:sessionId/tool-executions` + callback token 回调到创建该 session 的同一进程；Compose 私有部署需分别为 `server` / `worker` 设置各自的 `APP_SANDBOX_CALLBACK_BASE_URL`
<!-- TRELLIS:START -->
# Trellis Instructions

These instructions are for AI assistants working in this project.

Use the `/trellis:start` command when starting a new session to:
- Initialize your developer identity
- Understand current project context
- Read relevant guidelines

Use `@/.trellis/` to learn:
- Development workflow (`workflow.md`)
- Project structure guidelines (`spec/`)
- Developer workspace (`workspace/`)

Keep this managed block so 'trellis update' can refresh the instructions.

<!-- TRELLIS:END -->
