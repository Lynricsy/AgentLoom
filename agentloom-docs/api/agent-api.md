---
docType: howto
---

# 从自己的系统调用已发布的 Agent

把 AgentLoom 里发布好的 Agent 接到你的网站、客服系统或后端服务：用 Agent 专用的 API Key 创建对话、发送用户输入、以流式或轮询方式拿到回复。完成后，你的服务能在不登录 Studio 的情况下与该 Agent 多轮对话。

在 Studio 中开启「API 访问」、管理 Key 的界面操作见 [为 Agent 开启 API 访问](/guide/agents/api-access)。本页只讲 HTTP 调用。

::: info 本页输出的来源
所有输出来自本地 `agentloom-server` 的实际运行。为了让 run 能跑完，本地组织的默认 LLM 模型指向一个 OpenAI 兼容的本地桩服务，所以回复内容是固定文本；接入真实模型时只有 `content` 不同。
:::

## 前提

- Agent 已发布（Agent 详情页发布过至少一个版本）。未发布的 Agent 创建对话返回 409 `agent-not-published`。
- Agent 所在组织配置了默认 LLM 模型。否则 run 会以 `failed` 结束，`error.detail` 为「租户 … 未配置默认 LLM 模型」。
- 创建 Key 需要组织角色 `owner` 或 `admin`；`creator` 只能查看 Key 列表。
- 以下命令用到的变量：

```bash
export AGENTLOOM_API=https://agentloom.ling.plus/api/v1   # 自托管时换成你的域名
export JWT='<Studio 登录后的 access token，仅创建与吊销 Key 时需要>'
export AGENT_ID='<Agent ID，见 Agent 详情页地址栏>'
```

## 1. 创建 Agent API Key

```bash
curl -s -i -X POST "$AGENTLOOM_API/agent-definitions/$AGENT_ID/api-keys" \
  -H "Authorization: Bearer $JWT" \
  -H 'Content-Type: application/json' \
  -d '{"name":"官网客服","max_concurrent_runs":2}'
```

```text
HTTP/1.1 201 Created
location: /api/v1/agent-definitions/01a0f6d6-ef96-74d5-8e8f-405a3f5b9ce1/api-keys/01a0f6d7-bf1a-764a-97bf-da01024ae80d
content-type: application/json; charset=utf-8

{"data":{"id":"01a0f6d7-bf1a-764a-97bf-da01024ae80d","agentDefinitionId":"01a0f6d6-ef96-74d5-8e8f-405a3f5b9ce1","name":"官网客服","keyPrefix":"alak_653c8b62","rateLimitPerMinute":null,"maxConcurrentRuns":2,"lastUsedAt":null,"expiresAt":null,"revokedAt":null,"createdAt":"2026-10-01T09:42:09.424Z","key":"alak_653c8b62<其余 56 位已省略>"}}
```

`data.key` 是明文 Key，只在这一次响应里出现，服务端只保存哈希。把它存进你的密钥管理，然后：

```bash
export AGENT_KEY='<上一步的 data.key>'
```

请求体字段（snake_case）：

| 字段 | 必填 | 取值 | 默认 |
| --- | --- | --- | --- |
| `name` | 是 | 1–255 字符 | — |
| `rate_limit_per_minute` | 否 | 1–6000 | 不设置时使用组织的每分钟配额 |
| `max_concurrent_runs` | 否 | 1–50 | 5 |
| `expires_at` | 否 | 带时区的 ISO 8601 时间 | 永不过期 |

每个 Agent 最多保留 20 个未吊销的 Key，超出返回 409 `agent-api-key-limit-exceeded`。

用新 Key 读取它绑定的 Agent，确认 Key 可用：

```bash
curl -s "$AGENTLOOM_API/agent-api/agent" -H "Authorization: Bearer $AGENT_KEY"
```

```json
{"data":{"id":"01a0f6d6-ef96-74d5-8e8f-405a3f5b9ce1","name":"客服助手","description":null,"status":"published","publishedVersion":{"id":"01a0f6d7-6b49-77e7-b351-285895f9a97b","label":"v1","publishedAt":"2026-10-01T09:41:48.061Z"},"inputSchema":null}}
```

## 2. 创建对话

一个对话对应你那边的一次会话。`externalUserId` 存你系统里的用户标识，之后可按它筛选对话。

