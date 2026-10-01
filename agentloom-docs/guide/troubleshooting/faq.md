---
docType: howto
---

# 常见问题

按症状列出常见问题的原因与处理方法。看到具体的错误类型（`type`）时，直接查[错误参考](/guide/troubleshooting/errors)。

::: warning 未在本轮验证
「如何确认自托管的服务在线」中的 `curl` 命令没有对运行中的服务实跑。
:::

## 工作流编辑

### 两个端口连不上

只有数据类型兼容的端口才能连线；没有名称的执行流端口只能与执行流端口相连。各数据类型与兼容规则见[什么是 AgentLoom](/guide/getting-started/)，每个端口的类型见对应的[节点页](/guide/nodes/)。

### 保存或发布时提示工作流已被其他用户修改

同一个工作流在另一个浏览器标签页或另一位成员处被修改并保存过（错误类型 `version-conflict`）。刷新页面加载最新内容后再编辑。

### 「新增触发器」不可用

「触发器管理」提示「请先发布工作流后再新增触发器」时，先发布工作流，见[版本管理](/guide/workflows/versions)。

### 工作流里的 Agent 节点没有「沙箱」端口

节点绑定的 Agent 运行形态为「无沙箱」，这类 Agent 不使用沙箱，节点不显示该端口。需要沙箱时改选「有沙箱」的 Agent，见[创建 Agent](/guide/agents/creating)。

## 工作流执行

### 执行失败，怎么找到原因

在画布页点击「查看执行记录」，打开失败的那次执行，在执行调试页的时间线中找到状态为失败的节点，右侧详情显示错误信息。步骤见[调试工作流](/guide/workflows/debugging)。

### 执行完成了，但 Text Output 是空的

依次检查：

1. Text Output 的「文本」端口是否有连线。没有值时节点输出空字符串，不报错。
2. 上游 Agent 节点是否选择了已发布的 Agent，以及该版本的 Agent 画布上是否连接了模型。
3. 上游是 Skill 节点时，查看它的输出是否带 `warning` 字段：技能 ID 错误或技能未激活时，Skill 节点照常完成，但不提供任何技能，见 [Skill 节点](/guide/nodes/skill)。

### 节点停在「等待干预」

组织的[自治策略](/guide/collaboration/autonomy-policy)要求人工确认，或 Agent 主动请求了人工干预。在该节点配置面板的「介入」标签中处理后，执行继续，见[调试工作流](/guide/workflows/debugging)。

## 触发器与集成

### Webhook 调用没有触发工作流

看调用方收到的 HTTP 状态：

| 状态 | 原因 | 处理 |
| --- | --- | --- |
| 202 | 已接受，执行已启动 | 在「查看执行记录」中查看这次执行 |
| 404 | URL 中的 Token 不对，或触发器已停用 | 核对触发器卡片上的「Webhook 入口」，确认触发器为「已启用」 |
| 401 | Signed 模式下签名或时间戳校验失败，或请求来源不在 IP 白名单中 | 核对签名方法，见 [Webhook 与 API 事件](/api/webhooks) |

触发器卡片上的「历史记录」打开「触发历史记录」，可按成功、失败、签名失败、跳过筛选每次调用的结果。

GitHub 等自带签名头（如 `X-Hub-Signature-256`）的来源不能使用 Signed 模式，因为 AgentLoom 校验的是自己的签名头，见[代码审查](/guide/use-cases/code-review)。

### Webhook 调用为什么拿不到工作流的结果

Webhook 入口在启动执行后立即返回 202 与 `executionId`，不等待执行结束。用 `executionId` 通过 [REST API](/api/rest) 查询执行结果。

### API 调用返回 401

平台 API Token 放在 `X-Api-Key` 请求头中，值为完整的 `al_` 开头 Token；登录凭证放在 `Authorization: Bearer` 头中。Token 已吊销或过期时也返回 401。凭证类型见 [API 概览](/api/)，Token 的创建与吊销见 [API Token](/guide/integrations/api-keys)。

### API 调用返回 429

超过了每分钟请求上限（错误类型 `rate-limit-exceeded`，或资源治理拦截时为 `resource-governance-decision-blocked`）。按响应头 `Retry-After` 等待后重试，`X-RateLimit-*` 头给出上限与剩余次数。

## Agent 与知识库

### 有沙箱的 Agent 无法开始对话

错误类型为 `agent-sandbox-not-connected` 时，Agent 画布上没有连接沙箱：把 Sandbox 节点连到 Agent Main 后重新发布。部署没有启用沙箱运行时，沙箱会创建失败，此时改用「无沙箱」Agent，或请部署管理员按 [Firecracker 沙箱](/deploy/firecracker) 启用。

### Agent 回答没有用到知识库

1. 在知识库详情页确认文档状态为「已就绪」。
2. 确认知识库节点连到了 Agent 画布中 Agent Main 的「知识库」端口，且工作流或对话使用的是包含这条连线的发布版本。工作流画布上的 Agent 节点没有知识库端口。
3. 知识库未配置可用的 Embedding 模型时，按[检索配置](/guide/knowledge-base/retrieval)选择模型后重新上传或重建索引。

### 知识库支持哪些文件

PDF、TXT、Markdown 与 DOCX（扩展名 `.pdf`、`.txt`、`.md`、`.docx`），单个文件最大 50 MB，见[创建知识库](/guide/knowledge-base/creating)。

## 账户与连接

### 权限不足

错误类型为 `insufficient-permissions` 时，当前组织角色不能执行该操作。角色由组织 owner 或 admin 调整，各角色能做什么见[角色与权限](/guide/collaboration/roles)。

### 移动端连不上服务器

在登录页右上角点击当前主机名，进入「连接与服务器」，确认「Studio 基础地址」指向你的部署，见[移动端概览](/guide/mobile/)。

### 如何确认自托管的服务在线

服务端的健康检查端点是 `/api/v1/health`，不需要登录（把 `agentloom.example.com` 换成你的域名）：

```bash
curl -s https://agentloom.example.com/api/v1/health
```

服务正常时返回 HTTP 200，响应中 `status` 为 `ok`。部署与反向代理的排查见[部署运维](/deploy/)。
