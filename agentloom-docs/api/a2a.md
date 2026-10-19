---
docType: reference
---

# A2A 入站接入

AgentLoom 以 [A2A 协议](https://a2a-protocol.org/latest/specification/) 1.0 的 JSON-RPC 绑定对外暴露已发布的 Agent：其他 Agent 平台或 A2A 客户端可以发现某个 Agent 的 Agent Card，并用 `SendMessage` 等方法与它对话。适配层只是 [Agent 对外 API](/api/agent-api) 的另一种协议外壳——同一把 Key、同一套对话与 run、同样的限流与并发上限。设计取舍见 [ADR-0005 A2A 入站适配](/dev/decisions/0005-a2a-inbound)。

本页只覆盖入站：AgentLoom 作为 A2A 服务端。由 AgentLoom 主动调用外部 A2A Agent 不在当前范围内。

## 前提

- Agent 已发布。未发布或已归档的 Agent 读取 Agent Card 返回 404，RPC 调用返回 `-32004`。
- 已为该 Agent 创建 Agent API Key（`alak_…`），创建方式见 [Agent 对外 API · 创建 Agent API Key](/api/agent-api#_1-创建-agent-api-key)。一把 Key 只能调用它绑定的 Agent。
- 自托管部署时设置 `APP_PUBLIC_BASE_URL` 为对外访问的站点基址（如 `https://agentloom.example.com`），Agent Card 中的 RPC 地址以它为前缀；不设置时取请求的协议与 `Host`，经反向代理访问时可能得到内部地址。

## 端点

| 用途 | 方法与路径 | 鉴权 |
| --- | --- | --- |
| Agent Card | `GET /api/v1/a2a/agents/{agentId}/.well-known/agent-card.json` | 无（公开） |
| JSON-RPC | `POST /api/v1/a2a/agents/{agentId}/rpc` | `Authorization: Bearer alak_…` |

- RPC 请求体为 JSON-RPC 2.0 对象，`Content-Type` 可以是 `application/json` 或 `application/a2a+json`；响应 `Content-Type: application/json`。
- 可选请求头 `A2A-Version`：带上时必须是 `1.0`，否则返回 `-32009`。
- 鉴权失败（Key 缺失、无效、吊销或过期）返回 401、每分钟请求频率超限返回 429（带 `Retry-After`），两者都由 HTTP 层以 `application/problem+json` 返回，不是 JSON-RPC 错误。

## Agent Card

```bash
curl -s "$AGENTLOOM_API/a2a/agents/$AGENT_ID/.well-known/agent-card.json"
```

| 字段 | 取值 |
| --- | --- |
| `name` / `description` | Agent 名称与描述（描述为空时用名称） |
| `supportedInterfaces[0]` | `{ url: "<基址>/api/v1/a2a/agents/{agentId}/rpc", protocolBinding: "JSONRPC", protocolVersion: "1.0" }` |
| `provider.organization` | Agent 所属组织名 |
| `version` | 已发布版本的版本号（字符串） |
| `capabilities` | `streaming: true`、`pushNotifications: false`、`extendedAgentCard: false` |
| `securitySchemes.agentApiKey` | `httpAuthSecurityScheme`：`scheme: "Bearer"`、`bearerFormat: "alak_<64 hex>"` |
| `defaultInputModes` / `defaultOutputModes` | `["text/plain"]` |
| `skills` | 一项，`id` 为 Agent ID，名称与描述同 Agent |

## 概念映射

| A2A | AgentLoom |
| --- | --- |
| `contextId` | Agent 对外 API 的对话 id |
| `taskId`（Task `id`） | 一次 run 的 id（`agent_api_runs.id`） |
| 用户 `Message` | run 的输入消息；`messageId` 作为幂等键，重发同一条消息得到同一个 Task |
| Task 的 `artifacts` | 仅 `TASK_STATE_COMPLETED` 时有一项：`artifactId` 为 assistant 消息 id，`name: "response"`，内容为回复全文 |
| Task 的 `history` | 本次 run 的用户消息与（如已产生的）Agent 回复，至多两条 |
| Task 的 `metadata` | `agentVersionId`、`stopReason`、`error` |

任务状态由 run 状态映射：

| run 状态 | `status.state` |
| --- | --- |
| `queued` | `TASK_STATE_SUBMITTED` |
| `running` | `TASK_STATE_WORKING` |
| `completed` | `TASK_STATE_COMPLETED` |
| `failed` | `TASK_STATE_FAILED` |
| `cancelled` | `TASK_STATE_CANCELED` |

`status.timestamp` 取结束时间，其次开始时间，最后创建时间。

## 方法

### SendMessage

```bash
curl -s -X POST "$AGENTLOOM_API/a2a/agents/$AGENT_ID/rpc" \
  -H "Authorization: Bearer $AGENT_KEY" \
  -H 'A2A-Version: 1.0' \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"SendMessage","params":{"message":{"messageId":"m-1","role":"ROLE_USER","parts":[{"text":"用一句话介绍你自己"}]}}}'
```

响应 `result` 为 `{ "task": Task }`。

- `message.role` 必须是 `ROLE_USER`；`parts` 只接受 `text`，多个文本 part 以换行拼接，拼接后 1–100000 字符。含 `raw`/`url`/`data` part 时返回 `-32005`。
- 不带 `message.contextId` 时新建对话（对话与任务在同一事务里创建）；带上时继续该对话（必须是同一把 Key 创建的对话，否则 `-32602`）。
- 重放：`messageId` 是同一把 Key 范围内的幂等键。同一 `messageId`、同样内容与同样的 `contextId`（或同样不带 `contextId`）重发，返回首次创建的 Task（同一 `id` 与 `contextId`），不会新建对话或任务；并发重发同样只产生一个对话与一个任务。同一 `messageId` 换了内容或换了 `contextId`（包括首次不带、重发时带上首次返回的 `contextId`）视为不同请求，返回 `-32602`（`message` 为 `messageId was already used with different content or contextId`）。`SendStreamingMessage` 重放时从该任务事件流的开头推送。
- 不支持 `message.taskId`（续写既有任务），返回 `-32004`；继续对话请带 `contextId` 发新消息。
- 同一对话已有进行中的任务时返回 `-32004`（`data.activeRunId` 为进行中任务的 id）。
- 默认阻塞等待任务结束，最长 120 秒；到期仍未结束时返回当前状态（可能是 `TASK_STATE_SUBMITTED` 或 `TASK_STATE_WORKING`），之后用 `GetTask` 轮询或 `SubscribeToTask` 订阅。
- `configuration.returnImmediately: true` 时不等待，立即返回 `TASK_STATE_SUBMITTED` 的 Task。
- `configuration.historyLength` 控制返回的 `history` 条数，`0` 表示不返回。

### SendStreamingMessage

参数同 `SendMessage`，响应为 `text/event-stream`。每个 SSE 帧只有一行 `data:`，内容是一个 JSON-RPC 响应（`id` 回显请求 id），`result` 为以下四种之一：

| 顺序 | `result` | 说明 |
| --- | --- | --- |
| 1 | `{ task }` | 当前 Task（通常为 `TASK_STATE_SUBMITTED`） |
| 2 | `{ statusUpdate }`，`status.state = TASK_STATE_WORKING` | 开始执行，只发一次 |
| 3… | `{ artifactUpdate }`，`artifact.artifactId = "response"` | 回复的增量文本；第一块 `append: false`，之后 `append: true` |
| 终态前 | `{ artifactUpdate }`，`lastChunk: true` | 仅成功时：完整回复，`artifactId` 为 assistant 消息 id，与 `GetTask` 的 artifact 一致 |
| 最后 | `{ statusUpdate }`，终态 | `COMPLETED` / `FAILED` / `CANCELED`；失败时 `metadata.error` 带错误；随后服务端关闭连接 |

增量帧只用于实时展示；以最后的完整 artifact 或 `GetTask` 的结果为准。工具调用不外发。空闲时每 15 秒发送一行 `: ping` 注释保持连接。

### GetTask

```json
{"jsonrpc":"2.0","id":2,"method":"GetTask","params":{"id":"<taskId>","historyLength":1}}
```

`result` 为 Task。任务不存在或不是当前 Key 创建的返回 `-32001`。

### CancelTask

```json
{"jsonrpc":"2.0","id":3,"method":"CancelTask","params":{"id":"<taskId>"}}
```

`result` 为取消受理后的 Task。排队中的任务立即变为 `TASK_STATE_CANCELED`；执行中的任务由执行进程中止，最终状态以后续 `GetTask` 为准。已取消的任务重复取消直接返回；已完成或已失败的任务返回 `-32002`。取消不结束对话。

### SubscribeToTask

```json
{"jsonrpc":"2.0","id":4,"method":"SubscribeToTask","params":{"id":"<taskId>"}}
```

对未结束的任务返回与 `SendStreamingMessage` 相同格式的 SSE 流，从任务开始处回放；已结束的任务返回 `-32004`，请改用 `GetTask`。

### 不支持的方法

| 方法 | 错误 |
| --- | --- |
| `ListTasks`、`GetExtendedAgentCard` | `-32004` |
| `CreateTaskPushNotificationConfig`、`GetTaskPushNotificationConfig`、`ListTaskPushNotificationConfigs`、`DeleteTaskPushNotificationConfig` | `-32003` |
| 其他方法名（含 0.3 的 `message/send` 等） | `-32601` |

`TASK_STATE_INPUT_REQUIRED`、`TASK_STATE_AUTH_REQUIRED` 不会出现：需要人工审批的工具不对 API 来源的对话开放。

## 错误

JSON-RPC 错误以 HTTP 200 返回（并发超限除外）：

| `error.code` | 含义 | 典型原因 |
| --- | --- | --- |
| `-32700` | Parse error | 请求体不是合法 JSON（`id` 为 `null`） |
| `-32600` | Invalid Request | 请求体不是 JSON-RPC 2.0 对象；Key 不属于路径中的 Agent |
| `-32601` | Method not found | 方法名未知 |
| `-32602` | Invalid params | `params` 校验失败（`data` 为 `google.rpc.BadRequest`，列出 `fieldViolations`）；`contextId` 不存在；消息文本为空或过长；`messageId` 被复用于不同内容 |
| `-32603` | Internal error | 服务端错误；沙箱维护模式、派发失败等可预期拒绝时 `data.type` 为对应的 problem type |
| `-32001` | TaskNotFound | 任务不存在或不属于当前 Key |
| `-32002` | TaskNotCancelable | 任务已完成或已失败 |
| `-32003` | PushNotificationNotSupported | 调用了推送通知配置方法 |
| `-32004` | UnsupportedOperation | 不支持的方法或参数；Agent 未发布或已归档；对话已结束；对话有进行中的任务；订阅已结束的任务；Key 的并发 run 上限已满（此时 HTTP 429 并带 `Retry-After`） |
| `-32005` | ContentTypeNotSupported | 消息含非文本 part |
| `-32009` | VersionNotSupported | `A2A-Version` 不是 `1.0` |

请求频率与并发上限与 Agent 对外 API 共用同一把 Key 的配额，见 [Agent 对外 API](/api/agent-api)。
