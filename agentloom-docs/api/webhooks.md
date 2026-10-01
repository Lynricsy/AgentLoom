---
docType: howto
---

# 让外部系统启动工作流

外部系统（支付回调、CRM、CI）在发生事件时启动一个已发布的工作流，有两种入口：

| 入口 | 地址 | 鉴权 | 适合 |
| --- | --- | --- | --- |
| Webhook 触发器 | `POST /api/v1/webhooks/:token` | 路径中的 token；签名模式另加 HMAC 签名；GitHub 模式校验 GitHub 签名 | 只能配置一个回调 URL 的第三方系统、GitHub 仓库 |
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

- JSON 对象：每个顶层字段作为一个启动参数。工作流声明了输入契约时，只保留契约内的字段，契约外的字段丢弃；缺少必填字段或类型不符返回 422。例如请求体为 `{"status":"paid","extra":1}`、缺少必填的 `orderId` 时：

  ```text
  {"type":"https://agentloom.dev/errors/workflow-launch-input-invalid","title":"启动参数校验失败","status":422,"detail":"工作流启动参数未通过输入契约校验，请修正后重试","instance":"/api/v1/webhooks/0fe4f8486e54bc5587a7d3471feb0a1f6717843a0d85a45f1f465372d9131e79","errors":[{"field":"inputParams.orderId","message":"该字段为必填项"}]}
  ```

  `extra` 不会出现在错误中；补上 `orderId` 后同一请求体返回 202，`extra` 被丢弃。

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

## Webhook：GitHub 模式

GitHub 仓库 Webhook 只发送 GitHub 自己的签名头，不带 AgentLoom 的时间戳头。GitHub 模式（`authMode: "github"`）让 GitHub 直接调用 Webhook URL：

| 项 | 值 |
| --- | --- |
| 签名头 | `X-Hub-Signature-256: sha256=<小写十六进制>` |
| 签名算法 | HMAC-SHA256(`secret`, 原始请求体字节)，`secret` 为触发器配置中的 secret，与 GitHub 仓库 Webhook 的 Secret 相同 |
| 时间戳 | 不校验（GitHub 不发送） |
| 去重 | 同一 `X-GitHub-Delivery` 在 24 小时内只启动一次执行 |
| 启动参数 | 请求体顶层字段，外加 `_eventSource: "github"`、`_eventType`（`X-GitHub-Event`）、`_deliveryId`（`X-GitHub-Delivery`） |

在 GitHub 仓库 **Settings → Webhooks → Add webhook** 中，Payload URL 填 Webhook URL，Content type 选 `application/json`，Secret 填触发器的 secret。

响应：

| 情形 | 状态码 | 响应体 | 触发历史 |
| --- | --- | --- | --- |
| 签名正确 | 202 | `{"executionId":"<执行 ID>","status":"accepted"}` | `success` |
| `X-GitHub-Event: ping`（GitHub 创建 Webhook 后的首次投递） | 200 | `{"status":"skipped","reason":"github-ping"}` | `skipped` |
| 24 小时内重复的 `X-GitHub-Delivery`（如 GitHub 页面上的 Redeliver） | 200 | `{"status":"skipped","reason":"duplicate-delivery"}` | `skipped` |
| 缺少 `X-Hub-Signature-256` 或签名不匹配 | 401 | `{"error":"INVALID_SIGNATURE","message":"Webhook signature verification failed"}` | `signature_failed` |

启动执行失败（例如 422）的投递不占用去重窗口，可以在 GitHub 上重新投递。`X-GitHub-Delivery` 不在签名范围内，去重只用于消除 GitHub 的重复投递，不能防止持有合法请求的人改换投递 ID 重放；需要限制来源时叠加 IP 白名单。

下面的脚本模拟 GitHub 的一次 `push` 投递，可用来在配置 GitHub 前验证触发器。保存为 `send-github-webhook.mjs`：