```bash
curl -s -i "$AGENTLOOM_API/agent-api/conversations" \
  -H "Authorization: Bearer $AGENT_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"title":"订单咨询","externalUserId":"user-42","metadata":{"channel":"web"}}'
```

```text
HTTP/1.1 201 Created
location: /api/v1/agent-api/conversations/01a0f6d7-d4cc-74e5-9d88-209f50963812
content-type: application/json; charset=utf-8

{"data":{"id":"01a0f6d7-d4cc-74e5-9d88-209f50963812","title":"订单咨询","status":"active","externalUserId":"user-42","metadata":{"channel":"web"},"createdAt":"2026-10-01T09:42:14.982Z","updatedAt":"2026-10-01T09:42:14.982Z"}}
```

```bash
export CONV_ID='<上一步的 data.id>'
```

- 请求体所有字段可选：`title`（≤255）、`externalUserId`（1–255）、`metadata`（对象，序列化后 ≤16 KB，不能含 `execution` 键）。
- 对外接口的请求体只接受 camelCase，未知字段返回 422，例如 `{"external_user_id":"u1"}` 得到 `Unrecognized key: "external_user_id"`。

## 3. 发送输入并取得回复

每次用户发言是一个 run：`POST /agent-api/conversations/:conversationId/runs`，请求体 `{"input":{"content":"…"}}`（`content` 1–100000 字符；可选 `attachments`，最多 10 个）。按你的接入方式选一种取结果的办法。

### 流式：一次请求拿到增量文本

带 `Accept: text/event-stream`，响应直接是这个 run 的 SSE 事件流，终态事件后连接关闭：

```bash
curl -s -N "$AGENTLOOM_API/agent-api/conversations/$CONV_ID/runs" \
  -H "Authorization: Bearer $AGENT_KEY" \
  -H 'Content-Type: application/json' \
  -H 'Accept: text/event-stream' \
  -d '{"input":{"content":"我的订单什么时候发货？"}}'
```

```text
id: 1790847854390-0
event: run.created
data: {"run":{"id":"01a0f6d9-a72c-7e6f-a8c0-b85487343e61","conversationId":"01a0f6d7-d4cc-74e5-9d88-209f50963812","status":"queued","agentVersionId":null,"input":{"messageId":"01a0f6d9-a729-719e-a33f-a980f47639c8","content":"我的订单什么时候发货？"},"output":null,"stopReason":null,"error":null,"createdAt":"2026-10-01T09:44:14.356Z","startedAt":null,"completedAt":null}}

id: 1790847854412-0
event: run.status
data: {"runId":"01a0f6d9-a72c-7e6f-a8c0-b85487343e61","status":"queued","phase":"queued"}

id: 1790847854412-1
event: run.status
data: {"runId":"01a0f6d9-a72c-7e6f-a8c0-b85487343e61","status":"queued","phase":"preparing"}

id: 1790847854419-0
event: run.status
data: {"runId":"01a0f6d9-a72c-7e6f-a8c0-b85487343e61","status":"queued","phase":"agent_initializing"}

id: 1790847854606-0
event: run.status
data: {"runId":"01a0f6d9-a72c-7e6f-a8c0-b85487343e61","status":"running","phase":"running"}

id: 1790847854618-0
event: run.status
data: {"runId":"01a0f6d9-a72c-7e6f-a8c0-b85487343e61","status":"running"}

id: 1790847854672-0
event: message.delta
data: {"runId":"01a0f6d9-a72c-7e6f-a8c0-b85487343e61","index":0,"delta":"您好，订单已"}

id: 1790847854677-0
event: message.delta
data: {"runId":"01a0f6d9-a72c-7e6f-a8c0-b85487343e61","index":1,"delta":"在今天下午出"}

id: 1790847854682-0
event: message.delta
data: {"runId":"01a0f6d9-a72c-7e6f-a8c0-b85487343e61","index":2,"delta":"库，预计 2"}

id: 1790847854686-0
event: message.delta
data: {"runId":"01a0f6d9-a72c-7e6f-a8c0-b85487343e61","index":3,"delta":" 天内送达。"}

id: 1790847854704-0
event: run.completed
data: {"run":{"id":"01a0f6d9-a72c-7e6f-a8c0-b85487343e61","conversationId":"01a0f6d7-d4cc-74e5-9d88-209f50963812","status":"completed","agentVersionId":"01a0f6d7-6b49-77e7-b351-285895f9a97b","input":{"messageId":"01a0f6d9-a729-719e-a33f-a980f47639c8","content":"我的订单什么时候发货？"},"output":{"messageId":"01a0f6d9-a867-7cd9-bb1d-a41c1d58762e","content":"您好，订单已在今天下午出库，预计 2 天内送达。","toolCalls":[]},"stopReason":"end_turn","error":null,"createdAt":"2026-10-01T09:44:14.356Z","startedAt":"2026-10-01T09:44:14.610Z","completedAt":"2026-10-01T09:44:14.691Z"}}
```

