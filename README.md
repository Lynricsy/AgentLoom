# 🕸️ AgentLoom

**多智能体工作流编排平台** — 通过可视化画布将 AI Agent 组合为 DAG 工作流并执行。

AgentLoom 让你像编织织布机上的经纬线一样，将多个 AI Agent 编排为协作工作流。支持拖拽式画布编辑、实时执行监控、端到端加密、插件生态以及跨端体验。

当前仓库的统一品牌源图位于 `Logo/logo-transparent.png`。Studio favicon / 品牌位、Docs favicon / 顶栏 / 首页 Hero，以及 Flutter Web / Android / iOS 图标都基于这张图派生。

---

## ✨ 核心特性

- **🎨 可视化工作流画布** — 基于 React Flow 的拖拽式 DAG 编辑器，支持显式 `text` 常量节点与实时端口类型兼容性检查（Rust WASM）
- **📝 显式提示词节点** — workflow `agent` 与 Agent 画布统一使用 `text -> system-prompt-in` 表达系统提示词；`sub-agent` 节点通过 override/extension 端口表达局部能力差异，沙箱始终继承主 Agent
- **🛡️ 坏快照容错与拦截** — Studio 共享画布壳会对未知 `nodeType` 降级渲染而不是整页崩溃；Agent 后端在保存、发布、分享导入与运行前会拦截未知/缺失 `nodeType`，阻止坏 graph 继续扩散
- **🤖 多模型智能路由** — 6 种路由策略（Token 优化 / 成本优化 / 质量优先 / 延迟优先 / 历史最优 / 容错链），支持自动 Fallback
- **⚡ DAG 调度引擎** — 状态机驱动的工作流执行，BullMQ 分布式任务队列，支持断点续跑与人工介入
- **🧪 编辑器调试运行** — Studio 编辑界面的 Run 使用当前草稿定义做一次性执行验证；编辑器外、移动端、API 与 Trigger 仍基于已发布版本运行
- **🏷️ 发布版号语义** — 工作流草稿修订号与用户可见发布版本号分离：自动保存只推进内部 OCC 修订号，只有快照首次发布时才分配 `vN`
- **🧭 Agent 双运行态** — Agent 创建时显式选择 `sandbox / no_sandbox`；顶层 `no_sandbox` Agent 与 workflow `agent` 节点走 in-process pi-agent-core runtime，仍支持 Skill、知识库、Memory、HTTP MCP 与自进化，而 `sandbox` Agent 继续走容器化 pi-coding-agent runtime；普通运行时工具默认自动执行，仅自进化写操作保留审批
- **💬 Agent 对话体验** — 首轮 assistant 回复后会自动生成对话标题；标题模型解析顺序为“用户标题偏好 → 当前会话所属 Agent 运行模型 → 组织默认 chat 模型”。服务端标题生成会与 runtime 对齐模型协议选择，但会按 `@ai-sdk/*` SDK 语义单独归一 `baseURL`（例如 Anthropic 请求保留 `/v1`）；无论来自 HTTP 还是 worker 背景触发，标题生成都会在租户事务内完成读写。当这些模型都不可用或 LLM 标题生成失败时，系统会回退为首条用户消息摘要，避免会话列表停留在“新对话”。对于 sandbox Agent，新会话在 live sandbox 就绪前会先显示持久化工作区目录预览；右侧“Agent 的电脑”面板会以结构化进程监视器、文件变更与工具详情呈现当前运行上下文，执行开始时默认落在工具页，但用户手动切到其他 tab 后不会再被后续工具事件抢回；`no_sandbox` Agent 的草稿态与正式会话都只保留消息流和输入区，不再额外占用右侧电脑/工作区面板宽度；子代理 drill-in 视图优先显示 live 瀑布，若缺少实时流则回退到历史摘要视图，避免 breadcrumb 已进入但正文仍停留在主 Agent；若同时存在顶层 `workspaceSnapshotId` 与 `sandboxConfig.restoreWorkspaceId`，预览优先绑定后者，避免预览与实际恢复工作区漂移
- **🔗 发现与公开分享** — `/discover` 复用 Marketplace 已上架内容做可浏览发现页；workflow 与 Agent 都支持生成 `/s/:token` 公开分享链接，访问者可预览作者、标题、简介、画布/Agent 元数据，并导入到自己的租户。Generated App 使用 `/generated-apps/public/:token` 作为无需登录的公开 runtime 入口，只暴露终端用户业务界面、数据用途提示、有限 AppSpec、由 AppSpec/静态合约派生的动态业务表单、结构化报告视图与预览链接；生成过程会保存自动开发测试循环、修复轮次、Gate 0-7 运行证据、失败详情和修复建议，后端可同步启动轻量门禁运行器执行 Gate 0 AppSpec、Gate 1 架构计划、Gate 2 静态合约、Gate 3 build/unit workspace runner、Gate 4 integration runner、Gate 5 browser acceptance runner、Gate 6 independent verifier runner 和 Gate 7 publish-candidate contract runner。
  Gate 3 `real-local-command-plan` 只通过 `shell=false` 执行服务端 allowlist Node 脚本并脱敏输出；Gate 4 `real-local-integration` 只执行受控 deterministic public runtime、creator query、Agent/Workflow local trace fixture 与插件 local smoke contract；Gate 5 `real-local-browser-contract` 只执行受控 deterministic 本地 DOM/accessibility/network/console contract，不启动 Playwright 或真实浏览器，不访问真实公开链接，也不捕获真实截图、视频或 trace。Gate 6 按 `GENERATED_APP_GATE6_EXECUTOR_MODE` / `APP_GENERATED_APP_GATE6_EXECUTOR_MODE` 选择 `real`、`fixture` 或 `disabled`；`real-local-independent-verifier` 是受控 deterministic 本地规则 verifier，只读取 redacted evidence bundle、Gate 0-5 evidence refs、rubric 与 coverage matrices，输出 `blockingFindings`、`warnings`、`decision`、`traceabilityCoverage`、`repairSuggestions`、`residualRiskSummary`，不访问外部网络，不调用任意模型，不读取 generation transcript/public share token/API key/secret，也不代表外部模型或人工审查；fixture 只标记 verdict shape 且 `executed=false`，disabled 会失败并停止后续门禁。
  Gate 7 按 `GENERATED_APP_GATE7_EXECUTOR_MODE` / `APP_GENERATED_APP_GATE7_EXECUTOR_MODE` 选择 `real`、`fixture` 或 `disabled`；`real-local-publish-candidate-contract` 是受控 deterministic 本地发布候选合约 runner，只签收 release manifest contract、checksum placeholders、Gate 0-6 evidence citations 与 deferred public-share controls，不执行任意 shell/用户路径，不创建生产发布、真实 artifact archive、真实签名、外部 verifier 结果或 public share token。Gate 3-6 任一为 fixture/disabled/skeleton 时 Gate 7 会阻断；Gate 3-6 均为 real-local 且 Gate 7 real runner 通过后，generation run 可为 `passed`，readiness 成为 `publish_candidate`，但公开 token 仍为 null，只有后续显式启用公开分享才会通过 readiness guard 创建 token。Gate 4/5/6 real-local evidence 只证明对应受控 deterministic 本地 contract/rules runner，不证明生产 sandbox run、Playwright run、外部独立模型审查、真实独立代理审查、真实人工审查或完整端到端需求满足判定；Gate 7 real-local evidence 也不代表生产级 artifact archive/signature/upload 已完成。公开提交通过动态业务表单收集终端用户输入，会先对 token-like/secret/host path/unsupported 结构做脱敏或失败收口，再同步生成 `local-generated-app-deterministic-report` 类型的本地 deterministic result/report 并持久化到创建者租户；该报告在公开页以结构化摘要、下一步问题、补充提示和边界说明呈现，不默认展示内部 JSON dump，也不伪装为真实 AI、Workflow、生产 sandbox 或插件执行；医疗/问诊类内容只生成摘要、下一步问题和非诊断免责声明。创建者可按应用查看提交列表/详情并单条或批量删除。Studio 中 Agent 画布提供独立的保存版本、历史记录、发布工具栏，且未发布 Agent 不暴露分享入口
