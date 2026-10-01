---
docType: howto
---

# 让外部系统启动工作流

外部系统（支付回调、CRM、CI）在发生事件时启动一个已发布的工作流，有两种入口：

| 入口 | 地址 | 鉴权 | 适合 |
| --- | --- | --- | --- |
| Webhook 触发器 | `POST /api/v1/webhooks/:token` | 路径中的 token；签名模式另加 HMAC 签名 | 只能配置一个回调 URL 的第三方系统 |
| API 事件 | `POST /api/v1/api-events` | 平台 API Token 或 JWT | 你自己的服务，一个事件可同时启动多个工作流 |

在 Studio 中创建触发器、复制地址与密钥的界面操作见 [Webhook 触发器](/guide/triggers/webhook) 与 [API 事件触发器](/guide/triggers/api-event)。

本页输出来自本地 `agentloom-server` 的实际运行，目标工作流的输入契约声明了 `orderId`（必填）与 `status` 两个文本字段。

## 前提

- 目标工作流已发布。未发布的工作流不能创建触发器（409 `workflow-not-published`）。
- 发送签名请求的脚本需要 Node.js 18 或更高版本（使用内置 `fetch` 与 `node:crypto`）。

## Webhook：简单模式

新建 Webhook 触发器默认是简单模式（`authMode: "simple"`），持有完整 URL 即可调用。URL 中的 token 是 64 位十六进制串，等同于密码，泄露后在 Studio 中删除触发器重建。

```bash
curl -s -w '\n%{http_code}\n' -X POST \
  "https://agentloom.ling.plus/api/v1/webhooks/<token>" \
  -H 'Content-Type: application/json' \
  -d '{"orderId":"A-1002"}'
```

```text
{"executionId":"01a0f6eb-ff2f-73c7-8eb9-f4c9d8c867b1","status":"accepted"}
202
```

请求体如何变成工作流输入：

- JSON 对象：每个顶层字段作为一个启动参数，必须出现在工作流输入契约里。多出的字段返回 422：

  ```text
  {"type":"https://agentloom.dev/errors/workflow-launch-input-invalid","title":"启动参数校验失败","status":422,"detail":"工作流启动参数未通过输入契约校验，请修正后重试","instance":"/api/v1/webhooks/2669fda5cb8da9ca45635b16bbc2f376ac01988ec77eecfc607f6451ee0b24b7","errors":[{"field":"inputParams.extra","message":"该字段不存在于当前输入契约中"}]}
  ```

- 其他 JSON 值或无法解析为 JSON 的文本：作为单个参数 `payload` 传入。

## Webhook：签名模式

签名模式（`authMode: "signed"`）要求每个请求带时间戳与 HMAC 签名，防止 URL 泄露后被伪造调用。

| 项 | 值 |
| --- | --- |
| 时间戳头 | `x-agentloom-timestamp`：Unix 秒 |
| 签名头 | `x-agentloom-signature`：小写十六进制，无前缀 |
| 签名算法 | HMAC-SHA256，密钥为触发器配置中的 `secret` |
| 签名内容 | `<timestamp>.<原始请求体>`，原始请求体按 UTF-8 解码后的字符串 |
| 时间容差 | 与服务器时间相差不超过 300 秒 |

签名针对原始字节：先把请求体序列化成字符串，再用同一个字符串签名和发送。

把下面的脚本保存为 `send-webhook.mjs`：

```js
// 向 AgentLoom 签名模式 Webhook 发送一次请求（Node.js 18+，无第三方依赖）
import { createHmac } from 'node:crypto';

const url = process.env.AGENTLOOM_WEBHOOK_URL; // 例如 https://agentloom.example.com/api/v1/webhooks/<token>
const secret = process.env.AGENTLOOM_WEBHOOK_SECRET; // 触发器配置中的 secret

if (!url || !secret) {
  console.error('请设置 AGENTLOOM_WEBHOOK_URL 与 AGENTLOOM_WEBHOOK_SECRET');
  process.exit(1);
}

// 签名针对原始请求体字节：先序列化，再用同一个字符串签名和发送
const rawBody = JSON.stringify({ orderId: 'A-1001', status: 'paid' });
const timestamp = Math.floor(Date.now() / 1000).toString();
const signature = createHmac('sha256', secret)
  .update(`${timestamp}.${rawBody}`)
  .digest('hex');

const response = await fetch(url, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-agentloom-timestamp': timestamp,
    'x-agentloom-signature': signature,
  },
  body: rawBody,
});

console.log(response.status, await response.text());
```

