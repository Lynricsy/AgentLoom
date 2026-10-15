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
| F7 | 子 Agent（`spawn_subagent` 等）在覆盖其整个执行的租户事务里运行 | `agentloom-server/src/modules/agent-execution/subagent/subagent-tools.provider.ts`（`startDetachedSubAgent`） |
| F8 | 对话的持久游标 `metadata.execution.lastProcessedMessageId` 与本轮 assistant 消息同事务落库；`loadPendingUserMessages` 按 `(created_at, id)` 取游标之后的用户消息 | `agentloom-server/src/modules/agent-execution/agent-execution-worker-persistence.service.ts`（`persistConversationTurn`）、`agentloom-server/src/modules/agent-execution/agent-execution-worker-runtime.service.ts` |

## 决策

| 议题 | 选择 | 被否决的方案及原因 |
| --- | --- | --- |
| 成员载体 | 每个成员一条 `agent_conversations`（`source='team'`），复用对话执行队列、取消与唤醒（F1、F2） | **新的团队运行循环**：要重做会话恢复、沙箱、工具注册、用量记账与跨实例取消 |
| 递送时机 | 回合边界：消息写入接收者 `agent_messages`，接收者下一回合处理；忙碌成员本回合结束后看到，空闲成员被唤醒 | **工具边界注入**：运行时端口不支持（F4），且中途改变上下文会让成员行为难以复现 |
| 可靠性 | `team_messages` 自身即 Outbox：每个接收者一行 `pending`；投递在一个租户事务内锁行、写 `agent_messages`、置 `delivered`（`WHERE delivery_status='pending'`）；接收者回合落库后置 `consumed`，事件丢失时清扫按接收者对话的持久游标（F8）补标；30 秒清扫重投超时 `pending`、重新派发超时未消费的接收者、过期截止后的 `pending` | **事务后直接写对话**：进程在提交与投递之间崩溃会丢消息；**通用 Outbox 表**：只有一个使用方，多一层转换 |
| 用量记账 | 成员与团队用量从成员对话已落库 assistant 消息的 `metadata.usage/costUsd` 重算（幂等，回合数同源），输入计 `inputTokens + cacheReadTokens + cacheWriteTokens`（计数互不重叠）；`turn-persisted` 处理与清扫调用同一重算，重算前锁定运行行 | **按事件增量累加**：事件丢失或重复都会让预算与结果失真；**只计未缓存输入**：缓存命中的输入不计入预算，预算形同虚设 |
| 控制路径 | 取消、截止、预算耗尽、提交结果、催办走 `TeamRunService` 的确定性代码；结束以 `WHERE status='running'` 保证只结束一次 | **由模型或决策服务裁决**：结束条件必须可预测、可审计 |
| 完成条件 | 只有 lead 的 `team_submit_result` 能提交结果，且只能提交一次；提交只登记待定结果（`team_runs.result` + `result_submitted_at`，运行仍 `running`）。lead 提交回合落库（其最近 assistant 消息不早于提交时间）后，在同一事务内重算用量并判定预算：超预算以 `budget_exhausted` 失败，否则完成，步骤结果用结算后的快照；lead 循环失败/取消或到达截止时有待定结果则结算后完成；清扫对提交超过 60 秒且 lead 未在运行的待定结果兜底完成。配置了输出 Schema 时校验产物，第 3 次不符以 `schema_invalid` 失败；全体空闲 60 秒未提交先催办 2 次再以 `no_result` 失败 | **提交即完成**：提交回合的用量尚未落库，步骤结果与预算判断都漏掉这一回合；**任一成员或模型判断完成**：完成责任不清 |
| 团队身份 | 团队工具只注册在成员对话自身的会话上，子 Agent 会话不注册；工具执行一律脱离调用方的租户事务，每次写入是独立短事务 | **子 Agent 继承成员身份**：子 Agent 在长事务里运行（F7），团队写入会长期持有 `team_runs` 行锁，推迟投递并阻塞截止与取消 |
| 步骤推进与恢复 | 团队结束后在一个租户事务内校验「仍是该步骤最新运行、步骤仍 `running`」，再写步骤终态并调度（同事务提交）；推进失败只记录。清扫恢复：已过 `deadline_at` 的运行直接截止（不只依赖延迟任务）；启动超过 60 秒仍无落库回合、未在运行的成员重新派发；终态超过 15 秒而步骤仍 `running` 且为最新运行的，幂等重做步骤终态与调度；终态团队仍有 active 成员对话的，结束它们 | **只靠提交后钩子与延迟任务**：进程在提交与推进之间退出、入队失败都会让步骤永远停在 `running` |
| 重跑与执行终态 | 执行进入任一终态（完成/失败/取消）时取消其下仍在运行的团队（不推进步骤）；启动新运行前取消同一步骤仍在运行的旧运行 | **只在执行取消时处理**：执行因其他分支失败而结束后，团队成员仍在消耗预算 |
| 工作区 | 成员各用自己 Agent 定义的运行态与沙箱，不共享工作区；补丁与测试结果以消息文本传递 | **共享工作区**：并发写冲突与权限边界需要另行设计 |
| 成员版本 | 成员对话运行 Agent 的当前发布版本；配置里指定了其他版本时启动失败（`team/config-invalid`） | **按指定版本运行**：对话执行没有钉版本的机制，静默运行发布版会让配置与实际不符 |
| 模块图 | `AgentExecutionModule → TeamModule → ExecutionModule`。反向调用经事件：团队运行时派发/结束成员对话发 `team.member-conversation.dispatch/cancel`，由 agent-execution 内的 `TeamConversationBridgeListener` 调用 `AgentExecutionService`；`team` 节点执行器发 `team.run.start-requested`（`emitAsync`，监听器异常传播）由 `TeamRunService` 启动 | **直接注入**：`TeamRunService` 依赖调度器与对话执行，执行器与对话侧又依赖团队模块，必成环（F6）；**`forwardRef`**：仓库规则禁止 |

## 后果

- 变容易：团队成员获得对话已有的全部能力（沙箱、记忆、技能、子 Agent、用量与成本记账）；投递、结算与恢复语义可以用真实 PostgreSQL 验证。
- 变困难：成员之间的反应延迟至少一个回合；提交结果到团队完成之间隔着 lead 本回合的剩余部分；跨模块调用经事件，阅读时要从事件名找监听器。
- 新约束：团队成员对话不进入 Agent 的对话列表、不生成标题；`team_messages.agent_message_id` 唯一；同一步骤同时只有一个 `running` 的团队运行（部分唯一索引），恢复重跑会新建运行行；团队监听器在独立事务中执行（脱离发出方的事务上下文）；成员的子 Agent 不能收发团队消息或提交结果。

## 确认方式

- 单测：`pnpm --filter agentloom-server test src/modules/team src/modules/execution/__tests__/team-node.executor.spec.ts src/modules/agent-execution/__tests__/subagent-team-tools.spec.ts`。
- 邮箱可靠性 E2E（并发投递只写一条、清扫重投、接收者结束置 expired）：`E2E_REDIS_URL=… pnpm --filter agentloom-server test:e2e -- team-mailbox`。
- 结算与恢复 E2E（含缓存 token 的用量重算、待定结果结算、按游标补标 consumed、截止兜底、步骤推进恢复、被取代的旧运行不推进）：`E2E_REDIS_URL=… pnpm --filter agentloom-server test:e2e -- team-recovery`。
- 模块图可启动：任一导入完整 `AppModule` 的 E2E 通过，例如 `pnpm --filter agentloom-server test:e2e -- execution-intervention`。