响应头为 `Content-Type: text/event-stream; charset=utf-8`、`Cache-Control: no-cache`、`X-Accel-Buffering: no`；空闲时每 15 秒写一行注释 `: ping`，防止代理断开。

### 同步等待：短回复一次拿到结果

带 `Prefer: wait=<1-60>`。run 在这段时间内结束时返回 200 和最终 run，并回写 `Preference-Applied`；没结束则与异步方式一样返回 202。

```bash
curl -s -i "$AGENTLOOM_API/agent-api/conversations/$CONV_ID/runs" \
  -H "Authorization: Bearer $AGENT_KEY" \
  -H 'Content-Type: application/json' \
  -H 'Prefer: wait=30' \
  -d '{"input":{"content":"我的订单什么时候发货？"}}'
```

```text
HTTP/1.1 200 OK
preference-applied: wait=30
content-type: application/json; charset=utf-8

{"data":{"id":"01a0f6e9-ec7d-7e8f-b272-0f6b2887c8db","conversationId":"01a0f6e9-ec3a-7c2d-8ca6-f1a192081521","status":"completed","agentVersionId":"01a0f6d7-6b49-77e7-b351-285895f9a97b","input":{"messageId":"01a0f6e9-ec7c-75a6-9844-b268276e8b20","content":"我的订单什么时候发货？"},"output":{"messageId":"01a0f6ea-1d5e-71db-a58d-23af46eb4c5d","content":"您好，订单已在今天下午出库，预计 2 天内送达。","toolCalls":[]},"stopReason":"end_turn","error":null,"createdAt":"2026-10-01T10:02:00.694Z","startedAt":"2026-10-01T10:02:01.039Z","completedAt":"2026-10-01T10:02:13.211Z"}}
```

`wait` 超出 1–60 返回 422，`errors[0].field` 为 `Prefer`。

### 异步：提交后轮询

不带上述两个头时立即返回 202，`Location` 指向这个 run，`Retry-After` 是建议的轮询间隔（秒）：

```bash
curl -s -i "$AGENTLOOM_API/agent-api/conversations/$CONV_ID/runs" \
  -H "Authorization: Bearer $AGENT_KEY" \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: order-42-msg-2' \
  -d '{"input":{"content":"能改地址吗？"}}'
```

```text
HTTP/1.1 202 Accepted
location: /api/v1/agent-api/conversations/01a0f6d7-d4cc-74e5-9d88-209f50963812/runs/01a0f6d9-d4a9-7c9c-ad97-1216b0f2ac4c
retry-after: 2
content-type: application/json; charset=utf-8

{"data":{"id":"01a0f6d9-d4a9-7c9c-ad97-1216b0f2ac4c","conversationId":"01a0f6d7-d4cc-74e5-9d88-209f50963812","status":"queued","agentVersionId":null,"input":{"messageId":"01a0f6d9-d4a6-79ba-9683-0ece141ffd9d","content":"能改地址吗？"},"output":null,"stopReason":null,"error":null,"createdAt":"2026-10-01T09:44:26.012Z","startedAt":null,"completedAt":null}}
```

```bash
export RUN_ID='<上一步的 data.id>'
curl -s -i "$AGENTLOOM_API/agent-api/conversations/$CONV_ID/runs/$RUN_ID" \
  -H "Authorization: Bearer $AGENT_KEY"
```

run 未结束时响应带 `Retry-After: 2`；`status` 变为 `completed`、`failed` 或 `cancelled` 后不再带该头，停止轮询。

### 防止重复提交