运行：

```bash
AGENTLOOM_WEBHOOK_URL='https://agentloom.ling.plus/api/v1/webhooks/<token>' \
AGENTLOOM_WEBHOOK_SECRET='<secret>' \
node send-webhook.mjs
```

签名正确时：

```text
202 {"executionId":"01a0f6e0-5859-76ee-80be-2a32184b95c1","status":"accepted"}
```

密钥错误、缺少任一请求头、或时间戳超出 300 秒时，都返回同一个 401（注意它不是 problem+json）：

```text
401 {"error":"INVALID_SIGNATURE","message":"Webhook signature verification failed"}
```

具体失败原因写入触发器历史，状态为 `signature_failed`，在 Studio 触发器的历史记录里查看。

## Webhook：其他规则

- **IP 白名单**：触发器的 `ipWhitelist` 非空时，来源 IP 必须在列表中，否则同样返回 401 `INVALID_SIGNATURE`。来源 IP 取 `X-Forwarded-For` 的第一个值，没有该头时取连接地址。
- **token 不存在或触发器已停用**：404 `trigger-not-found`。
- **每个工作流**最多 10 个触发器（各类型合计）。
- 202 只表示执行已创建；执行结果在 Studio 的执行记录中查看，或用 `GET /api/v1/executions/:executionId`（需要凭证）查询。

## API 事件

你的服务以平台 API Token（见 [凭证](/api/#凭证)）发送事件；组织内所有已启用、且匹配该事件的 API 事件触发器各启动一次工作流。

```bash
curl -s -w '\n%{http_code}\n' https://agentloom.ling.plus/api/v1/api-events \
  -H "X-Api-Key: $AGENTLOOM_API_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"source":"crm","type":"order.refunded","data":{"orderId":"A-1001"}}'
```

```text
{"triggeredCount":1,"executions":[{"triggerId":"01a0f6e6-5ce5-784e-90ec-af69fc068448","executionId":"01a0f6e6-5d72-78b4-8ebb-3c65fec4b2eb"}],"skippedCount":2}
202
```

| 请求体字段 | 必填 | 说明 |
| --- | --- | --- |
| `source` | 是 | 事件来源，与触发器的「事件来源」比较，不区分大小写 |
| `type` | 是 | 事件类型，与触发器的「事件类型」比较，不区分大小写；触发器未设事件类型时匹配任意类型 |
| `data` | 否 | 对象，默认 `{}` |

匹配与启动规则：

1. 来源或类型不匹配的触发器计入 `skippedCount`。
2. 触发器配置了过滤表达式时，表达式是一段 JavaScript，可读变量 `payload`（即 `data`）、`source`、`type`，结果为真才启动；语法错误、抛异常或超过 1 秒都按不匹配处理。例如 `payload.amount > 100`。
3. 启动参数为 `data` 的全部字段加上 `_eventSource` 与 `_eventType`，同样经过工作流输入契约校验。启动失败的触发器既不计入 `triggeredCount` 也不计入 `skippedCount`，失败原因写入该触发器的历史。

::: warning 输入契约
本轮实测中，定义了输入契约的工作流被 API 事件启动时均以「启动参数校验失败」告终；未定义输入契约的工作流可以正常启动（上面的输出）。在此问题修复前，API 事件触发器请绑定未定义输入契约的工作流，并在 Studio 的触发器历史里确认是否启动成功。
:::

### GitHub 事件

`source` 为 `github` 时，服务端按 GitHub Webhook 规则验签：触发器配置的 `secret` 与 GitHub 仓库 Webhook 的 Secret 相同，事件的 `data` 中必须带：

- `data.headers["x-hub-signature-256"]`：GitHub 请求头 `X-Hub-Signature-256` 的原值（`sha256=<hex>`）；
- `data.rawBody`：GitHub 请求体的原始字符串。

服务端计算 `sha256=` + HMAC-SHA256(`secret`, `rawBody`) 的十六进制并比对，不一致的触发器计入 `skippedCount`。`/api-events` 需要 AgentLoom 凭证，GitHub 不能直接调用，需要你的中转服务把 GitHub 请求按上述格式转发。

::: warning 未在本轮验证
GitHub 事件验签只按 `agentloom-server/src/modules/trigger/adapters/github-webhook.adapter.ts` 的实现描述，没有用真实 GitHub 请求实跑。
:::

### 错误

- 缺少 `source` 或 `type` 时，当前版本返回 500 `internal-server-error`，而不是 422。
- 凭证错误与限流见 [API 约定](/api/)。