- **🔌 插件生态系统** — 完整的 SDK + CLI + 市场，`.alp` 插件包 RSA-PSS 签名验证，Extism WASM 沙箱隔离执行
- **🔐 端到端加密 (E2EE)** — RSA-4096 + AES-256-GCM 混合加密，LLM 输出和决策证据全链路加密
- **📱 跨端体验** — Web Studio + Flutter 移动端，Socket.IO 实时推送 + FCM 通知
- **🧬 Agent 自进化** — `agent-main` 可配置 read/write/edit/terminal 与自进化策略；内置 `self-evolution` Skill 通过低层工具在审批边界内修改自身编排、创建资源、编辑外部 Agent/Workflow，并在发布后提示“重启到新版本”以继承消息历史与会话级授权策略。对已有 MCP server 的绑定会读取 `mcp_tool` 资源池并自动补全 canonical `enabledToolIds + tools[]`
- **🧠 知识库 RAG** — 基于 LlamaIndex.TS 的文档解析、知识节点索引、重排与查询编排，支持知识增强的 Agent 推理
- **📖 Skill 管理** — SKILL.md 格式 Agent 行为指导文件，支持多文件 Skill 注入到 sandbox / no_sandbox Agent 运行时；`SkillResolverService` 将 `<available_skills>` XML 注入 Agent 对话与工作流执行系统提示，Monaco 编辑器 Web 编辑，6 个内置 Skill（含 `self-evolution`）
- **🏢 多租户架构** — AsyncLocalStorage 租户事务隔离，RBAC 五级权限（Owner → Viewer）
- **📊 证据溯源链** — SHA-256 完整性校验，LLM 决策全程留痕可审计
- **🧾 审计日志与保留归档** — evidence 域统一采集管理/执行关键事件，提供 owner/admin 审计查询页、资源级事件序列与 hot/archive 回查
- **🛡️ 资源治理与异常执行处置** — `tenant_quotas` + `execution_governance_controls` typed store、`runWorkflow()` 准入阻断、tenant-aware API 分钟限流 / 日配额、治理通知与异常 execution 终止 contract
- **🛠️ 配置优化建议闭环** — 周期分析执行遥测，生成可解释的模型/超时/工具/自主性建议，应用时复用 workflow OCC 保护，并在画布存在未保存修改时避免静默覆盖本地编辑
- **🌐 MCP 集成** — Model Context Protocol 工具编排；`sandbox` Agent 可使用完整 MCP 形态，`no_sandbox` Agent 仅允许 HTTP MCP，stdio MCP 在发布校验与运行时调用两侧都会被拒绝。Agent 画布 `mcp-tool` 节点会按 Studio 的 `enabledToolIds + tools[]` 结构编译，direct Agent runtime 与 workflow runtime 保持一致
- **🛒 工作流市场** — 模板浏览、安装、发布，支持工作流与插件双类型上架；Marketplace 审核同时接受内联 Agent 配置与 workflow-agent 绑定已发布 Agent Definition/Version 的复杂工作流
- **🧵 子代理历史瀑布** — standalone Agent 的 child 输出会跟随父 assistant message 持久化到 `metadata.subAgentStreams`；Studio drill-in 会优先用这份 durable stream 恢复与主 Agent 一致的文本/思考/工具瀑布，只有旧历史缺少该字段时才回退摘要视图

