---
docType: explanation
---

# 0005 A2A 入站适配：复用 Agent 对外 API 的薄协议层

- 状态：已实施
- 日期：2026-10-15

端点、方法、错误码见 [A2A 入站接入](/api/a2a)。本篇只记录为什么这样设计。

## 背景

其他 Agent 平台开始以 [A2A 协议](https://a2a-protocol.org/latest/specification/) 1.0 互相调用。AgentLoom 已有一套给第三方调用已发布 Agent 的接口（[ADR-0001](/dev/decisions/0001-agent-external-api)）。决策时的相关事实：

| # | 事实 | 证据 |
| --- | --- | --- |
| F1 | Agent 对外 API 以 `alak_` Key 鉴权（`@Public()` + `AgentApiKeyGuard`），Key 绑定单个 Agent，带每分钟限流与并发 run 上限 | `agentloom-server/src/modules/agent-api/agent-api-key.guard.ts`、`agentloom-server/src/common/guards/custom-throttler.guard.ts` |
| F2 | 一次调用 = 一个 `agent_api_runs` 行，属于一个 API 来源的对话；同一对话同时至多一个活跃 run | `agentloom-server/src/database/schema/agent-api-runs.schema.ts` |
| F3 | run 事件写入每 run 一条的 Redis Stream，任一实例可从头回放直到终态后 1 小时 | `agentloom-server/src/modules/agent-api-runtime/agent-api-event-stream.service.ts` |
| F4 | `AgentApiService` 已提供建对话、建 run（含幂等键）、等待、取消、读取，全部自管短租户事务 | `agentloom-server/src/modules/agent-api/agent-api.service.ts` |
| F5 | API 来源对话不注册需要人工审批的工具，run 不会停在"等待用户输入" | ADR-0001「人工审批」 |
| F6 | A2A 1.0 JSON-RPC 方法为 `SendMessage/SendStreamingMessage/GetTask/ListTasks/CancelTask/SubscribeToTask`、四个推送配置方法与 `GetExtendedAgentCard`；任务状态 `TASK_STATE_*`；流式响应为 `task/message/statusUpdate/artifactUpdate` 四选一 | A2A 规范 1.0 |

## 决策

| 议题 | 选择 | 被否决的方案及原因 |
| --- | --- | --- |
| 方向 | 只做入站：AgentLoom 作为 A2A 服务端 | **同时做出站**（工作流调用外部 A2A Agent）：需要新的节点类型、外部凭证管理与回调，和入站没有共享代码，单独立项 |
| 执行与持久化 | 新模块 `agentloom-server/src/modules/a2a/` 只做协议映射，全部调用 `AgentApiService`；唯一新增服务方法 `findRunById`（A2A 的 taskId 不携带对话 id） | **独立的 A2A 任务表与执行路径**：与 run 重复建模，限流、并发、清扫、事件镜像都要再做一遍 |
| 标识映射 | `contextId` = 对话 id，`taskId` = run id；`messageId` 作为 run 的幂等键 `a2a:<messageId>` | **taskId 映射到对话**：一个对话有多次调用，无法表达每次调用的终态与产物 |
| 鉴权 | 复用 `alak_` Key，路径中的 Agent 必须与 Key 绑定的 Agent 一致；Agent Card 公开并声明 Bearer 方案 | **OAuth2 / OpenID Connect**：平台没有面向第三方的授权服务器；新凭证类型会绕开既有限流与并发上限 |
| 协议绑定 | 仅 JSON-RPC；每个 Agent 一个 RPC 端点，Agent Card 按 Agent 定义暴露 | **gRPC / HTTP+JSON 绑定**：多一套路由与编码，没有调用方要求 |
| 任务续写 | 不支持 `message.taskId`；同一 context 的消息串行（沿用对话至多一个活跃 run） | **把后续消息并入进行中的任务**：对应 `INPUT_REQUIRED` 语义，而 API 对话没有需要用户输入的中间态（F5） |
| 同步语义 | `SendMessage` 默认阻塞等待，上限 120 秒，到期返回当前状态；`returnImmediately` 立即返回 | **无上限阻塞**：沙箱回合可能长于 nginx 的 300 秒读超时，客户端分不清超时与失败 |
| 流式 | SSE 每帧一个 JSON-RPC 响应；从 run 事件流开头读取并映射；增量文本放在 `artifactId: "response"`，终态时另发完整 artifact（id 为 assistant 消息 id，与 `GetTask` 一致） | **只发增量**：客户端拼接结果可能与持久化内容不一致；**改写 run 事件流格式**：会影响 Agent 对外 API 的现有客户端 |
| 不支持项 | `ListTasks`、`GetExtendedAgentCard` 返回 `-32004`，推送配置返回 `-32003` | 列表需要跨对话分页与过滤，推送需要出站回调与凭证存储，均无调用方需求 |
| 文档位置 | 协议端点不进入 OpenAPI（`@ApiExcludeController()`），对外约定写在 `agentloom-docs/api/a2a.md` | **进入 OpenAPI**：JSON-RPC 单端点多方法，OpenAPI 描述不出方法级参数与错误，生成的客户端也无用 |

## 后果

- A2A 调用与 Agent 对外 API 共享同一把 Key 的配额与并发上限，运维侧没有新的限流维度。
- run 状态机、事件镜像、清扫任务的改动会直接改变 A2A 行为；映射集中在 `agentloom-server/src/modules/a2a/a2a-mapper.ts` 与 `agentloom-server/src/modules/a2a/a2a-sse.util.ts`。
- 新环境变量 `APP_PUBLIC_BASE_URL` 决定 Agent Card 中的 RPC 地址；未设置时取请求的协议与 `Host`，部署在反向代理后需要正确的 `X-Forwarded-*` 与 `APP_TRUST_PROXY_HOPS`。
- Agent Card 端点无鉴权，以 Agent ID 精确读取，只暴露已发布 Agent 的名称、描述、版本号与组织名。
- 请求体除 `application/json` 外也接受 `application/a2a+json`（`agentloom-server/src/main.ts` 注册解析器）。
- A2A 规范升级时在 [上游追踪](/dev/upstreams) 更新审阅版本；`A2A-Version` 只接受 `1.0`。

## 确认方式

- 单测：`agentloom-server/src/modules/a2a/__tests__/`（状态与 Agent Card 映射、消息校验与 contextId 复用、方法分派与错误码、SSE 帧编码与终态关闭）。

```bash
pnpm --filter agentloom-server test src/modules/a2a src/modules/agent-api
```

- 运行中的实例：按 [A2A 入站接入](/api/a2a) 用 `curl` 读取 Agent Card、调用 `SendMessage`/`SendStreamingMessage`/`GetTask`/`CancelTask`，以及 `A2A-Version: 0.3` 得到 `-32009`。
