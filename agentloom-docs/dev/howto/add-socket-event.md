---
docType: howto
---

# 新增 Socket 事件

要让客户端实时收到一种新的推送，需要依次改契约、server 发送方、网关和客户端，最后再生成事件清单。`/execution` 命名空间有一套带 `eventId` 与回放的信封机制，其余命名空间直接在网关里 emit；按你要改的命名空间选一节。下文的事件名 `execution.node.widget-progress`、`widget:updated` 是示例名。

前置条件：了解事件从 worker 到客户端的路径（[系统架构](/dev/architecture#实时事件如何到达客户端)），以及现有命名空间与事件名（[实时通信](/dev/server/realtime)）。

## `/execution` 事件

### 1. 在契约中定义事件名与载荷

`/execution` 与 `/agent-conversation` 的 wire 格式只在 `agentloom-contracts/src/execution-events.ts` 定义：

1. 把事件名加入 `EXECUTION_EVENT_NAMES`。命名沿用 `execution.<对象>.<动作>`，wire 字段一律 camelCase。
2. 定义载荷的 Zod schema，加入同文件的 `EXECUTION_EVENT_PAYLOAD_SCHEMAS` 与 `ExecutionEventPayloadMap`。
3. 在 `agentloom-contracts/fixtures/execution-events/` 下加一份该事件的 JSON 样例，让 `agentloom-contracts/src/fixtures.test.ts` 覆盖它。

```bash
pnpm --filter @agentloom/contracts test
```

`Test Files` 一行全部 `passed`。

### 2. 在 server 中给事件一个具名常量

`agentloom-server/src/modules/execution/types/execution-event.types.ts` 只 re-export 契约类型，并维护具名常量表 `ExecutionEventName`（`satisfies` 契约中的取值，拼错会编译失败）。在表中加一项，例如 `NODE_WIDGET_PROGRESS`。

### 3. 经 EventBridgeService 发出

worker 侧不直接操作 Socket.IO。在 `agentloom-server/src/modules/execution/services/event-bridge.service.ts` 中仿照 `emitOutputChunk` 加一个 `emitXxx` 方法：

- `createEnvelope(...)` 生成带单调递增 `eventId` 的信封；
- `broadcast(...)` 把信封放入回放缓冲，并以 EventEmitter2 发出 `execution.gateway.broadcast` 意图；需要绕过背压队列立即送达时用 `broadcastImmediately(...)`；
- 如果 server 内部还有别的模块要监听（如 `/agent-conversation` 网关、审计），再以事件名本身 `eventEmitter.emit(ExecutionEventName.X, ...)` 发一次进程内事件。

在业务代码（执行器、worker）中注入 `EventBridgeService` 调用新方法。

### 4. 网关无需改动

`agentloom-server/src/modules/execution/execution.gateway.ts` 用 `@OnEvent` 订阅广播意图，按信封的 `event` 字段推送到执行房间，新事件自动经过背压队列与 `lastEventId` 回放。若 `/agent-conversation` 也要转发该事件，在 `agentloom-server/src/modules/agent-execution/agent-conversation.gateway.ts` 中加一个 `@OnEvent(ExecutionEventName.X)` 处理器。

### 5. 客户端消费

- Studio：在 `agentloom-studio/src/features/execution/hooks/useExecutionSocket.ts` 中 `socket.on(ExecutionEventName.X, handler)`，并在 `agentloom-studio/src/features/execution/stores/executionStore.ts` 中加对应的状态更新。
- Mobile：在 `agentloom_mobile/lib/features/execution/services/execution_socket_service.dart` 中用 `_bindEnvelopeEvent(socket, '<事件名>', handler)` 绑定；Dart 模型字段保持 camelCase，不加 `FieldRename.snake`。

在 Studio 中运行一个会触发该事件的工作流，浏览器开发者工具的 WebSocket 帧中出现新事件名，执行详情随之更新。

## 其他命名空间（`/knowledge`、`/notification`、`/memory`、`/agent-conversation`）

这些网关在各自模块内直接推送：

1. server→client 事件：在对应 `*.gateway.ts` 中用字符串字面量或网关内的事件名常量调用 `.emit('widget:updated', payload)`。
2. client→server 事件：在网关中加 `@SubscribeMessage('…')` 处理器，并按该网关现有方式做鉴权与房间校验。
3. 客户端：在 Studio 对应的 socket hook（清单见 [状态管理](/dev/studio/state#socket-io-连接)）中 `socket.on(...)`，事件通常触发 TanStack Query 失效而不是直接写 store。

事件名要写成字面量或网关内的常量：生成器靠静态扫描 `.emit()`、`@SubscribeMessage()` 与事件名常量收集清单，运行时拼接的名字不会进入文档。

## 生成事件清单

在仓库根执行：

```bash
pnpm docs:gen
```

`agentloom-docs/_generated/socket-events.md` 中出现新事件一行（命名空间、方向、事件、来源文件）。`/execution` 的行取自 `EXECUTION_EVENT_NAMES`，其余取自网关源码。提交时连同 `_generated/` 一起提交；事件语义需要解释时，补充到 [实时通信](/dev/server/realtime)。
