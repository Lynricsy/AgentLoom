# 功能模块

Studio 包含 35 个 Feature Slice，按领域划分为 8 大类别。本页详细介绍各功能模块的职责与关键实现。

## 核心画布

### canvas — 画布编辑器

DAG 工作流的可视化编辑器，基于 `@xyflow/react` v12，支持 17 种节点、3 级 LOD、SmartEdge 连线。

详见 [画布编辑器](./canvas)。

### workflow — 工作流管理

工作流的 CRUD、版本管理、发布流程：

- 创建支持 3 种克隆源（`template_slug` / `share_token` / `marketplace_listing_id`，互斥）
- 版本管理基于 `workflow_versions`，发布需设置 `publishedVersionId`
- 若用户在历史记录抽屉打开时进入发布流程，发布完成后会保留该抽屉并立即显示最新发布记录
- 导出使用 `agentloom-workflow-v1` 信封 + `sanitizeDefinition()` 递归剥离敏感信息
- 导入含 Zod 校验 + `cloneDefinitionWithNewIds()` 生成新 ID

### workflow-input-schema — 工作流输入参数

定义工作流的输入 schema，支持 3 种 `collectionMode`：

| 模式           | 说明         |
| -------------- | ------------ |
| `form`         | 表单收集参数 |
| `conversation` | 对话式输入   |
| `hybrid`       | 混合模式     |

`input_schema` 以 JSONB 存储在 `workflow_definitions` 表。

### block-library — 可复用节点块库

管理可复用的节点块（Reusable Block），对应画布中的 `reusable-block` 节点类型。

## Agent 体系

### agent — Agent 管理

Agent 定义的 CRUD 页面，位于 `/agents`：

- **AgentListPage**：Agent 列表，支持搜索与状态筛选
- `agentApi.ts` 封装 Agent 定义与版本 REST API
- `agentKeys.ts` 提供 TanStack Query key factory
- Query hooks：`useAgentList` / `useAgentDetail`
- Mutations：`useCreateAgent` / `useUpdateAgent` / `usePublishAgent`

### agent-canvas — Agent 配置画布

Agent 配置编辑器画布，位于 `/agents/$agentId`，基于 ReactFlow：

- 使用 `AGENT_CANVAS_NODE_REGISTRY` 子集节点（CPU / memory / timeout / lifecycle 等运行时参数）
- **非执行 DAG**，仅用于参数编辑，不执行工作流调度
- `agentCanvasStore`（Zustand）管理画布状态：nodes / edges / viewport / dirty
- 支持自动保存到 `agent_versions`
- sub-agent 节点类型 + `SubAgentConfigPanel`（Agent picker + version dropdown + alias validation + timeout slider）

### agent-conversation — Agent 对话

Agent 独立对话 UI，位于 `/agents/$agentId/conversations/$conversationId`：

- **三列布局**：对话列表 / 消息流 / 上下文面板
- `agentConversationStore`（Zustand）管理消息列表与流式状态
- 通过 Socket.IO `/agent-conversation` namespace 实现实时消息推送与 mid-stream injection
- 输入栏支持图片/文件上传；文本文件优先以内联文本资源进入上下文，图片与二进制文件以附件形式发送
- 用户消息会回显图片预览、文件卡片与文本文件内容预览；sandbox Agent 的附件还会在上下文里附带工作区路径提示
- sub-agent stream rendering（`SubAgentStreamView` 递归嵌套）
- completion notice routing
- 支持多轮对话与文件上下文

### agent-memory — Agent 记忆

Agent 记忆系统管理（35 files），位于 Agent 详情页内：

- **记忆图谱可视化**：d3-force + dagre 布局 + ReactFlow 渲染
- 记忆检索 / 创建 / 编辑
- Socket.IO `/memory` namespace 实时反馈
- 审计日志集成

### memory-instance — 记忆浏览器

记忆实例浏览与管理功能，位于 `/resources/memory-instances/$instanceId/browse`：

- **MemoryBrowser 组件**：浏览、搜索、编辑记忆节点
- browse / domains / glossary API 对接
- 支持记忆节点的结构化展示与操作

### skill — Skill 管理

Skill 定义的管理功能，位于 `/settings/skills`：

- **SkillBrowsePage**：分类 Tabs + 搜索 + 启用状态筛选 + 卡片网格
- `SkillCard`：单个 Skill 卡片展示
- `SkillDetailDialog`：Skill 详情与启停操作
- `CreateSkillDialog`：创建 Skill，内置 Monaco 编辑器懒加载 SKILL.md 内容编辑
- `skill` 画布节点：同时出现在工作流画布与 agent-canvas 中
- `SkillBody` / `SkillPanel` / `SkillConfigPanel`：画布节点的 body 与配置面板组件

## 执行与监控

### execution — 工作流执行

工作流执行的核心 feature：

**触发流程**：

