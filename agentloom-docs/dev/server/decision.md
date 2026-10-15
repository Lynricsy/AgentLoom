---
docType: explanation
---

# 决策服务

`decision` 模块（`agentloom-server/src/modules/decision/`）给运行时里「该怎么选」的判断点一个统一入口 `DecisionService.decide`。每个判断点先用确定性规则给出**主结果**，行为只由主结果决定；配置了 TypeSafe Jev 时，同一输入另交给 Jev 评估，结果以**影子**形式落库，用来对照规则与模型的差异，不控制任何行为。

## 决策定义

一个判断点对应一个决策定义（`DecisionDefinition`，类型在 `agentloom-server/src/modules/decision/decision.types.ts`），登记在 `agentloom-server/src/modules/decision/definitions/index.ts` 的 `DECISION_DEFINITIONS`：

|字段|含义|
|---|---|
|`kind`|决策种类，同时出现在 `DECISION_KINDS` 中|
|`type`|`noul`（是/否概率）或 `choice`（从若干选项中选一个）|
|`version`|问题、state 形状或规则变化时递增，落库后可按版本比较影子结果|
|`shadow`|配置了 Jev 时是否运行影子评估|
|`instructions`、`criteria`、`buildOptions`|发给 Jev 的问题：`noul` 用 `criteria` 的真/假判据，`choice` 用 `buildOptions` 生成的选项表|
|`buildState`|把输入整理为发给 Jev 的 state，长文本在这里截断|
|`rule`|确定性规则，返回主结果|

当前两个定义：

|种类|类型|规则|调用方|
|---|---|---|---|
|`team.message_relevance`|`noul`|恒为 1（投递）|团队成员广播 `observation` 时，对每个接收者各判一次|
|`routing.model_choice`|`choice`|路由策略实际选中的模型，置信度 1|工作流 `smart-routing` 节点写入 `routing_decisions` 之后（`agentloom-server/src/modules/execution/node-executors/smart-routing-node.executor.ts`）|

`team.message_relevance` 的 state 包含接收者角色、指令和最近一条 assistant 输出（截断到 1500 字符），以及消息的发送者、种类、正文（截断到 4000 字符）与引用。`routing.model_choice` 的 state 包含任务文本（截断到 4000 字符）、任务类别、输入 token 数和健康候选的质量排名、平均延迟与单价。

## 主结果与影子

`decide` 的流程：

1. 用规则 provider（`agentloom-server/src/modules/decision/providers/rule-decision.provider.ts`）求主结果。
2. 在租户事务内（`runInTenantTransaction`，调用方已在事务中时复用该事务）写一条 `mode='primary'`、`provider='rule'` 的 `decision_records`，返回 `{ outcome, recordId }`。
3. 定义开启 `shadow` 且设置了 `APP_TYPESAFE_API_KEY` 时，不等待地启动影子评估，`decide` 立即返回。

影子评估由 `JevDecisionProvider`（`agentloom-server/src/modules/decision/providers/jev-decision.provider.ts`）把定义翻译为一个问题，经 `JevClient`（`agentloom-server/src/modules/decision/providers/jev-client.ts`）调用 `POST ${APP_TYPESAFE_BASE_URL}/v1/systemone`，模型固定为 `APP_TYPESAFE_MODEL`，超时 `APP_TYPESAFE_TIMEOUT_MS`。429/529 退避 500 ms 后重试一次，其余非 2xx 以 `JevHttpError` 失败。

无论成功与否都写一条 `mode='shadow'`、`provider='jev'` 的记录：成功时带 `model`、`outcome`、`confidence`、`input_tokens/output_tokens`；失败（超时、HTTP 错误、响应不符合 schema、回答类型与定义不符）时 `outcome` 为空，`error` 记录原因（截断 500 字符）。影子绝不抛出到调用方，写记录本身失败也只记日志。影子在请求事务结束后才完成，因此用不切换角色的原始 `DRIZZLE` 连接写入并显式带 `tenant_id`（原始连接不受 RLS 约束，见 [数据库](/dev/server/database)）。进程停机时 `onApplicationShutdown` 等待进行中的影子写完。

未设置 `APP_TYPESAFE_API_KEY` 时不发起任何 Jev 请求，只有主记录。

## `decision_records`

表定义在 `agentloom-server/src/database/schema/decision-records.schema.ts`，是 append-only 表（`createAppendOnlyTenantPolicies`，只有 SELECT/INSERT 策略）。同一次 `decide` 的主记录与影子记录共享 `kind`、`subject_type`、`subject_id`、`definition_version` 与 `input_digest`（`buildState` 结果按键排序序列化后的 SHA-256），可按这几列把两者配对。

`subject_type` 取 `team_message`（`subject_id` = `team_messages.id`）或 `routing_decision`（`subject_id` = `routing_decisions.id`）。

`GET /decision-records?kind=&subjectType=&subjectId=&page=&limit=`（权限 `execution:read`）按创建时间倒序分页返回当前租户的记录，`limit` 默认 20、上限 100，`pageSize` 是它的别名。Studio 的路由决策面板用它查询每条路由决策的影子记录，显示 `Jev 影子：<模型名> conf=0.xx`；团队视图对消息显示 `Jev 影子：p=0.xx`（组件 `agentloom-studio/src/features/decision-record/components/JevShadowBadge.tsx`）。

## confidence 的含义

`choice` 记录的 `confidence` 是 Jev 对所选项给出的置信度，规则主记录恒为 1；`noul` 的结果本身就是概率（`outcome.value ∈ [0,1]`），`confidence` 列为空。

平台不设统一阈值，也不据影子结果改变行为：不同决策种类、不同定义版本的分布不可比，阈值只有在对照某一种类积累足够的主/影子配对记录之后才能为该种类单独确定。把某个种类从影子切到主结果属于新的决策，需要先评估再改定义。