网络重试可能让同一句话发两次。给每次用户发言一个唯一的 `Idempotency-Key`（1–255 字符）：

- 同一 Key、同一请求体再次提交：返回第一次创建的那个 run（202），不新建 run。
- 同一 Key、不同请求体：422 `idempotency-key-reused`。
- 服务端保留幂等记录 24 小时。

```text
{"type":"https://agentloom.dev/errors/idempotency-key-reused","title":"Unprocessable Entity","status":422,"detail":"Idempotency-Key was already used with a different request body","instance":"/api/v1/agent-api/conversations/01a0f6d7-d4cc-74e5-9d88-209f50963812/runs"}
```

### 同一对话一次只跑一个 run

上一个 run 未结束时再提交，返回 409 `conversation-busy`，`activeRunId` 是正在运行的 run：

```text
HTTP/1.1 409 Conflict
content-type: application/problem+json; charset=utf-8

{"type":"https://agentloom.dev/errors/conversation-busy","title":"Conflict","status":409,"detail":"Conversation already has an active run","instance":"/api/v1/agent-api/conversations/01a0f6d7-d4cc-74e5-9d88-209f50963812/runs","activeRunId":"01a0f6dd-77b4-7025-a464-0787f602ada4"}
```

同一个 Key 同时处于 `queued`/`running` 的 run 数超过 `max_concurrent_runs` 时，返回 429 `concurrency-limit-exceeded`（带 `Retry-After`）：

```text
HTTP/1.1 429 Too Many Requests
retry-after: 5
{"type":"https://agentloom.dev/errors/concurrency-limit-exceeded","title":"Too Many Requests","status":429,"detail":"Concurrent run limit of this API key has been reached","instance":"/api/v1/agent-api/conversations/01a0f6de-7828-7560-9f73-7030c0d60b8a/runs"}
```

## 4. 断线后续读事件流

流式连接断开后，用最后收到的 SSE `id` 作为 `Last-Event-ID` 订阅 `GET …/runs/:runId/events`，服务端从该事件之后继续推送；不带该头则从第一条事件开始回放。

```bash
curl -s -N "$AGENTLOOM_API/agent-api/conversations/$CONV_ID/runs/$RUN_ID/events" \
  -H "Authorization: Bearer $AGENT_KEY" \
  -H 'Last-Event-ID: 1790848104391-1'
```

```text
id: 1790848104394-0
event: run.status
data: {"runId":"01a0f6dd-77b4-7025-a464-0787f602ada4","status":"queued","phase":"agent_initializing"}

id: 1790848104399-0
event: run.status
data: {"runId":"01a0f6dd-77b4-7025-a464-0787f602ada4","status":"running","phase":"running"}

id: 1790848104411-0
event: run.status
data: {"runId":"01a0f6dd-77b4-7025-a464-0787f602ada4","status":"running"}

id: 1790848107444-0
event: message.delta
data: {"runId":"01a0f6dd-77b4-7025-a464-0787f602ada4","index":0,"delta":"您好，订单已"}

id: 1790848110441-0
event: message.delta
data: {"runId":"01a0f6dd-77b4-7025-a464-0787f602ada4","index":1,"delta":"在今天下午出"}

id: 1790848113443-0
event: message.delta
data: {"runId":"01a0f6dd-77b4-7025-a464-0787f602ada4","index":2,"delta":"库，预计 2"}

id: 1790848116459-0
event: message.delta
data: {"runId":"01a0f6dd-77b4-7025-a464-0787f602ada4","index":3,"delta":" 天内送达。"}

id: 1790848116475-0
event: run.completed
data: {"run":{"id":"01a0f6dd-77b4-7025-a464-0787f602ada4","conversationId":"01a0f6d7-d4cc-74e5-9d88-209f50963812","status":"completed","agentVersionId":"01a0f6d7-6b49-77e7-b351-285895f9a97b","input":{"messageId":"01a0f6dd-77b2-70e9-87f6-f624995d1337","content":"帮我查一下物流单号"},"output":{"messageId":"01a0f6dd-a6f3-7c39-aefb-92934c7ee933","content":"您好，订单已在今天下午出库，预计 2 天内送达。","toolCalls":[]},"stopReason":"end_turn","error":null,"createdAt":"2026-10-01T09:48:24.362Z","startedAt":"2026-10-01T09:48:24.403Z","completedAt":"2026-10-01T09:48:36.465Z"}}
```