---

## 🏗️ 项目架构

```
AgentLoom/
├── agentloom-server/            # 🖥️  后端服务 (NestJS 11 + Fastify 5)
├── agentloom-studio/            # 🎨  前端应用 (React 19 + Vite 7)
├── agentloom-deploy/            # 🏢  私有化部署资产 (Docker Compose + Helm + 运维脚本)
├── agentloom-type-engine/       # ⚙️  类型引擎 (Rust → WASM)
├── agentloom-plugin-sdk/        # 📦  插件开发 SDK (TypeScript)
├── agentloom-plugin-cli/        # 🔧  插件脚手架 CLI
├── agentloom-plugin-template/   # 📝  插件示例模板
├── agentloom_mobile/            # 📱  移动端应用 (Flutter)
└── docker-compose.dev.yml       # 🐳  开发环境 (Qdrant)
```

> **非标准 Monorepo**：各包独立管理依赖和 lockfile，无 `pnpm-workspace.yaml`。

### 系统交互图

```
┌─────────────────┐    HTTP/REST     ┌──────────────────────────────────┐
│  agentloom-     │──── /api/v1 ────▶│       agentloom-server           │
│  studio (Web)   │                  │  ┌──────────┐  ┌──────────────┐  │
│                 │◀── Socket.IO ───│  │ Execution│  │   BullMQ     │  │
│  React 19       │  /execution      │  │  Engine  │  │   Workers    │  │
│  + WASM Engine  │  /notification   │  └──────────┘  └──────────────┘  │
└─────────────────┘  /knowledge      │  ┌──────────┐  ┌──────────────┐  │
                                     │  │  Plugin  │  │  Smart       │  │
┌─────────────────┐    HTTP/REST     │  │  Sandbox │  │  Routing     │  │
│  agentloom_     │──── /api/v1 ────▶│  │ (Extism) │  │  (6策略)     │  │
│  mobile         │                  │  └──────────┘  └──────────────┘  │
│  (Flutter)      │◀── Socket.IO ───│                                  │
│                 │  + FCM Push      └────────┬──────────┬──────┬───────┘
└─────────────────┘                           │          │      │
                                              ▼          ▼      ▼
                                         PostgreSQL   Redis   Qdrant
                                         (Supabase)  (BullMQ) (向量)
                                              │
                                              ▼
                                            MinIO
                                          (对象存储)

┌──────────────────────────────────────────────────────────────────────┐
│  Docker: agentloom/sandbox:latest                                    │
│  (archlinux + pi-coding-agent + Fastify HTTP)                        │
│  POST /v1/session · POST /v1/prompt (SSE) · POST /v1/abort          │
│  ◀── HTTP + SSE ── server (SandboxAgentAdapter)                      │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 📦 各包详情

### agentloom-server — 后端服务

| 项目         | 技术                                                                |
| ------------ | ------------------------------------------------------------------- |
| 框架         | NestJS 11 + Fastify 5                                               |
| ORM          | Drizzle ORM + PostgreSQL (Supabase)                                 |
| 队列         | BullMQ + Redis                                                      |
| 向量库       | Qdrant                                                              |
| 对象存储     | MinIO                                                               |
| AI SDK       | Vercel AI SDK (@ai-sdk/openai, anthropic, google)                   |
| Agent 运行时 | pi-agent-core (Agent 生命周期) + pi-coding-agent (沙箱容器 AI 引擎) |
| 实时通信     | Socket.IO (Redis Adapter)                                           |
| 推送通知     | Firebase Cloud Messaging                                            |
| 测试         | Vitest + SWC (80% 覆盖率阈值)                                       |

<details>
<summary>📋 核心模块一览（15+ 模块）</summary>

| 模块                      | 职责                                                                                                                                                                          |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `auth`                    | JWT 认证 + API Key 双重认证                                                                                                                                                   |
| `organization`            | 组织管理与多租户                                                                                                                                                              |
| `workflow-definition`     | 工作流定义 CRUD + 版本管理                                                                                                                                                    |
| `execution`               | DAG 调度引擎 + 状态机 + 人工介入                                                                                                                                              |
| `resource-governance`     | 租户资源配额、治理暂停、异常 execution 终止、治理通知/审计                                                                                                                    |
| `agent`                   | AI Agent 六边形架构 (Ports/Adapters)                                                                                                                                          |
| `self-evolution`          | Agent 自进化低层工具、分类审批记忆、已发布版本重启继承历史                                                                                                                    |
| `llm`                     | 多模型集成 + Provider 管理                                                                                                                                                    |
| `smart-routing`           | 6 种智能路由策略                                                                                                                                                              |
| `knowledge`               | LlamaIndex-first 知识库（知识节点索引 → 检索 → 重排 → 查询编排）                                                                                                              |
| `mcp`                     | Model Context Protocol 工具管理                                                                                                                                               |
| `sandbox`                 | 隔离执行环境（session stop+remove；persistent stop/timeout 仅 stop 容器，delete 才 remove；direct Agent conversation 可按 `conversationIdleAutoEndMinutes` 在空闲后自动 end） |
| `plugin`                  | `.alp` 上传 + WASM 沙箱 + 使用量/收益                                                                                                                                         |
| `private-deployment`      | 组织级私有部署设置 API、受管 secret 引用、许可证校验                                                                                                                          |
| `optimization-suggestion` | 基于执行记录的 Agent 配置优化建议、采纳率统计与工作流节点配置更新（含 workflow OCC 与 dirty-canvas 防覆盖保护）                                                               |
| `trigger`                 | Cron / Webhook / API Event 触发器                                                                                                                                             |
| `notification`            | REST + BullMQ + Socket.IO + FCM                                                                                                                                               |
| `evidence`                | 证据记录 + SHA-256 完整性 + 溯源链 + 审计日志查询/归档基线                                                                                                                    |
| `marketplace`             | 工作流/插件市场 CRUD                                                                                                                                                          |
| `share`                   | Workflow / Agent 分享短链与公开导入                                                                                                                                           |
| `resource-source`         | 分享导入资源来源记录与转为自己创建                                                                                                                                            |
| `template`                | 预置工作流模板                                                                                                                                                                |
| `tenant-key`              | E2EE 公钥管理（RSA-4096）                                                                                                                                                     |
| `platform-api-token`      | 外部 API Token 管理 (`al_` 前缀)                                                                                                                                              |

</details>

<details>
<summary>🔐 认证与多租户链路</summary>

```
请求 → TenantMiddleware → TenantTransactionInterceptor → CustomThrottlerGuard (tenant-aware `apiRateLimitPerMinute` / `dailyApiCallLimit`)
     → AuthGuard (JWT → X-Api-Key fallback) → TenantGuard → RolesGuard
                                                               │
                                               owner > admin > creator > operator > viewer