```text
VersionToolbar [Run] → useStartExecution
  → POST /workflow-definitions/:id/run（支持 launchSource 参数）
  → executionStore.initExecution(id)
  → Socket.IO execution:subscribe
```

**状态显示**：WorkflowStatusBar 展示 6 种执行状态 + 进度百分比。

**工具权限**：执行中若 Agent 请求工具权限，step 保持 `running`，工具级别进入 `awaiting_permission`，通过 `/executions/:executionId/steps/:stepId/tool-calls/:toolCallId/resolve` 解决。

### evidence — 执行证据

Agent 决策和工具输出的证据记录，支持 E2EE 加密：

- `agent_decision` — Agent 的推理过程与决策
- `tool_output` — 工具调用的原始输出
- 通过租户 RSA-4096 公钥 + AES-256-GCM 混合加密
- Studio 端使用 IndexedDB 存储的私钥解密展示

### monitoring — 运行监控仪表板

组织级运行监控，仅 `owner` / `admin` 可见：

- 支持 `15m` / `1h` / `24h` 三个时间窗口
- 聚合 execution / governance / notification / audit 数据
- 当前队列 snapshot 摘要
- 入口：`/settings/monitoring`

## AI 与路由

### llm — LLM 模型管理

LLM 模型配置管理，对应画布中的 `llm-model` 节点类型。

### smart-routing — 智能路由

6 种路由策略配置，对应画布中的 `smart-routing` 节点：

| 策略              | 说明                   |
| ----------------- | ---------------------- |
| `TOKEN_OPTIMIZED` | 最小化 token 消耗      |
| `COST_OPTIMIZED`  | 最小化费用             |
| `QUALITY_FIRST`   | 质量优先               |
| `LATENCY_FIRST`   | 延迟优先               |
| `HISTORICAL_BEST` | 基于历史表现           |
| `FALLBACK_CHAIN`  | 故障回退链（默认策略） |

canonical 端口：`model-in-0` / `model-in-1` / `model-out`。

### optimization-suggestion — 优化建议

Agent 配置的自动优化建议：

- 4 种建议类型：`model_downgrade` / `timeout_adjustment` / `tool_pruning` / `autonomy_upgrade`
- 周期分析任务（每周一 UTC 02:00）分析 `agent_execution_records`
- 两个入口：`/settings/monitoring` 的 suggestions tab（`OptimizationSuggestionsBoard`，忽略 + 深链到画布）与 agent 节点配置面板内的 `OptimizationSuggestionsPanel`
- 四类建议当前都不可采纳：写入的字段不参与 workflow `agent` 节点的执行，服务端与前端各用一个空的 `APPLICABLE_SUGGESTION_TYPES` 白名单 fail-closed，服务端返回 409。忽略始终可用
- dirty canvas / server version refresh 时避免静默覆盖本地编辑

### knowledge — 知识库 RAG

知识库管理，对应画布中的 `knowledge-base` 节点。通过 Socket.IO `/knowledge` namespace 接收实时操作反馈。

### mcp — MCP 工具集成

MCP（Model Context Protocol）工具管理，对应画布中的 `mcp-tool` 节点。

::: tip McpImportDialog
`McpImportDialog`（约 1239 行）是 Studio 最复杂的组件之一，负责 MCP 工具的发现与导入配置。
:::

## 触发与介入

### trigger — 触发器

支持 3 种触发类型：

| 类型        | 说明                               |
| ----------- | ---------------------------------- |
| `cron`      | 定时任务                           |
| `webhook`   | Webhook 回调（签名验证）           |
| `api_event` | API 事件（preview-only，仅可查看） |

### intervention-policy — 介入策略

`intervention_policies` 表驱动的人机介入策略：

- 支持 `approve` / `reject` / `escalate` 超时动作
- 最大升级尝试 `MAX_ESCALATION_ATTEMPTS = 3`

### organization-autonomy-policy — 组织自主性策略

组织级别的 Agent 自主性策略管理，控制 Agent 在无人干预下的操作范围。

- 入口：`/settings/security/autonomy-policy`，仅 `owner` 可访问
- 组织 id 不在 auth token claim 里，由 `useCurrentOrganization()`（`GET organizations/current`）解析后再调用组织自治策略 API
- 支持上限查看 / 更新，以及 `downgrade-preview` + `downgrade-confirm` 两段式收紧流程
- 策略卡片展示 `organizationId`、`version`、`updatedAt`、`updatedBy` 元信息
- 共享 `autonomyModePolicy.ts` 提供 `AUTONOMY_MODES`、mode label/description、cap 比较和格式化 helper
- 供 settings 页与优化建议阻断 UI 复用

## 生态与市场

### marketplace — 工作流与插件市场

公共 browse / search / detail / reviews / install 链路：

- 安装 RBAC：`owner` / `admin` / `creator` / `operator`
- 支持 `listingType`：`workflow` / `plugin`
- 支持 `pricingModel`：`free` / `per_execution`
- 发布审核基于 `workflowDefinitions.status + publishedVersionId`

