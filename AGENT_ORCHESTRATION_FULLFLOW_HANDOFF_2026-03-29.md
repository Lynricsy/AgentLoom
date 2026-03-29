# Agent Orchestration Fullflow Handoff

日期：2026-03-29

## 范围

本报告基于 2026-03-28 到 2026-03-29 对 `https://agentloom.ling.plus/` 的真实线上回归测试，覆盖：

- Memory / Workspace / Persistent Sandbox 资源创建
- Agent 画布绑定、保存、编译
- Agent Conversation 创建
- 沙箱启动
- 沙箱内真实工具调用
- Workspace 文件落地与平台 API 回读
- 对话页消息、工具调用、终端输出、文件变更展示

本报告的目标不是复述测试经过，而是给接手开发者提供可以直接修复的问题单输入。

## 已验证通过的链路

- Memory 创建成功：`019d35e4-4d9d-7ee1-8742-72a4f8145bd4`
- Workspace 创建成功：`019d35e4-d975-7a42-b512-5f41dc87629c`
- 持久 Sandbox 创建成功：`019d35e5-3942-7c7f-87ac-5795dd9d8295`
- Agent 保存并重新编译成功，编译结果已带上新 workspace / memory 绑定
- Conversation 创建成功：`019d35eb-f44c-75c3-8493-8830b580948e`
- 会话沙箱启动成功，容器真实收到 `/v1/session` 和 `/v1/prompt`
- Agent 在 `/workspace` 创建了 `qa-runtime-check.txt`
- 平台 API 成功读取 `qa-runtime-check.txt`，内容为 `agent runtime ok`

## 证据索引

- 阶段日志：[0119-Agent-编排全流程测试：Agent-资源绑定更新并编译通过.md](/root/AgentLoom/AgentLogs/0119-Agent-编排全流程测试：Agent-资源绑定更新并编译通过.md)
- 阶段日志：[0120-Agent-编排全流程测试：会话运行成功但对话与工具展示存在前端缺陷.md](/root/AgentLoom/AgentLogs/0120-Agent-编排全流程测试：会话运行成功但对话与工具展示存在前端缺陷.md)
- 评估日志：[0121-Agent-编排全流程测试：缺陷报告可交接程度评估与修复准备度分级.md](/root/AgentLoom/AgentLogs/0121-Agent-编排全流程测试：缺陷报告可交接程度评估与修复准备度分级.md)
- 截图：[evidence-agent-conversation-ui-mismatch.png](/root/AgentLoom/evidence-agent-conversation-ui-mismatch.png)
- 截图：[evidence-agent-toolcalls-crash.png](/root/AgentLoom/evidence-agent-toolcalls-crash.png)
- 截图：[evidence-memory-created.png](/root/AgentLoom/evidence-memory-created.png)
- 截图：[evidence-workspace-created.png](/root/AgentLoom/evidence-workspace-created.png)
- 截图：[evidence-sandbox-created-ready.png](/root/AgentLoom/evidence-sandbox-created-ready.png)

## 已确定设计决策

以下内容已由产品方向明确，不再作为开放设计问题：

### D-01 Conversation 需要可继续，但 Sandbox / Workspace 不要求恢复到该对话当时的时间点

- Conversation 是一等持久对象，必须可继续。
- Sandbox 与 Workspace 各自按各自机制恢复，不要求随 conversation 一起回溯到“该轮对话发生时”的运行态。
- 也就是说，需要恢复的是“对话历史与继续对话能力”，不是“完整会话现场快照”。

### D-02 Flutter 端需要 Agent 历史对话列表，Studio 端不要求

- Flutter 端需要提供 Agent 的历史对话列表。
- 列表中的每个 conversation 都必须支持继续。
- Studio 端当前不要求提供同等的历史对话入口。

### D-03 继续对话时的 Sandbox 恢复策略

- 如果该 Agent Conversation 使用的是临时 Sandbox：
- 继续对话时直接新建一个 Sandbox。
- 在新的 Sandbox 里继续已有 conversation。

- 如果该 Agent Conversation 使用的是持久 Sandbox：
- 继续对话时先启动该持久 Sandbox。
- 然后在该 Sandbox 中继续已有 conversation。

### D-04 设计约束结论

- 不需要为 sandbox path 设计“按 conversation 时间点精确恢复 shell/PTY/工具中间态”的能力。
- 需要保证的是：
- conversation 历史可加载
- 继续发送消息时，agent 能拿到已有对话上下文
- runtime 能根据 sandbox 生命周期策略重新挂接到合适的 sandbox / workspace
- 因此，conversation durability 与 sandbox durability 必须解耦建模