```

- **租户隔离**: AsyncLocalStorage + Drizzle 事务级隔离
- **双重认证**: Supabase JWT 或 `X-Api-Key`（SHA-256 哈希存储）
- **API 治理**: 分钟级 `apiRateLimitPerMinute` 继续返回 429 + `Retry-After` / `X-RateLimit-*`，`dailyApiCallLimit` 与其它治理阻断返回 409 结构化 problem details

</details>

<details>
<summary>📡 BullMQ 队列列表</summary>

| 队列                  | 用途             |
| --------------------- | ---------------- |
| `execution-queue`     | 工作流执行调度   |
| `agent-task-queue`    | Agent 任务处理   |
| `plugin-execution`    | 插件 WASM 执行   |
| `trigger-scheduler`   | 触发器调度       |
| `notification`        | 通知推送         |
| `sandbox-lifecycle`   | 沙箱生命周期管理 |
| `document-processing` | 文档解析处理     |
| `document-indexing`   | 文档向量索引     |
| `earnings-settlement` | 插件收益结算     |

</details>

<details>
<summary>📡 Socket.IO 命名空间</summary>

| 命名空间        | 协议特性                                                                                                   |
| --------------- | ---------------------------------------------------------------------------------------------------------- |
| `/execution`    | 类型化 `ExecutionEvent<T>` 信封、单调递增 eventId、`lastEventId` 断线回放、背压队列 (500 cap, 100ms drain) |
| `/notification` | 未读计数 + 实时新通知推送                                                                                  |
| `/knowledge`    | 知识库处理状态                                                                                             |

</details>

---

### agentloom-studio — 前端应用

| 项目   | 技术                                  |
| ------ | ------------------------------------- |
| 框架   | React 19 + TypeScript 5.9             |
| 构建   | Vite 7                                |
| 样式   | Tailwind CSS v4 + Radix UI + CVA      |
| 路由   | TanStack Router v1                    |
| 数据   | TanStack Query + Zustand (immer)      |
| 画布   | @xyflow/react v12                     |
| HTTP   | ky (自动 snake_case ↔ camelCase 转换) |
| 编辑器 | Monaco Editor                         |
| 图表   | Recharts                              |

**架构**: Feature-Slice Design — 按功能切片组织代码，每个 Feature 包含独立的 API、Store、Components 和 Hooks。

<details>
<summary>🗺️ 路由表</summary>

| 路由                            | 页面                                                                       |
| ------------------------------- | -------------------------------------------------------------------------- |
| `/workflows/$workflowId`        | 工作流画布编辑器                                                           |
| `/executions/$executionId`      | 执行调试视图（实时时间线）                                                 |
| `/discover`                     | 发现页（复用 Marketplace 上架内容）                                        |
| `/templates`                    | 工作流模板库                                                               |
| `/marketplace`                  | 工作流/插件市场                                                            |
| `/s/$token`                     | Workflow / Agent 公开分享预览与导入                                        |
| `/generated-apps/public/$token` | Generated App 公开 runtime 动态业务表单与结构化报告入口                    |
| `/resources/knowledge-bases`    | 知识库管理                                                                 |
| `/settings/tool-library`        | MCP 工具库                                                                 |
| `/settings/skills`              | Skill 管理（分类/搜索/启停/SKILL.md 编辑）                                 |
| `/settings/private-deployment`  | 私有部署配置页（owner/admin），与治理 / 监控 / 审计入口形成企业运维面板    |
| `/settings/audit-logs`          | 审计日志查询页                                                             |
| `/settings/resource-quotas`     | 资源治理管理页（quota / tenant-workflow governance / 异常 execution 终止） |
| `/settings/monitoring`          | 组织级运行监控页（只读执行趋势 + 当前队列快照摘要 / alerts / hotspots）    |
| `/developer-console/earnings`   | 开发者收益面板                                                             |

</details>

<details>
<summary>🎨 画布节点类型（含显式 text 常量节点）</summary>

`llm-model` · `smart-routing` · `agent` · `skill` · `http-tool` · `code-tool` · `mcp-tool` · `sandbox` · `input-preprocessor` · `workspace` · `manual-trigger` · `schedule-trigger` · `webhook-trigger` · `api-event-trigger` · `knowledge-base` · `memory` · `text` · `text-output` · `json-output` · `condition` · `loop`

</details>

**设计**: 仅暗色模式 (Dark Mode Only)，Tailwind v4 Design Token 体系。

---

### agentloom-type-engine — 端口类型引擎

```rust
// Rust → WebAssembly，浏览器端运行
// 用于画布上判断两个节点端口是否可以连接
```

**8 种端口数据类型** (canonical):

`model` · `text` · `json` · `image` · `audio` · `tool` · `sandbox` · `knowledge`

**4 级兼容性结果**:

| 等级           | 含义               | 示例                   |
| -------------- | ------------------ | ---------------------- |
| `EXACT`        | 完全匹配           | text → text            |
| `TRANSFORM`    | 可自动转换         | text ↔ json            |
| `PARTIAL`      | 部分兼容（需映射） | 结构相似的 JSON Schema |
| `INCOMPATIBLE` | 不兼容             | image → model          |

**WASM 导出** (3 个函数):

- `checkCompatibility(source, target)` → 端口兼容性检查
- `checkSchemaCompatibility(source, target)` → Schema 级兼容性
- `validateSchema(input)` → Schema 合法性验证

> WASM 产物已提交至 `pkg/`，Studio 通过 Web Worker 加载。

---

### agentloom-plugin-sdk — 插件开发 SDK

```
@agentloom/plugin-sdk
```

为插件生态提供类型定义、校验 Schema、辅助函数和加密签名工具。

| 模块         | 内容                                                                                       |
| ------------ | ------------------------------------------------------------------------------------------ |
| `types`      | `PluginManifest`, `AgentLoomPlugin`, `CustomNodeDefinition`, `NodeExecutionContext/Result` |
| `validation` | Zod 3 Schema 校验（reverse-domain ID + semver 版本号）                                     |
| `helpers`    | `defineInputPort()`, `defineOutputPort()`, `defineNode()`, 类型守卫                        |
| `signing`    | RSA-PSS 签名/验签, SHA-256 内容哈希, 密钥指纹计算, canonical archive payload               |

**输出格式**: tsup → ESM (`index.js`) + CJS (`index.cjs`) + 类型声明 (`.d.ts` / `.d.cts`)

> ⚠️ SDK 使用 **Zod 3.x**（非 Zod 4），确保插件生态的广泛兼容性。

---

### agentloom-plugin-cli — 插件脚手架 CLI

```bash
npx @agentloom/plugin-cli <command>
# 或全局安装后
agentloom-plugin <command>
```

**完整的插件开发生命周期**:

```
create → dev → build → keys generate → publish
  │       │      │          │              │
  ▼       ▼      ▼          ▼              ▼
 脚手架  本地调试  打包.alp  生成RSA密钥对  签名发布
