---
docType: howto
---

# 通过 API 调用 Agent

本页说明如何为一个 Agent 创建 API Key，让第三方系统调用它。请求格式、流式事件与错误码见 [Agent API](/api/agent-api)。

前提：

- 你在组织中的角色是 owner、admin 或 creator（可查看）；创建与吊销 Key 需要 owner 或 admin。其他角色看不到「API 访问」按钮。
- Agent 已发布。未发布的 Agent 也可以先创建 Key，但外部调用会返回 409 `agent-not-published`；已归档的 Agent 返回 409 `agent-archived`。

## 创建 API Key

1. 打开 Agent 画布，点击工具栏「API 访问」，打开「API 访问」面板，切换到「API Key」标签。
2. 点击「创建 Key」，在「创建 API Key」对话框中填写：
   - 「名称」（必填），例如「CRM 客服机器人」。建议每个接入方单独一个 Key。
   - 「每分钟请求上限」：1 到 6000；留空则沿用组织的 API 速率限制。
   - 「最大并发 run 数」：1 到 50，默认 5；同时排队或运行中的 run 超出后返回 429。
   - 「过期时间」：留空表示长期有效，直至被吊销。
3. 点击「创建 Key」。

对话框变为「保存你的 API Key」，显示以 `alak_` 开头的明文 Key。这是 Key 唯一一次显示，复制保存后点击「我已保存」。Key 只能调用当前 Agent 的已发布版本。

## 查看调用示例

在「API 访问」面板切换到「调用示例」标签，可以看到带有当前部署地址的 `curl` 示例（创建对话、发起 run 并通过 SSE 接收流式输出）和 SSE 事件说明，每段示例可一键复制。完整的接口说明见 [Agent API](/api/agent-api)。

第三方发起的对话会出现在 Agent 对话列表的「API」来源下，见 [与 Agent 对话](/guide/agents/conversations)。

## 吊销 API Key

1. 在「API Key」标签的列表中找到该 Key（可按状态筛选：仅有效、仅已吊销、全部），点击「吊销」。
2. 在「吊销 API Key？」确认框中点击「确认吊销」。

提示「API Key 已吊销」。吊销立即生效且无法恢复，使用该 Key 的调用会收到 401。列表中 Key 的状态为「有效」「已过期」或「已吊销」，并显示限额与最后使用时间。

## 相关

- [API Token](/guide/integrations/api-keys)：调用平台 REST API 的个人凭证（前缀 `al_`），与 Agent API Key 不同。
- [Agent API](/api/agent-api)
