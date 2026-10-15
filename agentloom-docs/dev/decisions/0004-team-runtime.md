---
docType: explanation
---

# 0004 受控团队运行时：成员即对话、回合边界递送、team_messages 即 Outbox

- 状态：已实施
- 日期：2026-10-15

节点配置与用户操作见 [Team 节点](/guide/nodes/team)。本篇只记录为什么这样设计。

## 背景

工作流 DAG 能约束阶段顺序，但阶段内多个 Agent 只能经端口一次性传值，无法在执行中交换中间发现。决策时的相关事实：

| # | 事实 | 证据 |
| --- | --- | --- |
| F1 | 对话执行已是「表即邮箱」：`injectMessage` 写 `agent_messages` 后派发；worker 一轮批量处理全部 pending 用户消息，空闲时等待通知 | `agentloom-server/src/modules/agent-execution/agent-execution.service.ts`、`agentloom-server/src/modules/agent-execution/agent-execution-worker-runtime.service.ts`（`loadPendingUserMessages`） |
| F2 | 对话执行队列 `agent-conversation-execution` 以 conversationId 为 jobId，取消与唤醒有跨实例频道 | `agentloom-server/src/modules/agent-execution/agent-execution.service.ts`（`AGENT_CONVERSATION_CANCEL_CHANNEL`、`AGENT_CONVERSATION_NOTIFY_CHANNEL`） |
| F3 | 一轮落库后发出 `agent-conversation.turn-persisted`（含本轮处理的消息 id、用量与成本）；循环结束发出 `agent-conversation.loop-ended` | `agentloom-server/src/modules/agent-execution/agent-execution.events.ts` |
| F4 | 运行时端口没有工具边界注入（steer） | `agentloom-server/src/modules/agent/ports/agent-runtime.port.ts` |
| F5 | 仓库没有通用 Outbox；事务后副作用靠 `registerAfterCommitHook` | `agentloom-server/src/common/interceptors/tenant-transaction.context.ts` |
| F6 | `AgentExecutionModule` 导入 `ExecutionModule`；server 禁止 `forwardRef` | `agentloom-server/src/modules/agent-execution/agent-execution.module.ts`、根 `AGENTS.md` |

## 决策

| 议题 | 选择 | 被否决的方案及原因 |
| --- | --- | --- |
| 成员载体 | 每个成员一条 `agent_conversations`（`source='team'`），复用对话执行队列、取消与唤醒（F1、F2） | **新的团队运行循环**：要重做会话恢复、沙箱、工具注册、用量记账与跨实例取消 |
| 递送时机 | 回合边界：消息写入接收者 `agent_messages`，接收者下一回合处理；忙碌成员本回合结束后看到，空闲成员被唤醒 | **工具边界注入**：运行时端口不支持（F4），且中途改变上下文会让成员行为难以复现 |
| 可靠性 | `team_messages` 自身即 Outbox：每个接收者一行 `pending`；投递在一个租户事务内锁行、写 `agent_messages`、置 `delivered`（`WHERE delivery_status='pending'`）；接收者回合落库后置 `consumed`；30 秒清扫重投超时 `pending`、重新派发超时未消费的接收者、过期截止后的 `pending` | **事务后直接写对话**：进程在提交与投递之间崩溃会丢消息；**通用 Outbox 表**：只有一个使用方，多一层转换 |
| 控制路径 | 取消、截止、预算耗尽、提交结果、催办走 `TeamRunService` 的确定性代码；`finalize` 以 `WHERE status='running'` 保证只结束一次 | **由模型或决策服务裁决**：结束条件必须可预测、可审计 |
| 完成条件 | 只有 lead 的 `team_submit_result` 能完成团队；配置了输出 Schema 时校验产物，第 3 次不符以 `schema_invalid` 失败；全体空闲 60 秒未提交先催办 2 次再以 `no_result` 失败 | **任一成员或模型判断完成**：完成责任不清 |
| 工作区 | 成员各用自己 Agent 定义的运行态与沙箱，不共享工作区；补丁与测试结果以消息文本传递 | **共享工作区**：并发写冲突与权限边界需要另行设计 |
| 成员版本 | 成员对话运行 Agent 的当前发布版本；配置里指定了其他版本时启动失败（`team/config-invalid`） | **按指定版本运行**：对话执行没有钉版本的机制，静默运行发布版会让配置与实际不符 |
| 模块图 | `AgentExecutionModule → TeamModule → ExecutionModule`。反向调用经事件：团队运行时派发/结束成员对话发 `team.member-conversation.dispatch/cancel`，由 agent-execution 内的 `TeamConversationBridgeListener` 调用 `AgentExecutionService`；`team` 节点执行器发 `team.run.start-requested`（`emitAsync`，监听器异常传播）由 `TeamRunService` 启动 | **直接注入**：`TeamRunService` 依赖调度器与对话执行，执行器与对话侧又依赖团队模块，必成环（F6）；**`forwardRef`**：仓库规则禁止 |

## 后果

- 变容易：团队成员获得对话已有的全部能力（沙箱、记忆、技能、子 Agent、用量与成本记账）；投递语义可以用真实 PostgreSQL 验证。
- 变困难：成员之间的反应延迟至少一个回合；跨模块调用经事件，阅读时要从事件名找监听器。
- 新约束：团队成员对话不进入 Agent 的对话列表、不生成标题；`team_messages.agent_message_id` 唯一；同一步骤同时只有一个 `running` 的团队运行（部分唯一索引），恢复重跑会新建运行行；团队监听器在独立事务中执行（脱离发出方的事务上下文）。

## 确认方式

- 单测：`pnpm --filter agentloom-server test src/modules/team src/modules/execution/__tests__/team-node.executor.spec.ts`。
- 邮箱可靠性 E2E（并发投递只写一条、清扫重投、接收者结束置 expired）：`E2E_REDIS_URL=… pnpm --filter agentloom-server test:e2e -- team-mailbox`。
- 模块图可启动：任一导入完整 `AppModule` 的 E2E 通过，例如 `pnpm --filter agentloom-server test:e2e -- execution-intervention`。