```

| 命令                      | 说明                                                                   |
| ------------------------- | ---------------------------------------------------------------------- |
| `create <name>`           | 交互式创建插件项目（manifest + package.json + tsconfig + 源码 + 测试） |
| `dev [-p port]`           | 本地开发服务器（默认 :4400），chokidar 文件监听热重载                  |
| `build [-o dir] [--wasm]` | TypeScript 编译或 WASM 构建，打包为 `.alp` 归档                        |
| `keys generate [-b bits]` | 生成 RSA 密钥对（2048/3072/4096 位），输出指纹                         |
| `publish [-k keyPath]`    | RSA-PSS 签名 → 注入 manifest → 自验证 → 覆写归档                       |

---

### agentloom-plugin-template — 示例插件

`com.agentloom.text-to-uppercase` — 一个完整的参考实现：

```typescript
// 定义节点：1 个 text 输入端口 → 1 个 text 输出端口
const textToUppercaseNode: CustomNodeDefinition = {
  type: "text-to-uppercase",
  category: "transform",
  inputPorts: [defineInputPort({ id: "text-in", dataType: "text" })],
  outputPorts: [defineOutputPort({ id: "text-out", dataType: "text" })],
  configSchema: { prefix: { type: "string" }, suffix: { type: "string" } },
  execute: async (context) => {
    const input = context.inputs["text-in"];
    const result = `${config.prefix}${input.toUpperCase()}${config.suffix}`;
    return { outputs: { "text-out": result } };
  },
};
```

---

### agentloom_mobile — 移动端应用

| 项目     | 技术                                                   |
| -------- | ------------------------------------------------------ |
| 框架     | Flutter 3.41.2 (FVM)                                   |
| 状态管理 | Riverpod 3.x (手写 Provider)                           |
| 路由     | GoRouter 17.x                                          |
| HTTP     | Dio + AuthInterceptor (401 自动刷新重试)               |
| 模型     | Freezed 3.x + json_serializable                        |
| 推送     | Firebase Cloud Messaging + flutter_local_notifications |
| 测试     | 429 tests (mocktail)                                   |

**功能模块**:

| 模块            | 功能                                  |
| --------------- | ------------------------------------- |
| `auth`          | 登录/登出/Token 刷新/强制登出         |
| `dashboard`     | 快速访问 + 最近执行记录               |
| `workflows`     | 列表搜索/详情/参数化启动              |
| `execution`     | Socket.IO 实时监控 + REST 5s 轮询降级 |
| `notifications` | FCM 推送 + 本地通知 + 深链跳转        |

---

## 🚀 快速开始

### 前置要求

| 依赖             | 版本   | 用途                                      |
| ---------------- | ------ | ----------------------------------------- |
| Node.js          | ≥ 18   | Server / Studio                           |
| pnpm             | ≥ 9    | 包管理器                                  |
| Rust + wasm-pack | latest | Type Engine 构建（可选，已含预构建 WASM） |
| Flutter (FVM)    | 3.41.2 | 移动端开发                                |
| Docker           | latest | Qdrant 向量数据库                         |
| PostgreSQL       | 15+    | 主数据库（或使用 Supabase）               |
| Redis            | 7+     | BullMQ 任务队列                           |

### 1. 启动基础设施

```bash
# 启动 Qdrant 向量数据库
docker compose -f docker-compose.dev.yml up -d
```

> PostgreSQL 和 Redis 需外部部署，或使用 Supabase 托管 PostgreSQL。

### 2. 启动后端

```bash
cd agentloom-server
cp .env.example .env          # 配置环境变量
pnpm install
pnpm db:generate              # 生成 Drizzle 迁移
pnpm db:migrate               # 执行迁移
pnpm db:seed                  # 导入预置模板（可选）
pnpm start:dev                # 启动开发服务器 (watch mode)
```

API 文档: `http://localhost:<APP_PORT>/docs` (Swagger UI)

