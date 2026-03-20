# 功能模块

Studio 包含 26 个 Feature Slice，按领域划分为 7 大类别。本页详细介绍各功能模块的职责与关键实现。

## 核心画布

### canvas — 画布编辑器

DAG 工作流的可视化编辑器，基于 `@xyflow/react` v12，支持 17 种节点、3 级 LOD、SmartEdge 连线。

详见 [画布编辑器](./canvas)。

### workflow — 工作流管理

工作流的 CRUD、版本管理、发布流程：

- 创建支持 3 种克隆源（`template_slug` / `share_token` / `marketplace_listing_id`，互斥）
- 版本管理基于 `workflow_versions`，发布需设置 `publishedVersionId`
- 导出使用 `agentloom-workflow-v1` 信封 + `sanitizeDefinition()` 递归剥离敏感信息
- 导入含 Zod 校验 + `cloneDefinitionWithNewIds()` 生成新 ID

### workflow-input-schema — 工作流输入参数

定义工作流的输入 schema，支持 3 种 `collectionMode`：

| 模式 | 说明 |
|------|------|
| `form` | 表单收集参数 |
| `conversation` | 对话式输入 |
| `hybrid` | 混合模式 |

`input_schema` 以 JSONB 存储在 `workflow_definitions` 表。

### block-library — 可复用节点块库

管理可复用的节点块（Reusable Block），对应画布中的 `reusable-block` 节点类型。

## 执行与监控

### execution — 工作流执行

工作流执行的核心 feature：

**触发流程**：
```
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

| 策略 | 说明 |
|------|------|
| `TOKEN_OPTIMIZED` | 最小化 token 消耗 |
| `COST_OPTIMIZED` | 最小化费用 |
| `QUALITY_FIRST` | 质量优先 |
| `LATENCY_FIRST` | 延迟优先 |
| `HISTORICAL_BEST` | 基于历史表现 |
| `FALLBACK_CHAIN` | 故障回退链（默认策略） |

canonical 端口：`model-in-0` / `model-in-1` / `model-out`。

### optimization-suggestion — 优化建议

Agent 配置的自动优化建议：

- 4 种建议类型：`model_downgrade` / `timeout_adjustment` / `tool_pruning` / `autonomy_upgrade`
- 周期分析任务（每周一 UTC 02:00）分析 `agent_execution_records`
- 建议面板挂载在 live `llm-agent` 的 `NodeConfigPanel` 下
- apply 复用 `workflow_definitions.version` OCC（乐观并发控制）
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

| 类型 | 说明 |
|------|------|
| `cron` | 定时任务 |
| `webhook` | Webhook 回调（签名验证） |
| `api_event` | API 事件（preview-only，仅可查看） |

### intervention-policy — 介入策略

`intervention_policies` 表驱动的人机介入策略：

- 支持 `approve` / `reject` / `escalate` 超时动作
- 最大升级尝试 `MAX_ESCALATION_ATTEMPTS = 3`

### organization-autonomy-policy — 组织自主性策略

组织级别的 Agent 自主性策略管理，控制 Agent 在无人干预下的操作范围。

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

### private-deployment — 私��部署

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

| 通道 | 说明 |
|------|------|
| `in_app` | 应用内通知 |
| `email` | 邮件通知 |
| `push` | 推送通知 |

通知类型：`completed` / `failed` / `intervention_required`。

## 开发者

### developer-console — 开发者控制台

API Key 管理入口（`al_` prefix + SHA-256 hash），位于 `/developer-console`。

### auth — 认证占位

::: warning 占位状态
`auth` 当前仅包含 `useAuthToken` hook，使用 `localStorage('auth_token')` + `useSyncExternalStore`。标记 `TODO(auth)` 待替换为真实认证。Studio **没有** Supabase 客户端。
:::

## 复杂度热点

以下组件为 Studio 中行数最多、逻辑最复杂的模块：

| 组件 | 约行数 | Feature |
|------|--------|---------|
| `McpImportDialog` | 1239 | mcp |
| `PrivateDeploymentPage` | 1222 | private-deployment |
| `WorkflowCanvas` | 728 | canvas |
| `canvasStore` | 535 | canvas |

## 相关文档

- [Studio 概述](./) — 技术栈与架构总览
- [画布编辑器](./canvas) — 节点与画布详解
- [状态管理](./state) — 全局状态架构
