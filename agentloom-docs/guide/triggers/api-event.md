---
docType: howto
---

# API 事件触发

本页说明如何让你自己的服务通过发送一个事件同时启动组织内的一个或多个工作流，例如订单服务发出 `order.completed` 后，同时启动「发票生成」与「客户通知」两个工作流。事件请求的格式见 [让外部系统启动工作流](/api/webhooks)。

与 [Webhook 触发](/guide/triggers/webhook) 的区别：Webhook 每个触发器有自己的 URL，无需 AgentLoom 凭证；API 事件共用一个入口 `POST /api/v1/api-events`，调用方必须携带平台 API Token 或用户 JWT，一个事件按来源与类型匹配组织内所有已启用的 API Event 触发器。

前提：

- 工作流已发布，你的角色是 owner、admin 或 creator。
- 发送事件的服务持有一个 [API Token](/guide/integrations/api-keys)。
- 目标工作流**没有定义输入参数**。当前版本中，API 事件启动的执行要求请求携带输入参数的 schema 版本，而事件入口不传这个值，因此定义了输入参数的工作流被 API 事件启动时总是校验失败，触发历史记为「失败」。

## 创建 API Event 触发器

1. 在工作流画布顶部工具栏点击「触发器」，在「触发器管理」中点击「添加触发器」，选择「API Event」。
2. 填写表单：

   | 字段 | 必填 | 说明 |
   | --- | --- | --- |
   | 触发器名称 | 是 | 例如「订单状态同步」 |
   | 事件源 | 是 | 与事件的 `source` 比较，不区分大小写，例如 `order-service` |
   | 事件类型 | 是 | 与事件的 `type` 比较，不区分大小写，例如 `order.completed` |
   | 过滤表达式 | 否 | 一段 JavaScript 表达式，结果为真才启动，见下一节 |
   | 签名密钥 | 否 | 只有「事件源」为 `github` 时使用，见 [转发 GitHub 事件](#转发-github-事件) |
   | 描述 | 否 | 说明事件来源与触发条件 |

3. 点击「创建触发器」。

   页面提示「触发器已创建」，卡片的「事件契约」显示「事件源」「事件类型」，填写了过滤表达式时一并显示。

## 用过滤表达式缩小范围

过滤表达式在服务端隔离环境中求值，可读三个变量：

| 变量 | 值 |
| --- | --- |
| `payload` | 事件的 `data` 对象 |
| `source` | 事件来源 |
| `type` | 事件类型 |

例如 `payload.region == "cn"` 只在 `data.region` 为 `cn` 时启动，`payload.amount > 100` 只在金额大于 100 时启动。表达式语法错误、运行时抛出异常或运行超过 1 秒时一律按不匹配处理，不会启动工作流，也不写触发历史。

## 发送一次事件验证

1. 让你的服务按 [让外部系统启动工作流](/api/webhooks) 中「API 事件」一节发送一个 `source`、`type` 与触发器一致的事件。

   响应为 `202`，其中 `triggeredCount` 为启动的执行数，`executions` 列出每个触发器与执行 ID，`skippedCount` 为来源、类型或过滤表达式不匹配的触发器数。

2. 在 Studio 中打开该触发器的「历史记录」。

   出现一条「成功」记录，「查看执行」打开这次执行。执行的启动参数是 `data` 的全部字段，外加 `_eventSource` 与 `_eventType`。

`triggeredCount` 为 0 时，检查事件的 `source`、`type` 是否与触发器一致、触发器是否「已启用」、过滤表达式对这条事件是否为真。

## 转发 GitHub 事件

「事件源」为 `github` 的触发器会按 GitHub Webhook 规则验签。`/api/v1/api-events` 需要 AgentLoom 凭证且要求固定的请求体结构，GitHub 不能直接调用它，需要由你的中转服务接收 GitHub 请求后转发。

1. 创建触发器时「事件源」填 `github`，「事件类型」填 GitHub 事件名（如 `push`、`pull_request`），「签名密钥」填 GitHub 仓库 Webhook 设置中的 Secret。

   卡片的「事件契约」下显示「已配置签名密钥（服务端做 HMAC-SHA256 验签）」。

2. 让中转服务把 GitHub 请求按 [让外部系统启动工作流](/api/webhooks) 中「GitHub 事件」一节的格式转发：`data.headers` 中带原始 `X-Hub-Signature-256` 请求头，`data.rawBody` 为 GitHub 请求体原文。

   签名不匹配、缺少请求头或未配置签名密钥时，该触发器计入 `skippedCount`，不启动工作流。

## 相关

- [让外部系统启动工作流](/api/webhooks)
- [API Event 节点](/guide/nodes/trigger)
- [API Token](/guide/integrations/api-keys)