### 3. 构建沙箱容器镜像（可选）

```bash
# 构建沙箱容器镜像 (sandbox/build.sh)
cd agentloom-deploy/sandbox
bash build.sh                 # 构建 agentloom/sandbox:latest
```

> 沙箱容器内嵌 pi-coding-agent 运行时，用于 Agent 隔离执行。不使用沙箱功能可跳过。

### 4. 启动前端

```bash
cd agentloom-studio
cp .env.example .env          # 配置 API 地址
pnpm install
pnpm dev                      # 启动 Vite 开发服务器
```

### 5. 移动端（可选）

```bash
cd agentloom_mobile
cp .env.dev.example .env.dev  # 配置环境变量
fvm flutter pub get           # 安装依赖（需 FVM）
dart run build_runner build   # 生成 Freezed 模型代码
fvm flutter run               # 启动应用
```

---

### 私有化部署 Bundle

- `agentloom-deploy/` 提供单机 Docker Compose、Kubernetes / Helm、环境模板、Nginx、数据库初始化、PostgreSQL/MinIO 备份恢复脚本。
- 私有化部署与运维手册见 `agentloom-deploy/README.md`；其中定义了 `APP_DEPLOYMENT_MODE=private`、`APP_SUPABASE_*` 在 private 模式下“全省略或全提供”的契约，以及 `values.private.yaml` 的 Helm 示例。