- `Last-Event-ID` 必须形如 `<毫秒>-<序号>`，否则 422。
- 事件在 run 结束后保留 1 小时；过期后订阅返回 410 `run-events-expired`，改用 `GET …/runs/:runId` 读取最终结果。
- 事件流只做加法：遇到不认识的 `event` 直接忽略。

| 事件 | `data` | 说明 |
| --- | --- | --- |
| `run.created` | `{ run }` | run 已创建 |
| `run.status` | `{ runId, status, phase? }` | `status` 为 `queued` 或 `running`；`phase` 依次可能为 `queued`、`preparing`、`sandbox_creating`、`agent_initializing`、`running` |
| `message.delta` | `{ runId, index, delta }` | 回复增量，按 `index` 顺序拼接 |
| `tool_call` | `{ runId, toolCallId, tool, status, error? }` | 工具调用状态变化；不含参数与结果 |
| `run.completed` / `run.failed` / `run.cancelled` | `{ run }` | 终态，流随即结束 |

## 5. 取消进行中的 run

```bash
curl -s -i -X POST "$AGENTLOOM_API/agent-api/conversations/$CONV_ID/runs/$RUN_ID/cancel" \
  -H "Authorization: Bearer $AGENT_KEY"
```

```text
HTTP/1.1 202 Accepted
location: /api/v1/agent-api/conversations/01a0f6d7-d4cc-74e5-9d88-209f50963812/runs/01a0f6de-2d70-771b-8812-1b831f3a84d0
content-type: application/json; charset=utf-8

{"data":{"id":"01a0f6de-2d70-771b-8812-1b831f3a84d0","conversationId":"01a0f6d7-d4cc-74e5-9d88-209f50963812","status":"running","agentVersionId":"01a0f6d7-6b49-77e7-b351-285895f9a97b","input":{"messageId":"01a0f6de-2d6f-70b8-8693-910ea92d690b","content":"把回复写长一点"},"output":null,"stopReason":null,"error":null,"createdAt":"2026-10-01T09:49:10.888Z","startedAt":"2026-10-01T09:49:10.920Z","completedAt":null}}
```

202 表示取消已受理，响应里的 `status` 可能仍是 `running`。几秒后再读这个 run：

```json
{"data":{"id":"01a0f6de-2d70-771b-8812-1b831f3a84d0","conversationId":"01a0f6d7-d4cc-74e5-9d88-209f50963812","status":"cancelled","agentVersionId":"01a0f6d7-6b49-77e7-b351-285895f9a97b","input":{"messageId":"01a0f6de-2d6f-70b8-8693-910ea92d690b","content":"把回复写长一点"},"output":null,"stopReason":"cancelled","error":null,"createdAt":"2026-10-01T09:49:10.888Z","startedAt":"2026-10-01T09:49:10.920Z","completedAt":"2026-10-01T09:49:12.968Z"}}
```

取消不结束对话，之后可以继续提交新 run。对已结束的 run 取消返回 409 `run-not-cancellable`。

## 6. 读取历史

| 请求 | 内容 | 排序 |
| --- | --- | --- |
| `GET /agent-api/conversations?externalUserId=&status=` | 当前 Key 创建的对话；`status` 为 `active`、`ended`、`failed` | `createdAt` 倒序 |
| `GET /agent-api/conversations/:conversationId` | 单个对话 | — |
| `GET /agent-api/conversations/:conversationId/messages` | `user` 与 `assistant` 消息 | `createdAt` 正序 |
| `GET /agent-api/conversations/:conversationId/runs` | 对话里的 run | `createdAt` 倒序 |

分页参数 `page`（默认 1）与 `pageSize`（默认 20，超过 100 按 100 处理）：

```bash
curl -s "$AGENTLOOM_API/agent-api/conversations/$CONV_ID/runs?pageSize=1" \
  -H "Authorization: Bearer $AGENT_KEY"
```