### plugin — 插件管理

第三方插件注册与管理：

- `.alp` multipart 上传 + RSA-PSS canonical archive 验签
- WASM 沙箱执行（Extism，`timeoutMs=30000` / `maxMemoryPages=4096`）
- 开发者密钥管理（active / revoked 状态）

### template — 工作流模板

预置工作流模板浏览与使用，种子数据包含 5 个预置模板。

### share — 工作流分享

管理端 `/workflow-shares` RBAC + 公开只读 `/s/:token`：

- 创建分享要求 `publishedVersionId` 非空
- 公开读取从 snapshot 返回 `nodes/edges/viewport`
- 原子递增 `view_count` / `copy_count`

## 企业管理

### tenant-key — E2EE 租户密钥

RSA-4096 公钥管理。`tenant_encryption_keys` 为 append-only 历史模型（`organization_id + key_fingerprint` 唯一 + 单 active partial unique index）。Studio 私钥以 PKCS8 二进制存入 IndexedDB。

### private-deployment — 私有部署

组织级私有部署配置（仅 `owner` / `admin`）：

- SMTP / LLM proxy / certificates / license 配置
- 响应只暴露受管 secret ref，不回显明文
- License 使用 RSA-PSS 验签
- 页面入口：`/settings/private-deployment`
- 显式链接 `/settings/resource-quotas`、`/settings/monitoring`、`/settings/audit-logs`

### resource-governance — 资源治理

租户资源配额管理（7 个 canonical quota 字段）与执行治理暂停控制：

- 并发执行、日执行量、日 API 调用量、存储预算
- 分钟级 API rate limit、sandbox CPU%、sandbox 内存
- 阻断返回 429（rate limit）或 409（治理/配额）
- 入口：`/settings/resource-quotas`

### audit-log — 审计日志

组织级审计日志查询页，位于 `/settings/audit-logs`：

- append-only hot/archive 双表 + JSONB `before/after/metadata`
- 按 `(createdAt, id)` 做 hot/archive merged recall 与去重
- 仅 `owner` / `admin` 可访问

### notification — 通知管理

全局通知系统，支持 3 种通道：

| 通道     | 说明       |
| -------- | ---------- |
| `in_app` | 应用内通知 |
| `email`  | 邮件通知   |
| `push`   | 推送通知   |

通知类型：`completed` / `failed` / `intervention_required`。

## 开发者

### developer-console — 开发者控制台

API Key 管理入口（`al_` prefix + SHA-256 hash），位于 `/developer-console`。

### auth — 认证与安全

Supabase Auth PKCE 流程集成，依赖 `@supabase/supabase-js`，Supabase client 初始化在 `shared/lib/supabase.ts`。

**状态管理**：`auth.store.ts`（Zustand）管理 `session` / `user` / `loading` / `initialized` 四个状态字段。

**Hooks**：

| Hook | 职责 |
| --- | --- |
| `useAuth` | signIn / signUp / signOut / signInWithOAuth |
| `useAuthToken` | 后向兼容的 token 访问（从 Supabase session 读取 access token） |
| `useMfa` | TOTP 注册 / 验证 / 撤销 |

**HTTP 认证链路**：ky HTTP 客户端注入 `Bearer` token，401 时通过 `supabase.auth.refreshSession()` 自动刷新重试，刷新失败触发自动 signOut。

**OAuth**：支持 Google + GitHub，通过 `OAuthButtons` 组件提供入口。

**MFA**：TOTP 双因素认证，`MfaEnrollDialog`（QR 码注册 + 验证）和 `MfaVerifyDialog`（验证码输入）。

**路由**：

| 路由 | 页面 | 说明 |
| --- | --- | --- |
| `/login` | LoginPage | 邮箱密码登录 + OAuth + 注册链接 |
| `/register` | RegisterPage | 邮箱密码注册 + OAuth + 登录链接 |
| `/auth/callback` | AuthCallbackPage | Supabase OAuth PKCE 回调处理 |
| `/settings/security` | SecuritySettingsPage | 密码修改 / MFA 管理 / 会话列表 |

**Auth Guard**：`__root.tsx` 包含全局 auth guard，未认证用户重定向到 `/login`。

**组件**：`AuthLayout`（居中卡片布局）、`OAuthButtons`、`PasswordInput`（带可见性切换）、`SecuritySettings`。

## 复杂度热点

以下组件为 Studio 中行数最多、逻辑最复杂的模块：

| 组件                    | 约行数 | Feature            |
| ----------------------- | ------ | ------------------ |
| `McpImportDialog`       | 1239   | mcp                |
| `PrivateDeploymentPage` | 1222   | private-deployment |
| `WorkflowCanvas`        | 728    | canvas             |
| `canvasStore`           | 535    | canvas             |

## 相关文档

- [Studio 概述](./) — 技术栈与架构总览
- [画布编辑器](./canvas) — 节点与画布详解
- [状态管理](./state) — 全局状态架构