## 缺陷列表

### AO-01 Workspace 选择器请求 422

- 状态：`Ready to Fix`
- 严重度：高
- 复现步骤：
- 打开 Agent 编辑页
- 打开 workspace 相关配置面板
- 观察前端请求 `/api/v1/workspaces?pageSize=1000`
- 期望：
- workspace 下拉能正常列出资源
- 实际：
- 请求返回 `422`
- UI 误报“暂无可用工作区”
- 代码证据：
- 前端固定请求 `pageSize=1000`：[workspaceApi.ts#L28-L33](/root/AgentLoom/agentloom-studio/src/features/workspace/api/workspaceApi.ts#L28)
- 后端 schema 限制 `pageSize <= 100`：[list-workspaces-query.dto.ts#L4-L15](/root/AgentLoom/agentloom-server/src/modules/workspace/dto/list-workspaces-query.dto.ts#L4)
- 根因：
- 前后端分页上限合同不一致
- 修复方向：
- 前端改成 `<=100` 的分页拉取，或支持循环翻页聚合
- 如果产品明确要求一次拉全，则后端 schema 和 service 一起提升上限并评估成本
- 验收标准：
- Agent 编辑页不再出现 `422`
- 绑定已有 workspace 时 UI 可正常列出并选中
- 线上手工回归能从 UI 完成 workspace 绑定，无需同源 API 绕过
- 额外提示：
- 同样的 `pageSize=1000` 模式也出现在 [memoryInstanceApi.ts#L35-L40](/root/AgentLoom/agentloom-studio/src/features/memory-instance/api/memoryInstanceApi.ts#L35)，建议一并检查

### AO-02 Tool calls 历史合同不一致，展开后崩溃

- 状态：`Ready to Fix`
- 严重度：严重
- 复现步骤：
- 进入测试 conversation
- 展开 assistant 消息下方 `Tool calls (9/9)`
- 期望：
- 工具名、参数、结果可正常展示
- 实际：
- 页面进入 React error boundary
- 工具名出现 `unknown_tool`
- 历史消息里 assistant `content=""`，但 `toolCalls` 已落库
- 代码证据：
- 后端历史消息直接透传对象数组：[message-response.dto.ts#L3-L24](/root/AgentLoom/agentloom-server/src/modules/agent-conversation/dto/message-response.dto.ts#L3)
- 前端历史类型把 `args/result` 定义成字符串，并使用 `name` 字段：[types.ts#L5-L12](/root/AgentLoom/agentloom-studio/src/features/agent-conversation/types.ts#L5)
- 前端实时事件也假设 `name`，但后端实时 payload 的 canonical 字段是 `tool`：[types.ts#L70-L86](/root/AgentLoom/agentloom-studio/src/features/agent-conversation/types.ts#L70), [execution-event.types.ts#L119-L134](/root/AgentLoom/agentloom-server/src/modules/execution/types/execution-event.types.ts#L119)
- 历史加载直接把后端返回值当 `ToolCall[]` 使用：[agent-conversation.store.ts#L503-L515](/root/AgentLoom/agentloom-studio/src/features/agent-conversation/stores/agent-conversation.store.ts#L503)
- UI 渲染把 `args` 按字符串 JSON.parse / 文本渲染：[MessageList.tsx#L97-L147](/root/AgentLoom/agentloom-studio/src/features/agent-conversation/components/MessageList.tsx#L97)
- 实时工具状态事件实际由 worker 发 `tool/args/result`：[agent-execution.worker.ts#L655-L669](/root/AgentLoom/agentloom-server/src/modules/agent-execution/agent-execution.worker.ts#L655)
- 根因：
- 历史消息合同、实时事件合同、前端类型和 UI 渲染四者不一致
- 当前前端既没有统一 canonical 字段，也没有对对象型 `args/result` 做安全格式化
- 修复方向：
- 明确一个 canonical tool call DTO，建议字段为 `id/tool/args/status/result/error/transitions`
- 历史消息序列化与实时事件统一使用同一 DTO
- 前端 store 在 history 与 socket 两条路径上统一做 normalize
- UI 只渲染字符串化后的 JSON，不直接把对象作为 React 子节点
- 验收标准：
- 历史消息和实时消息展示同一组工具名
- 展开 `Tool calls` 不再崩溃
- 对象型 `args/result` 能格式化显示
- 不再出现 `unknown_tool`

### AO-03 文件变更面板合同错位，右侧一直显示“暂无文件”

- 状态：`Ready to Fix`
- 严重度：高
- 复现步骤：
- 在 conversation 中让 agent 创建新文件
- 确认 `/workspace` 已真实产生文件
- 观察右侧 `文件变更 / 工作区`
- 期望：
- 文件变更面板显示新文件
- 文件树同步出现新路径
- 实际：
- 右侧仍显示 `暂无文件`
- 代码证据：
- 后端检测到文件变更后发出的是 `changedFiles: string[]`：[workspace-integration.service.ts#L398-L431](/root/AgentLoom/agentloom-server/src/modules/agent-execution/workspace-integration.service.ts#L398)
- conversation gateway 原样转发该 payload：[agent-conversation.gateway.ts#L551-L570](/root/AgentLoom/agentloom-server/src/modules/agent-execution/agent-conversation.gateway.ts#L551)
- 前端却要求单条 `path/changeType/diff/content`：[types.ts#L100-L106](/root/AgentLoom/agentloom-studio/src/features/agent-conversation/types.ts#L100)
- store 也只会消费单条路径：[agent-conversation.store.ts#L362-L383](/root/AgentLoom/agentloom-studio/src/features/agent-conversation/stores/agent-conversation.store.ts#L362)
- 根因：
- 后端批量文件列表事件与前端单文件事件合同完全不兼容
- 修复方向：
- 选一种 canonical 方案
- 若保留批量事件，则前端改为遍历 `changedFiles[]` 并构造本地 file change entries
- 若保留单文件事件，则 gateway 层把 `changedFiles[]` 展平后逐条广播
- 验收标准：
- 新建文件后右侧文件变更面板出现条目
- 文件树自动出现 `qa-runtime-check.txt`
- 点击文件树可读取最新内容

### AO-04 终端输出事件未桥接到 conversation 终端面板

- 状态：`Ready to Fix`
- 严重度：高
- 复现步骤：
- 在 sandbox 中执行会产生 PTY 输出的操作
- 观察右侧终端面板
- 期望：
- 终端面板出现命令输出
- 实际：
- 一直显示 `等待终端输出...`
- 代码证据：
- sandbox SSE 层发出的是 `pty_output`：[event-stream.ts#L42-L67](/root/AgentLoom/agentloom-deploy/sandbox/src/event-stream.ts#L42)
- server 适配层把它翻译成 agent event `pty.output`：[sandbox-agent.adapter.ts#L661-L674](/root/AgentLoom/agentloom-server/src/modules/agent/sandbox-agent.adapter.ts#L661)
- conversation gateway 只把 `terminal_output` 映射到 `conversation.sandbox.terminal_output`：[agent-conversation.gateway.ts#L440-L458](/root/AgentLoom/agentloom-server/src/modules/agent-execution/agent-conversation.gateway.ts#L440)
- 默认分支会把未知事件落到 `conversation.agent.message_chunk`：[agent-conversation.gateway.ts#L459-L474](/root/AgentLoom/agentloom-server/src/modules/agent-execution/agent-conversation.gateway.ts#L459)
- 前端终端面板只监听 `conversation.sandbox.terminal_output`：[agent-conversation.store.ts#L340-L359](/root/AgentLoom/agentloom-studio/src/features/agent-conversation/stores/agent-conversation.store.ts#L340)
- 根因：
- sandbox 运行时发的是 `pty.output`
- conversation 网关期待的是 `terminal_output`
- 前端又只消费 `conversation.sandbox.terminal_output`
- 修复方向：
- 在 gateway 层把 `pty.output` 显式映射成 `SANDBOX_TERMINAL_OUTPUT`
- 同时规范 payload 字段，至少包含 `output`
- 如果保留 PTY 维度，建议附带 `sessionId`
- 验收标准：
- 终端输出能实时进入右侧终端面板
- 不再误路由到 `conversation.agent.message_chunk`
- 终端输出与实际 PTY buffer dump 内容一致

### AO-05 Sandbox `done` 事件丢失 `stopReason`，工具回合后不会自动续轮

- 状态：`Ready to Fix`
- 严重度：严重
- 复现步骤：
- 发送一个会触发工具执行的消息
- 观察 assistant 消息、toolCalls 和最终自然语言总结
- 期望：
- 工具执行后 agent 继续续轮，最终给出自然语言总结
- 实际：
- assistant message 已落库但 `content=""`
- `toolCalls` 已存在，说明工具确实执行过
- 代码证据：
- conversation worker 只有 `stopReason === 'tool_use'` 才会继续下一轮空 prompt：[agent-execution.worker.ts#L637-L688](/root/AgentLoom/agentloom-server/src/modules/agent-execution/agent-execution.worker.ts#L637)
- sandbox SSE 层 `agent_end` 只发 `{ type: 'done' }`，没有 stopReason：[event-stream.ts#L66-L70](/root/AgentLoom/agentloom-deploy/sandbox/src/event-stream.ts#L66)
- sandbox adapter 解析 `done` 时读取 `data?.stopReason`，缺失时默认回落为 `end_turn`：[sandbox-agent.adapter.ts#L627-L635](/root/AgentLoom/agentloom-server/src/modules/agent/sandbox-agent.adapter.ts#L627), [sandbox-agent.adapter.ts#L835-L850](/root/AgentLoom/agentloom-server/src/modules/agent/sandbox-agent.adapter.ts#L835)
- 根因：
- sandbox HTTP 适配层没有把 tool-use 场景的 stopReason 传回 server
- conversation worker 因此误以为回合已经自然结束，不会进入工具后的 follow-up round
- 修复方向：
- 在 sandbox SSE 合同中补上 stopReason
- 或在 server 侧通过工具事件状态机推断 tool-use 回合并继续续轮
- 修复后需要补 sandbox path 的多轮回归测试
- 验收标准：
- 工具执行后 assistant 最终消息必须包含自然语言总结
- `tool_use -> follow-up round -> end_turn` 在 sandbox conversation 路径上可稳定复现
- 新增测试覆盖 tool-use 场景的 stopReason 透传

### AO-06 Sandbox 多轮会话恢复与空回合持久化设计不匹配

- 状态：`Ready to Fix`
- 严重度：严重
- 复现步骤：
- 在同一 conversation 里发送第二条消息
- 观察 conversation metadata、sessionId 和消息列表
- 期望：
- 第二轮复用或正确恢复前一轮 session
- 即使本轮没有 chunk，也不应静默丢失一次实际执行过的回合
- 实际：
- 第二轮执行后 `lastProcessedMessageId` 已推进
- 但没有新增 assistant message
- 运行 metadata 中 `sessionId` 发生了变化，说明旧 session 没有成功恢复
- 代码证据：
- worker 优先尝试按 metadata 中的 `sessionId` 恢复 runtime，失败后退回新建 session：[agent-execution.worker.ts#L509-L531](/root/AgentLoom/agentloom-server/src/modules/agent-execution/agent-execution.worker.ts#L509)
- Sandbox runtime 的 `loadSession()` 只读内存 map，没有 durable persistence：[sandbox-agent.adapter.ts#L151-L159](/root/AgentLoom/agentloom-server/src/modules/agent/sandbox-agent.adapter.ts#L151)
- InProcess runtime 则有 durable conversation session/replay 持久化：[in-process-agent.adapter.ts#L123-L145](/root/AgentLoom/agentloom-server/src/modules/agent/in-process-agent.adapter.ts#L123), [session-persistence.service.ts#L353-L455](/root/AgentLoom/agentloom-server/src/modules/execution/services/session-persistence.service.ts#L353)
- 持久化层在 `assistantText/toolCalls/decision` 全空时不会插入 assistant message，但仍会推进 `lastProcessedMessageId`：[agent-execution.worker.ts#L721-L764](/root/AgentLoom/agentloom-server/src/modules/agent-execution/agent-execution.worker.ts#L721)
- 根因：
- worker 对 sandbox / in-process 两条 runtime 路径使用了相同的 session resume 预期
- 但 sandbox path 没有实现 durable session persistence
- 一旦 runtime 返回“空回合”，当前持久化逻辑会直接吞掉这轮 assistant 结果
- 修复方向：
- 已定方案：Conversation 可继续，但 Sandbox / Workspace 不按 conversation 时间点恢复
- 对临时 sandbox conversation：
- 继续对话时新建 sandbox
- 使用 conversation 历史重建 prompt 上下文
- 对持久 sandbox conversation：
- 继续对话时先启动持久 sandbox，再绑定已有 conversation 历史继续
- 不要求恢复旧 PTY / shell / tool 中间态
- 因此修复应转向：
- 去掉 sandbox path 对 durable runtime session restore 的强依赖
- 把 conversation history 作为继续对话的权威来源
- 修复 `persistConversationTurn()` 对空回合的静默吞掉行为
- 明确 metadata 中 `sessionId` 仅表示最近一次运行态会话，而不是 durable conversation identity
- 验收标准：
- 第二轮消息后，消息列表一定新增 assistant 或系统占位消息
- conversation 可继续，但允许 runtime session 在不同轮次变化
- 刷新页面后历史消息不丢失
- 临时 sandbox conversation 继续时会创建新 sandbox
- 持久 sandbox conversation 继续时会启动并复用对应持久 sandbox

### AO-07 对话执行错误写入 workflow-only 审计/执行记录表

- 状态：`Ready to Fix`
- 严重度：高
- 复现步骤：
- 触发 agent conversation 执行完成
- 查看 server / worker 日志
- 期望：
- conversation 执行的运行态记录不应触发 workflow-only 外键错误
- 实际：
- `audit_logs` 插入失败
- `agent_execution_records` 的 execution summary 插入失败
- 日志证据：
- 容器日志里可见 `Failed query: insert into "audit_logs"... execution_id ...`
- 容器日志里可见 `Failed to record execution summary for 019d35eb-f44c-75c3-8493-8830b580948e...`
- 代码证据：
- conversation worker 发出的 `ExecutionStatusChanged` 使用的是 `executionId: conversationId`：[agent-execution.worker.ts#L375-L378](/root/AgentLoom/agentloom-server/src/modules/agent-execution/agent-execution.worker.ts#L375)
- audit listener 把该 ID 原样写入 `audit_logs.execution_id`：[audit-log.listener.ts#L32-L55](/root/AgentLoom/agentloom-server/src/modules/evidence/audit-log.listener.ts#L32)
- execution record listener 把同一个 ID 原样写入 `agent_execution_records.execution_id`：[execution-record.service.ts#L90-L121](/root/AgentLoom/agentloom-server/src/modules/execution-record/execution-record.service.ts#L90)
- `audit_logs.execution_id` 外键指向 `workflow_executions.id`：[audit-logs.schema.ts#L23-L38](/root/AgentLoom/agentloom-server/src/database/schema/audit-logs.schema.ts#L23)
- `agent_execution_records.execution_id` 也外键指向 `workflow_executions.id`：[execution-records.schema.ts#L91-L131](/root/AgentLoom/agentloom-server/src/database/schema/execution-records.schema.ts#L91)
- 根因：
- conversation 执行复用了 workflow execution 事件名
- 但监听器和表结构仍按 workflow execution 外键建模
- 结果是把 `conversationId` 错当 `workflowExecutionId` 写库
- 修复方向：
- conversation 与 workflow 执行记录拆模
- 至少要避免把 conversationId 写入 workflow-only 外键字段
- 可选方案：
- 对 conversation 执行跳过这两类 listener
- 或新增 conversation 专属 evidence / execution record 表或可空 polymorphic 资源字段
- 验收标准：
- conversation 执行完成后不再出现这两类写库 warning/error
- workflow execution 原有审计与 summary 不回归

## 次要观察项

### AO-08 LLM 节点展示数据漂移

- 现象：
- Agent 画布里的 llm 节点继续显示旧的 `private_cloud/gpt-4o`
- 但编译实际使用的是当前绑定的 `modelId -> anthropic/claude-opus-4-6`
- 结论：
- 这是展示层 / 持久化内容漂移
- 不阻塞当前 runtime

### AO-09 新建空 workspace 绑定后恢复日志出现对象存储 key 不存在 warning

- 现象：
- worker 日志里出现 `Failed to restore workspace ... The specified key does not exist`
- 结论：
- 新建空 workspace 尚未有归档对象
- 不阻塞会话启动，但会产生噪音日志

## 建议修复顺序

1. AO-02 Tool calls 合同统一与崩溃修复
2. AO-04 终端输出事件桥接
3. AO-03 文件变更事件桥接
4. AO-05 sandbox stopReason 透传，修复工具回合后无自然语言总结
5. AO-06 多轮 sandbox session 恢复语义与空回合持久化
6. AO-07 conversation 执行的审计/summary 建模修正
7. AO-01 workspace 分页合同修复
8. Flutter 端补 Agent 历史对话列表与 continue 入口

## 回归建议

- 至少新增 1 条 sandbox conversation e2e：
- 首轮触发文件创建工具
- 校验 assistant 最终 summary 非空
- 校验 Tool calls 可展开
- 校验终端输出面板有内容
- 校验文件变更面板能看到新文件
- 再发第二轮纯文本追问
- 校验 assistant 新消息落库
- 再新增 1 条 listener 单测：
- conversation completion 不写 workflow-only FK 字段
- workflow execution 原逻辑保持通过