---

## 🔧 开发命令

### Server

```bash
pnpm start:dev                # 开发模式 (watch)
pnpm test                     # 单元测试
pnpm test:e2e                 # E2E 测试 (需 Docker / Testcontainers)
pnpm test:cov                 # 覆盖率报告 (80% 阈值)
pnpm db:generate              # 生成 Drizzle 迁移文件
pnpm db:migrate               # 执行数据库迁移
pnpm db:seed                  # 导入种子数据
pnpm db:studio                # 启动 Drizzle Studio UI
pnpm openapi:export           # 导出 OpenAPI 3.0 Spec
pnpm sdk:generate             # 生成 TypeScript + Python SDK
```

### Studio

```bash
pnpm dev                      # Vite 开发服务器
pnpm build                    # 生产构建
pnpm test                     # 单元测试
pnpm typecheck                # TypeScript 类型检查
```

### Type Engine

```bash
cargo test                    # 运行测试
cargo bench                   # 基准测试 (Criterion)
wasm-pack build --target bundler --release  # 构建 WASM
```

### Plugin SDK / CLI / Template

```bash
# SDK
cd agentloom-plugin-sdk && pnpm build && pnpm test

# CLI
cd agentloom-plugin-cli && pnpm build && pnpm test

# Template
cd agentloom-plugin-template && pnpm build && pnpm test
```

### Sandbox Container

```bash
cd agentloom-deploy/sandbox
bash build.sh                 # 构建 agentloom/sandbox:latest 镜像
npm test                      # 容器 HTTP 适配层测试
```

### Mobile

```bash
fvm flutter analyze           # 静态分析
fvm flutter test              # 单元测试 (429 tests)
fvm flutter test --coverage   # 覆盖率报告
dart run build_runner build   # Freezed 代码生成
```

---

## ⚙️ 环境变量

### Server (`agentloom-server/.env`)

