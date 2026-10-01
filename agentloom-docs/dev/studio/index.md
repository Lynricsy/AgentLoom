# Studio 概述

AgentLoom Studio 是平台的可视化前端，用户通过它构建、调试、运行多智能体 DAG 工作流。

## 技术栈

| 技术                     | 版本 | 用途                             |
| ------------------------ | ---- | -------------------------------- |
| React                    | 19   | UI 框架                          |
| Vite                     | 7    | 构建工具                         |
| TanStack Router          | —    | 文件路由                         |
| Zustand                  | —    | 全局状态管理（immer + devtools） |
| TanStack Query           | —    | 服务端缓存                       |
| @xyflow/react            | v12  | 画布引擎                         |
| Tailwind CSS             | v4   | 样式（dark-only 主题）           |
| Radix UI + CVA           | —    | 无障碍组件 + 变体                |
| ky                       | —    | HTTP 客户端                      |
| Socket.IO Client         | —    | 实时通信                         |
| react-hook-form + Zod v4 | —    | 表单验证                         |
| Monaco Editor            | —    | 代码编辑（lazy load）            |

## 应用入口

```text
index.html → main.tsx → AppProviders → TanStack Router → 路由页面
```

`AppProviders` 注入 QueryClient、Router、Toast 等全局依赖。

## Feature-Slice 架构

