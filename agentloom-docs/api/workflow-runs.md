---
docType: reference
---

# 启动工作流执行

通过 REST API 启动一次工作流执行，并轮询结果。端点的完整字段见 [REST 参考](/api/rest)，凭证与错误格式见 [API 约定](/api/)。

本页输出来自本地 `agentloom-server` 的实际运行。示例工作流已发布，输入参数声明了一个必填文本字段 `question`。

## 端点

| 项 | 值 |
| --- | --- |
| 地址 | `POST /api/v1/workflow-definitions/:workflowId/run`（`POST /api/v1/workflows/:workflowId/run` 等价） |
| 凭证 | 用户会话 JWT 或平台 API Token，需要 `workflow:run` 权限 |
| 成功响应 | `202`，`data` 为新建的执行（`status: "pending"`） |
| 前提 | 工作流已发布（否则 409 `workflow-not-published`）、未归档（否则 409 `workflow-archived`） |

## 请求体

请求体是 JSON 对象，只接受下表字段；写错或多出的字段返回 422 `validation-error`，不会被忽略。每个字段也接受对应的 snake_case 写法（`input_params`、`schema_version`、`launch_source`）。

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `inputParams` | 对象 | 否 | 启动参数，键为输入参数的字段 ID。工作流定义了输入参数时，未声明的键、缺少的必填字段、不满足校验的值都返回 422 `workflow-launch-input-invalid`，`errors[].field` 形如 `inputParams.<字段 ID>` |
| `schemaVersion` | 正整数 | 工作流定义了输入参数时必填 | 调用方依据的输入参数版本，取 `GET /workflow-definitions/:id/input-schema` 返回的 `version`。缺少时返回 422（`schemaVersion 是必填字段`），与当前版本不一致时返回 409 `workflow-launch-schema-version-mismatch` |
| `launchSource` | `"api"` / `"mobile"` / `"web-studio"` | 否 | 启动来源。`web-studio` 运行当前画布草稿（Studio「运行」按钮使用），其他取值或不传时运行当前发布版本 |

工作流没有定义输入参数时可以不传 `schemaVersion`，`inputParams` 原样作为触发数据。

## schemaVersion 从哪里来

输入参数的 `version` 由服务端维护：

- 通过 `PATCH /workflow-definitions/:id` 保存 `inputSchema` 时，请求中的 `version` 会被忽略；字段等内容与已保存的不同时，服务端在已保存的版本上加 1，内容不变时版本不变。
- 没有保存过输入参数的工作流按版本 1（无字段）计算，所以第一次保存字段后版本是 2。
- 启动执行时按工作流**当前保存**的输入参数校验，保存即生效，不需要重新发布。

因此调用前先读取当前版本，不要沿用自己写入时的值：

```bash
curl -s https://agentloom.ling.plus/api/v1/workflow-definitions/$WF_ID/input-schema \
  -H "X-Api-Key: $AGENTLOOM_API_TOKEN"
```

```json
{"data":{"version":2,"collectionMode":"form","fields":[{"id":"question","type":"text","label":"问题","required":true}]}}
```

`schemaVersion` 的作用是让调用方在输入参数被修改后得到明确的 409，而不是用旧的参数结构启动执行。收到 409 时，响应的 `currentSchemaVersion` 是当前版本，按新的字段定义调整 `inputParams` 后重试。

## 示例

```bash
curl -s -w '\n%{http_code}\n' -X POST \
  https://agentloom.ling.plus/api/v1/workflow-definitions/$WF_ID/run \
  -H "X-Api-Key: $AGENTLOOM_API_TOKEN" -H 'Content-Type: application/json' \
  -d '{"inputParams":{"question":"AgentLoom 注册时密码有什么要求？"},"schemaVersion":2}'
```

```text
{"data":{"id":"01a15585-7efa-745a-aaa2-5a469b80e11d","workflowDefinitionId":"01a15581-315d-7917-8d1c-eacb09d18d69","workflowVersionId":"01a15581-3189-730e-804d-92cfcf29b949","definitionSource":"version","status":"pending","triggerType":"manual","inputParams":{"_meta":{"launchConfig":{"workflowId":"01a15581-315d-7917-8d1c-eacb09d18d69","launchSource":null,"schemaVersion":2,"collectionMode":"form","resolvedInputs":{"question":"AgentLoom 注册时密码有什么要求？"},"unresolvedFieldIds":[]}},"question":"AgentLoom 注册时密码有什么要求？"}, …}}
202
```

`inputParams` 中的 `_meta` 由服务端写入，记录本次使用的输入参数版本与解析结果；其余键就是触发节点「触发数据」端口输出的值。

用 `data.id` 轮询 `GET /api/v1/executions/:id`，`status` 变为 `completed`、`failed` 或 `cancelled` 时结束；`steps[]` 中是各节点的状态、输出（`result`）与错误（`errorMessage`）。

## 常见错误

同一个工作流上的几种错误请求：

| 请求体 | 状态码 | 响应要点 |
| --- | --- | --- |
| `{"inputs":{"question":"x"}}` | 422 | `validation-error`，`errors: [{"field":"","message":"Unrecognized key: \"inputs\""}]` |
| `{"inputParams":{"question":"x"}}` | 422 | `workflow-launch-input-invalid`，`errors: [{"field":"schemaVersion","message":"schemaVersion 是必填字段"}]` |
| `{"inputParams":{"question":"x"},"schemaVersion":1}` | 409 | `workflow-launch-schema-version-mismatch`，`currentSchemaVersion: 2`、`providedSchemaVersion: 1` |
| `{"inputParams":{"q":"x"},"schemaVersion":2}` | 422 | `workflow-launch-input-invalid`，`errors: [{"field":"inputParams.q","message":"该字段不存在于当前输入契约中"}]` |

全部错误类型见 [错误参考](/guide/troubleshooting/errors)。

## 相关

- [输入参数](/guide/workflows/input-parameters)：在 Studio 中定义字段
- [让外部系统启动工作流](/api/webhooks)：Webhook 与 API 事件触发时不需要 `schemaVersion`，契约外字段会被丢弃
- [运行与监控](/guide/workflows/running)