| 变量                                        | 说明                                          |
| ------------------------------------------- | --------------------------------------------- |
| `APP_PORT`                                  | 服务端口                                      |
| `APP_DATABASE_URL`                          | PostgreSQL 连接字符串                         |
| `APP_DEPLOYMENT_MODE`                       | 部署模式：`saas` 或 `private`                 |
| `APP_SUPABASE_URL`                          | Supabase 项目 URL                             |
| `APP_SUPABASE_ANON_KEY`                     | Supabase 匿名 Key                             |
| `APP_SUPABASE_SERVICE_KEY`                  | Supabase Service Key                          |
| `APP_JWT_SECRET`                            | JWT 签名密钥                                  |
| `APP_REDIS_URL`                             | Redis 连接地址                                |
| `APP_MASTER_ENCRYPTION_KEY`                 | 主加密密钥 (E2EE)                             |
| `APP_MINIO_ENDPOINT`                        | MinIO 端点                                    |
| `APP_MINIO_ACCESS_KEY`                      | MinIO 访问密钥                                |
| `APP_MINIO_SECRET_KEY`                      | MinIO 密钥                                    |
| `APP_QDRANT_URL`                            | Qdrant 向量库地址                             |
| `APP_PRIVATE_DEPLOYMENT_LICENSE_PUBLIC_KEY` | 私有部署 License 验签公钥（private 模式可选） |
| `FIREBASE_SERVICE_ACCOUNT`                  | Firebase 服务账号 JSON                        |

### Studio (`agentloom-studio/.env`)

| 变量                        | 说明                  |
| --------------------------- | --------------------- |
| `VITE_API_BASE_URL`         | 后端 API 地址         |
| `VITE_AUTOSAVE_DEBOUNCE_MS` | 自动保存防抖时间 (ms) |

### Mobile

通过 `flutter_dotenv` 加载 `.env.dev` / `.env.staging` / `.env.prod`。

---

## 🔌 插件开发指南

### 快速创建插件

```bash
# 1. 创建插件项目
npx @agentloom/plugin-cli create my-plugin

# 2. 开发调试
cd my-plugin
pnpm dev  # 启动本地开发服务器 (http://localhost:4400)

# 3. 构建打包
pnpm build  # 生成 .alp 归档

# 4. 签名发布
agentloom-plugin keys generate     # 生成 RSA 密钥对
agentloom-plugin publish -k private.pem  # 签名 .alp 包
```

### 插件安全模型

```
.alp 上传 → RSA-PSS 签名验证 → MinIO 存储 → Extism WASM 沙箱执行
                                                │
                                    ┌───────────┼───────────┐
                                    │  30s 超时  │  4096 页   │
                                    │  限制      │  内存限制   │
                                    └───────────┴───────────┘
```

### 收益分成

| 份额         | 比例   | 说明          |
| ------------ | ------ | ------------- |
| 开发者毛收入 | 70%    | 总收入 × 0.70 |
| 上架佣金     | 10.5%  | 毛收入 × 0.15 |
| 开发者净收入 | ≈59.5% | 毛收入 - 佣金 |
| 平台份额     | 30%    | 总收入 × 0.30 |

---

## 🧪 测试

| 包          | 框架                          | 覆盖率要求 | 命令            |
| ----------- | ----------------------------- | ---------- | --------------- |
| Server      | Vitest + SWC + Testcontainers | **80%**    | `pnpm test:cov` |
| Studio      | Vitest                        | 无阈值     | `pnpm test`     |
| Type Engine | Rust 内置 + Criterion         | —          | `cargo test`    |
| Plugin SDK  | Vitest                        | —          | `pnpm test`     |
| Plugin CLI  | Vitest                        | —          | `pnpm test`     |
| Mobile      | Flutter Test + mocktail       | —          | `flutter test`  |

---

## 🏛️ 技术选型

| 领域      | 选择                                      | 备注                           |
| --------- | ----------------------------------------- | ------------------------------ |
| HTTP 框架 | **Fastify**                               | 非 Express                     |
| ORM       | **Drizzle**                               | 非 TypeORM                     |
| 校验      | **Zod**                                   | Server Zod 4, SDK Zod 3        |
| 测试      | **Vitest**                                | 非 Jest                        |
| CSS       | **Tailwind v4**                           | Design Token 体系              |
| 状态管理  | **Zustand** (Web) / **Riverpod** (Mobile) | immer middleware               |
| Lint      | **ESLint flat config**                    | + typescript-eslint + prettier |
| 代码风格  | singleQuote, trailingComma: all           | prettier 配置                  |

---

## 📜 许可证

Private — UNLICENSED

---

<p align="center">
  <sub>Built with ❤️ by AgentLoom Team</sub>
</p>
