---
docType: explanation
---

# 状态管理

Studio 的一份数据应该放在 TanStack Query、Zustand、URL 还是 socket 事件里，冲突时以谁为准？本页解释这套分工，以及 REST 客户端、查询缓存与 Socket.IO 连接的实际行为。

## 分工规则

| 数据 | 放在哪里 | 原因 |
| --- | --- | --- |
| 服务端实体（工作流、Agent、知识库、通知列表……） | TanStack Query | 缓存、失效与重新请求由一处负责，组件不各自持有副本 |
| 本地或瞬态状态（画布草稿、执行实时状态、多选、弹层开关） | Zustand store | 只存在于浏览器、频繁更新、不需要和服务端对账 |
| 列表的筛选、排序、分页 | URL search params | 刷新与分享链接后状态不丢 |
| 运行中的执行、对话、知识库文档状态 | socket 事件写入 store 或触发查询失效 | 推送比轮询及时，且有 `lastEventId` 回放 |

REST 快照只在进入页面时灌入 store 一次，之后由 socket 事件推进，不被后续 refetch 覆盖（见下文「快照只灌入一次」）。

## Zustand store

以下清单由 `grep -rE 'export const use\w+Store\s*=\s*create' agentloom-studio/src` 得出。所有 store 都包了 `devtools` 与 `immer`；需要在 React 之外按字段订阅的 store 另加 `subscribeWithSelector`；只有沙箱预设持久化到 localStorage。

| Store | 文件 | 中间件 | 内容 |
| --- | --- | --- | --- |
| `useCanvasStore` | `agentloom-studio/src/features/canvas/stores/canvasStore.ts` | devtools、subscribeWithSelector、immer | 工作流画布草稿，见 [画布](/dev/studio/canvas) |
| `useAgentCanvasStore` | `agentloom-studio/src/features/agent-canvas/stores/agent-canvas.store.ts` | devtools、subscribeWithSelector、immer | Agent 编排画布草稿 |
| `useAgentConversationStore` | `agentloom-studio/src/features/agent-conversation/stores/agent-conversation.store.ts` | devtools、subscribeWithSelector、immer | 对话的实时消息流与 `/agent-conversation` 连接 |
| `useExecutionStore` | `agentloom-studio/src/features/execution/stores/executionStore.ts` | devtools、subscribeWithSelector、immer | 执行的节点实时状态与最近事件 |
| `useAuthStore` | `agentloom-studio/src/features/auth/stores/auth.store.ts` | devtools、subscribeWithSelector、immer | Supabase 会话、用户、租户、是否需要引导；把 access token 同步到 localStorage 的 `auth_token` |
| `useEvidenceUiStore` | `agentloom-studio/src/features/evidence/stores/evidenceUiStore.ts` | devtools、subscribeWithSelector、immer | 证据面板与文档查看器的界面状态 |
| `useAgentStore` | `agentloom-studio/src/features/agent/stores/agentStore.ts` | devtools、immer | Agent 列表多选 |
| `useWorkflowStore` | `agentloom-studio/src/features/workflow/stores/workflowStore.ts` | devtools、immer | 工作流列表多选 |
| `useNotificationStore` | `agentloom-studio/src/features/notification/stores/notificationStore.ts` | devtools、immer | 只有通知下拉框开关；未读数与列表在 TanStack Query 中 |
| `useSandboxPresetStore` | `agentloom-studio/src/features/sandbox/stores/sandboxPresetStore.ts` | devtools、persist、immer | 沙箱资源预设，持久化键 `agentloom-sandbox-presets` |

## REST 客户端

`agentloom-studio/src/shared/api/client.ts` 导出 ky 实例 `apiClient`：

