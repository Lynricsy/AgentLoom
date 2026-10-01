---
docType: reference
---

# 界面导览

Studio 的全局导航由左侧侧边栏提供；小屏幕上侧边栏收进左上角的「打开导航」抽屉，内容相同。下表按侧边栏分组列出全部入口，「可见角色」为空表示所有角色可见。

## 侧边栏

| 分组 | 入口 | 路由 | 用途 | 可见角色 | 相关指南 |
| --- | --- | --- | --- | --- | --- |
| 构建 | 工作流 | `/workflows` | 工作流列表与画布 | | [工作流](/guide/workflows/) |
| 构建 | Agent | `/agents` | Agent 列表、Agent 画布与对话 | | [Agent](/guide/agents/) |
| 构建 | 生成应用 | `/generated-apps` | 用自然语言生成应用并预览、公开 | | [生成应用](/guide/generated-apps/) |
| 探索 | 发现 | `/discover` | 浏览已上架的工作流与插件 | | |
| 探索 | 市场 | `/marketplace` | 浏览社区共享的工作流与插件并安装到工作区 | | [市场](/guide/collaboration/marketplace) |
| 探索 | 模板 | `/templates` | 从模板创建工作流 | | [使用模板](/guide/workflows/templates) |
| 探索 | 开发者 | `/developer-console/earnings` | 开发者控制台（进入收益页） | owner、admin | [开发者控制台](/guide/collaboration/developer-console) |
| 探索 | 开发者 | `/developer-console/keys` | 开发者控制台（进入签名密钥页） | creator | [开发者控制台](/guide/collaboration/developer-console) |
| 资源 | MCP 服务 | `/resources/mcp-servers` | 接入与管理 MCP Server（creator 只读） | owner、admin、creator | [MCP 工具](/guide/integrations/mcp-tools) |
| 资源 | LLM 模型 | `/resources/llm-models` | 管理模型配置与 Provider 凭据 | | [LLM 模型节点](/guide/nodes/llm-model) |
| 资源 | 技能 | `/resources/skills` | 管理技能 | | [技能](/guide/skills/) |
| 资源 | 知识库 | `/resources/knowledge-bases` | 创建知识库、上传文档 | | [知识库](/guide/knowledge-base/) |
| 资源 | 记忆 | `/resources/memory-instances` | 管理记忆实例 | | [Agent 记忆](/guide/agents/memory) |
| 资源 | 工作区 | `/resources/workspaces` | 管理持久化工作区 | | [Workspace 节点](/guide/nodes/workspace) |
| 资源 | 沙箱 | `/resources/sandboxes` | 管理持久沙箱 | | [Sandbox 节点](/guide/nodes/sandbox) |
| 资源 | 插件 | `/resources/plugins` | 安装、启用插件并查看用量 | | [使用插件](/guide/integrations/plugins) |
| 运维 | 监控 | `/settings/monitoring` | 运行监控 | owner、admin | |
| 运维 | 审计日志 | `/settings/audit-logs` | 查看组织内操作记录 | owner、admin | |
| 运维 | 通知 | `/notifications` | 通知中心 | | [通知](/guide/account/notifications) |

侧边栏底部依次是「设置」（进入 `/settings`）、通知入口和用户菜单。用户菜单中可切换「主题」（浅色、深色、系统）和「退出登录」。

## 设置

点击侧边栏底部的「设置」进入设置页，左侧是设置导航：

| 分组 | 入口 | 路由 | 相关指南 |
| --- | --- | --- | --- |
| 通用 | 概览 | `/settings` | |
| 通用 | 个人偏好 | `/settings/preferences` | [账户概述](/guide/account/) |
| 通用 | API Token | `/settings/api-tokens` | [API Token](/guide/integrations/api-keys) |
| 通用 | 通知 | `/settings/notifications` | [通知](/guide/account/notifications) |
| 通用 | 组织 | `/settings/organization` | [组织与工作区](/guide/collaboration/workspace) |
| 安全 | 安全设置 | `/settings/security` | [安全设置](/guide/account/security) |
| 安全 | 加密 | `/settings/encryption` | [安全设置](/guide/account/security) |
| 安全 | 自治策略 | `/settings/security/autonomy-policy` | [自治策略](/guide/collaboration/autonomy-policy) |
| 平台 | 监控 | `/settings/monitoring` | |
| 平台 | 资源配额 | `/settings/resource-quotas` | |
| 平台 | 私有部署 | `/settings/private-deployment` | |
| 审计 | 审计日志 | `/settings/audit-logs` | |

## 画布页

打开一个工作流（`/workflows/:workflowId`）后：

- **左侧节点面板**：按 Agent、Tool、Trigger、Knowledge、Memory、Output、Control 分组列出节点，启用插件后出现 Plugins 分组；「My Blocks」标签列出封装或导入的可复用块。
- **顶部工具栏**：状态徽章（草稿、已发布、已归档）、保存快照、历史记录、导出、导入、分享、归档，以及「介入策略」「输入参数」「触发器」面板开关、「发布到市场」「发布」「运行」。
- **右侧配置面板**：点击节点后打开，含「配置」「输出」标签，需要人工介入的节点还有「介入」标签。
- **底部状态栏**：节点数、连接数、保存状态与执行状态。

Agent 画布（`/agents/:agentId`）的节点面板按核心、模型、工具、知识、提示、记忆、高级、环境分组；顶部工具栏为状态徽章、「保存画布」「保存版本」「历史记录」「发布」「分享」「API 访问」。

Studio 全部路由见下表：

<!--@include: ../../_generated/studio-routes.md-->