```json
{"data":[{"id":"01a0f6de-2d70-771b-8812-1b831f3a84d0","conversationId":"01a0f6d7-d4cc-74e5-9d88-209f50963812","status":"cancelled","agentVersionId":"01a0f6d7-6b49-77e7-b351-285895f9a97b","input":{"messageId":"01a0f6de-2d6f-70b8-8693-910ea92d690b","content":"把回复写长一点"},"output":null,"stopReason":"cancelled","error":null,"createdAt":"2026-10-01T09:49:10.888Z","startedAt":"2026-10-01T09:49:10.920Z","completedAt":"2026-10-01T09:49:12.968Z"}],"meta":{"page":1,"pageSize":1,"total":6}}
```

一个 Key 只能看到自己创建的对话；访问其他 Key 的对话返回 404 `agent-api-conversation-not-found`。

## 7. 结束对话

```bash
curl -s -X POST "$AGENTLOOM_API/agent-api/conversations/$CONV_ID/end" \
  -H "Authorization: Bearer $AGENT_KEY"
```

```json
{"data":{"id":"01a0f6d7-d4cc-74e5-9d88-209f50963812","title":"订单咨询","status":"ended","externalUserId":"user-42","metadata":{"channel":"web"},"createdAt":"2026-10-01T09:42:14.982Z","updatedAt":"2026-10-01T09:49:23.895Z"}}
```

结束是幂等的，进行中的 run 会被取消。之后再提交 run 返回 409 `conversation-ended`。没有显式结束的对话在空闲 24 小时后由服务端定时任务结束。

## 8. 吊销 Key

```bash
export KEY_ID='<第 1 步响应的 data.id>'
curl -s -o /dev/null -w '%{http_code}\n' -X DELETE \
  "$AGENTLOOM_API/agent-definitions/$AGENT_ID/api-keys/$KEY_ID" \
  -H "Authorization: Bearer $JWT"
```

```text
204
```

之后用这个 Key 的任何请求都返回 401：

```json
{"type":"https://agentloom.dev/errors/agent-api-key-invalid","title":"Unauthorized","status":401,"detail":"Agent API key is invalid, revoked or expired","instance":"/api/v1/agent-api/agent"}
```

## run 对象

| 字段 | 说明 |
| --- | --- |
| `id`、`conversationId` | UUID |
| `status` | `queued` → `running` → `completed` / `failed` / `cancelled` |
| `agentVersionId` | 实际执行的 Agent 版本；开始执行前为 `null` |
| `input` | `{ messageId, content }` |
| `output` | 结束前为 `null`；完成后为 `{ messageId, content, toolCalls[] }`，`toolCalls` 每项为 `{ id, tool, status }` |
| `stopReason` | `end_turn`、`max_tokens`、`cancelled` 或 `null` |
| `error` | `failed` 时为 `{ type, title, detail? }`，例如 `…/run-failed`；执行进程丢失时为 `…/run-worker-lost` |
| `createdAt`、`startedAt`、`completedAt` | ISO 8601 时间 |

## 错误速查

| 状态码 | `type` 后缀 | 处理 |
| --- | --- | --- |
| 401 | `agent-api-key-invalid` | Key 缺失、无效、已吊销或已过期；换 Key |
| 404 | `agent-api-conversation-not-found` / `agent-api-run-not-found` | ID 错误或不属于当前 Key |
| 409 | `agent-not-published` / `agent-archived` | Agent 未发布或已归档 |
| 409 | `conversation-busy` | 等 `activeRunId` 结束后再提交 |
| 409 | `conversation-ended` | 新建对话 |
| 409 | `run-not-cancellable` | run 已结束，无需取消 |
| 410 | `run-events-expired` | 改读 `GET …/runs/:runId` |
| 422 | `validation-error` | 请求体、`Prefer`、`Idempotency-Key` 或 `Last-Event-ID` 不合法，看 `errors[]` |
| 422 | `idempotency-key-reused` | 换一个 `Idempotency-Key` |
| 429 | `concurrency-limit-exceeded` | 按 `Retry-After` 等待，或调大 `max_concurrent_runs` |
| 429 | `rate-limit-exceeded` | 按 `Retry-After` 等待，或调大 `rate_limit_per_minute`（见 [限流](/api/#限流)） |
| 503 | `run-dispatch-failed` | run 未能派发，已标记 `failed`；按 `Retry-After` 重新提交 |
| 503 | `sandbox-maintenance` | 沙箱运行时维护中，稍后重试 |

设计背景见 [ADR-0001 Agent 对外 API](/dev/decisions/0001-agent-external-api)。