- 前缀取 `VITE_API_BASE_URL`，未设置时为 `/api/v1`。
- `beforeRequest` 只做一件事：从 localStorage 的 `auth_token` 读出 token，设置 `Authorization: Bearer`。
- 响应 401 时重试一次；`beforeRetry` 调用 `supabase.auth.refreshSession()` 换新 token，失败则登出并跳转 `/login`。
- `afterResponse` 把 JSON 响应体的键从 snake_case 转为 camelCase。
- **请求体不做全局转换。** 需要 snake_case 的端点在调用处用 `toSnakeBody()` 显式转换；只接受 camelCase 的端点直接发送。例如 `agentloom-studio/src/features/workflow/api/workflowMutations.ts` 的 `PATCH workflow-definitions/:id` 注释写明 server 的 strict DTO 只接受 camelCase，转换后合法字段会变成未知键并返回 422。新增请求前先看对应 server DTO 的字段命名。

## 查询缓存

全局 `QueryClient` 定义在 `agentloom-studio/src/shared/api/queryClient.ts`：查询 `staleTime` 30 秒、失败重试 1 次、窗口聚焦不自动 refetch；mutation 不重试。

每个 feature 用 key 工厂组织 query key，层级为 `all → lists → list(filters) → details → detail(id)`，失效时可以按层级整批或精确失效。以 `agentloom-studio/src/features/workflow/api/workflowKeys.ts` 为例：

```ts
export const workflowKeys = {
  all: ['workflows'] as const,
  lists: () => [...workflowKeys.all, 'list'] as const,
  list: (filters: ListWorkflowsParams) => [...workflowKeys.lists(), filters] as const,
  details: () => [...workflowKeys.all, 'detail'] as const,
  detail: (id: string) => [...workflowKeys.details(), id] as const,
  inputSchemas: () => [...workflowKeys.all, 'input-schema'] as const,
  inputSchema: (id: string) => [...workflowKeys.inputSchemas(), id] as const,
}
```

## Socket.IO 连接

Studio 连接 server 的五个命名空间。连接地址为站点 origin 加命名空间，开发时由 Vite 代理 `/socket.io` 到 server。

| 命名空间 | 客户端代码 | 行为 |
| --- | --- | --- |
| `/execution` | `agentloom-studio/src/features/execution/hooks/useExecutionSocket.ts` | 发送 `execution:subscribe`（带 `lastEventId`），ack 中的当前状态与 `execution.state.snapshot` 事件写入 `useExecutionStore`；离开时 `execution:unsubscribe` |
| `/agent-conversation` | `agentloom-studio/src/features/agent-conversation/lib/conversation-socket.ts` | 由 `useAgentConversationStore` 建立连接，推进对话消息流 |
| `/memory` | `agentloom-studio/src/features/agent-memory/components/audit/MemoryAuditPage.tsx` | 记忆审计页的实时操作 |
| `/knowledge` | `agentloom-studio/src/features/knowledge/hooks/useKnowledgeBaseSocket.ts` | `join`/`leave` 知识库房间；收到 `document:status-changed`、`knowledge-base:updated` 后失效相关查询 |
| `/notification` | `agentloom-studio/src/features/notification/hooks/useNotificationSocket.ts` | `notification:subscribe`；收到 `notification.new`、`notification.unread-count` 后更新查询缓存 |

server 侧的事件名全集与方向见 [实时通信](/dev/server/realtime)。

## 快照只灌入一次

执行详情页同时拿到 REST 快照与 socket 事件，二者到达顺序不确定。规则是：REST 快照每个执行只灌入一次，且只在 store 还没收到任何 socket 事件时生效。

- `agentloom-studio/src/features/execution/hooks/useLiveExecutionDetail.ts` 用一个 ref 记录已初始化的 `executionId`，同一执行只调用一次 `initFromSnapshot`。
- `agentloom-studio/src/features/execution/stores/executionStore.ts` 的 `initFromSnapshot` 在 `recentEvents` 非空时直接返回：socket 事件已经比 REST 快照新。
- socket 自身下发的快照（订阅 ack 与 `execution.state.snapshot`）无条件应用，因为它们来自同一事件序列。

Agent 编排画布遵循同样的规则：`agentloom-studio/src/features/agent-canvas/hooks/useAgentCanvasHydration.ts` 每个 Agent 只灌入一次。工作流画布的规则见 [画布](/dev/studio/canvas#服务端快照与本地草稿)。