Studio 采用 [Feature-Slice Design](https://feature-sliced.design/) 组织代码，每个 feature 是一个自包含的功能切片：

```text
src/
├── app/              # 应用入口、Provider、路由定义
│   └── routes/       # TanStack Router 路由文件
├── features/         # 功能切片（35 个 feature）
│   ├── canvas/       # 画布编辑器
│   ├── execution/    # 执行引擎
│   ├── workflow/     # 工作流管理
│   └── ...
└── shared/           # 跨 feature 共享
    ├── ui/           # 基础 UI 组件
    ├── hooks/        # 通用 Hooks
    ├── lib/          # 工具库
    └── types/        # 全局类型
```

### 35 个功能切片

Studio 包含 35 个 feature 目录，按领域分为 7 大类别：

| 类别           | Feature                        | 说明                            |
| -------------- | ------------------------------ | ------------------------------- |
| **核心画布**   | `canvas`                       | DAG 画布编辑器，支持 23 种节点  |
|                | `workflow`                     | 工作流 CRUD、版本管理、发布     |
|                | `workflow-input-schema`        | 工作流输入参数 schema 定义      |
|                | `block-library`                | 可复用节点块库                  |
| **执行与监控** | `execution`                    | 工作流执行、实时状态追踪        |
|                | `evidence`                     | 执行证据（决策 + 工具输出）     |
|                | `monitoring`                   | 组织级运行监控仪表板            |
| **AI 与路由**  | `llm`                          | LLM 模型管理                    |
|                | `smart-routing`                | 智能路由策略配置                |
|                | `optimization-suggestion`      | Agent 配置优化建议              |
|                | `knowledge`                    | 知识库 RAG 管理                 |
|                | `mcp`                          | MCP 工具集成                    |
|                | `skill`                        | Skill 管理                      |
| **Agent**      | `agent`                        | Agent 列表/创建/设置            |
|                | `agent-canvas`                 | Agent 配置编辑器画布            |
|                | `agent-conversation`           | Agent 三列对话 UI               |
|                | `agent-memory`                 | Agent 记忆图谱可视化            |
|                | `memory-instance`              | 记忆浏览器                      |
| **触发与介入** | `trigger`                      | Cron / Webhook / API 事件触发器 |
|                | `intervention-policy`          | 人机介入策略配置                |
|                | `organization-autonomy-policy` | 组织级自主性策略                |
| **生态与市场** | `marketplace`                  | 工作流与插件市场                |
|                | `plugin`                       | 插件管理                        |
|                | `template`                     | 工作流模板                      |
|                | `share`                        | 工作流分享链接                  |
| **企业管理**   | `tenant-key`                   | E2EE 租户密钥管理               |
|                | `private-deployment`           | 私有部署设置                    |
|                | `resource-governance`          | 资源配额与治理                  |
|                | `audit-log`                    | 审计日志查询                    |
|                | `notification`                 | 通知管理                        |
|                | `sandbox`                      | 沙箱管理                        |
|                | `workspace`                    | 工作区管理                      |
| **开发者**     | `developer-console`            | 开发者控制台                    |
|                | `auth`                         | Supabase Auth PKCE 认证         |
|                | `onboarding`                   | 新手引导                        |

::: tip 关于 auth
`auth` feature 集成 Supabase Auth（PKCE 流程），`auth.store.ts`（Zustand）管理会话/用户/loading 状态，`useAuth` hook 提供 signIn/signUp/signOut/OAuth 操作，`useAuthToken` hook 保持后向兼容。ky HTTP 客户端注入 `Bearer` token、401 时自动刷新重试。支持 TOTP MFA 注册与验证。
:::

## 路由结构

Studio 使用 TanStack Router 管理路由，包含 27 个路由页面：

| 路由                                 | 页面         | 说明              |
| ------------------------------------ | ------------ | ----------------- |
| `/`                                  | 首页         | 工作流列表        |
| `/workflows/:id`                     | 画布编辑器   | 核心工作区        |
| `/workflows/:id/versions/:versionId` | 版本画布     | 特定版本编辑      |
| `/executions`                        | 执行列表     | 所有执行记录      |
| `/executions/:id`                    | 执行详情     | 单次执行追踪      |
| `/templates`                         | 模板市场     | 预置工作流模板    |
| `/marketplace`                       | 市场         | 工作流 & 插件市场 |
| `/marketplace/my-listings`           | 我的上架     | 已发布内容管理    |
| `/share/:token`                      | 分享页       | 公开只读分享      |
| `/developer-console`                 | 开发者控制台 | API Key 管理      |
| `/agents`                            | AgentListPage | Agent 列表/创建入口 |
| `/agents/$agentId`                   | AgentCanvasPage | Agent 配置编辑器画布 |
| `/agents/$agentId/conversations/new` | AgentConversationPage | 创建新对话 |
| `/agents/$agentId/conversations/$conversationId` | AgentConversationPage | 三列对话 UI |
| `/login`                             | LoginPage    | 邮箱密码登录 + OAuth |
| `/register`                          | RegisterPage | 邮箱密码注册 + OAuth |
| `/auth/callback`                     | AuthCallbackPage | Supabase OAuth PKCE 回调 |
| `/settings/security`                 | SecuritySettingsPage | 密码修改/MFA 管理/会话列表 |
| `/settings/security/autonomy-policy` | OrganizationAutonomyPolicyPage | 组织自治策略设置（owner-only） |
| `/settings/skills`                   | SkillBrowsePage | Skill 管理页 |
| `/resources/knowledge-bases`         | KnowledgeBasesPage | 知识库列表   |
| `/resources/knowledge-bases/$id`     | KnowledgeBaseDetailPage | 知识库详情 |
| `/resources/memory-instances/$instanceId/browse` | MemoryBrowserPage | 记忆浏览器 |
| `/settings/...`                      | 设置页组     | 组织级管理        |

## 共享 UI 层

`shared/ui/` 提供 8 个基础 UI 组件，基于 Radix UI + CVA（Class Variance Authority）构建：

- `Button` / `Input` / `Label` — 基础表单元素
- `Select` / `Slider` / `Switch` — 交互控件
- `Tabs` — 选项卡
- `Toast` — 全局通知

样式工具函数 `cn()` = `clsx` + `tailwind-merge`，用于合并 class 名。

## 相关文档

- [画布编辑器](./canvas) — 节点、连线、LOD 与交互
- [状态���理](./state) — Zustand 状态、TanStack Query、表单
- [功能模块](./features) — 35 个 feature 详解
- [WASM 集成](./wasm) — 类型引擎 Web Worker 架构