```js
// 模拟 GitHub 仓库 Webhook 投递（Node.js 18+，无第三方依赖）
import { createHmac, randomUUID } from 'node:crypto';

const url = process.env.AGENTLOOM_WEBHOOK_URL; // 例如 https://agentloom.example.com/api/v1/webhooks/<token>
const secret = process.env.AGENTLOOM_WEBHOOK_SECRET; // 触发器配置中的 secret

if (!url || !secret) {
  console.error('请设置 AGENTLOOM_WEBHOOK_URL 与 AGENTLOOM_WEBHOOK_SECRET');
  process.exit(1);
}

const rawBody = JSON.stringify({ ref: 'refs/heads/main', after: 'abc123' });
const signature = `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`;
const deliveryId = process.env.GITHUB_DELIVERY_ID ?? randomUUID();

const response = await fetch(url, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-GitHub-Event': 'push',
    'X-GitHub-Delivery': deliveryId,
    'X-Hub-Signature-256': signature,
  },
  body: rawBody,
});

console.log(response.status, await response.text());
```

用同一个投递 ID 运行两次，再换一个错误的 secret 运行一次：

```bash
export AGENTLOOM_WEBHOOK_URL='https://agentloom.ling.plus/api/v1/webhooks/<token>'
export GITHUB_DELIVERY_ID='72d3162e-cc78-11e3-81ab-4c9367dc0958'
AGENTLOOM_WEBHOOK_SECRET='<secret>' node send-github-webhook.mjs
AGENTLOOM_WEBHOOK_SECRET='<secret>' node send-github-webhook.mjs
AGENTLOOM_WEBHOOK_SECRET='wrong' node send-github-webhook.mjs
```

```text
202 {"executionId":"01a0f7dc-46f6-788f-8da9-2e9fb4efad5c","status":"accepted"}
200 {"status":"skipped","reason":"duplicate-delivery"}
401 {"error":"INVALID_SIGNATURE","message":"Webhook signature verification failed"}
```

## Webhook：其他规则

- **IP 白名单**：触发器的 `ipWhitelist` 非空时，来源 IP 必须匹配其中一项（单个地址或 CIDR 网段），否则返回 403 problem+json `https://agentloom.dev/errors/webhook-ip-not-allowed`，触发历史状态为 `ip_rejected`。IP 白名单先于签名校验，可与任一 `authMode` 叠加。来源 IP 是 server 按 `APP_TRUST_PROXY_HOPS`（可信反向代理层数，见 [配置](/deploy/configuration)）从 `X-Forwarded-For` 末尾取得的地址；调用方自填的 `X-Forwarded-For` 前段不生效。
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
3. 启动参数为 `data` 的全部字段加上 `_eventSource` 与 `_eventType`。工作流声明了输入契约时，只保留契约内的字段，`_eventSource`、`_eventType` 与契约外字段都不进入启动参数（完整事件仍保存在触发历史的 payload 中）。启动失败的触发器既不计入 `triggeredCount` 也不计入 `skippedCount`，失败原因写入该触发器的历史。

### GitHub 事件

GitHub 仓库直接投递时用上文的「Webhook：GitHub 模式」，不需要中转服务。

API 事件的 `source` 为 `github` 时，服务端同样按 GitHub Webhook 规则验签，适用于已有服务需要把 GitHub 事件扇出到多个工作流的场景：触发器配置的 `secret` 与 GitHub 仓库 Webhook 的 Secret 相同，事件的 `data` 中必须带：

- `data.headers["x-hub-signature-256"]`：GitHub 请求头 `X-Hub-Signature-256` 的原值（`sha256=<hex>`）；
- `data.rawBody`：GitHub 请求体的原始字符串。

服务端计算 `sha256=` + HMAC-SHA256(`secret`, `rawBody`) 的十六进制并比对，不一致的触发器计入 `skippedCount`。

### 错误

- 缺少 `source` 或 `type` 时，当前版本返回 500 `internal-server-error`，而不是 422。
- 凭证错误与限流见 [API 约定](/api/)。
