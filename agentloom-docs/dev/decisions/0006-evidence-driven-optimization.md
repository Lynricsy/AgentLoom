---
docType: explanation
---

# 0006 证据驱动配置优化：提案 → 回放评测 → 审批发布 → 回滚

- 状态：已实施
- 日期：2026-10-16

用户操作见 [配置优化提案](/guide/workflows/optimization)。本篇只记录为什么这样设计。

## 背景

团队运行时与路由回退落库后，运行证据已足以指出「某个节点的某项配置不够」。要把它变成可审批的修改，并保证「新配置优于基线、运行版本不漂移」。决策时的相关事实：

| # | 事实 | 证据 |
| --- | --- | --- |
| F1 | 旧 `optimization-suggestion` 模块的采纳白名单为空，`apply` 恒返回 409；它改写的 agent 节点字段（模型、工具、超时、自治级别）不参与执行 | 已删除的 `optimization-suggestion.service.ts`（`APPLICABLE_SUGGESTION_TYPES`） |
| F2 | 执行已冻结版本：`workflow_executions.workflow_version_id` 非空 + `definition_snapshot`；步骤 `nodeData` 来自快照；团队启动把配置快照写入 `team_runs.config` | `agentloom-server/src/database/schema/workflow-executions.schema.ts`、`agentloom-server/src/modules/team/team-run.service.ts` |
| F3 | `WorkflowPublishService.publish({ versionId })` 可把已有版本置为发布版本，其他版本的 `published_at` 清空；校验链针对草稿 | `agentloom-server/src/modules/workflow-definition/workflow-publish.service.ts` |
| F4 | 团队运行记录 `failure_reason`（`budget_exhausted` / `deadline_exceeded` …）、预算与用量；路由决策记录 `fallback_reason` 与 `selected_model_id` | `agentloom-server/src/database/schema/team-runs.schema.ts`、`agentloom-server/src/database/schema/routing-decisions.schema.ts` |
| F5 | 请求在租户事务拦截器内执行，抛异常即回滚 | `agentloom-server/src/common/interceptors/tenant-transaction.interceptor.ts` |
| F6 | `self-evolution` 的提案不落库、审批是 5 分钟有效的工具权限，面向会话内交互 | `agentloom-server/src/modules/self-evolution/` |

## 决策

| 议题 | 选择 | 被否决的方案及原因 |
| --- | --- | --- |
| 旧模块 | 删除 `optimization-suggestion`（表、路由、Studio feature），由新模块 `optimization-proposal` 接管监控页 Tab | **在旧模块上扩展**：它的建议类型都改写不参与执行的字段（F1），保留只会继续误导 |
| 可优化的字段 | 只做有执行落点的字段：团队 `config.budget.maxTotalTokens / maxMessages / deadlineMinutes`，`llm_as_router` 的 `strategyConfig.fallbackModelId`；每条提案只改一个节点的一个路径 | **一次改多项**：评测结论无法归因；**改 Agent 定义与提示词**：属于 Agent 版本体系，不在工作流版本内 |
| 证据口径 | 只用窗口内（28 天）与当前发布配置同预算的终态团队运行、以及非评测执行的路由决策；目标失败占比 ≥ 50%（团队，≥ 3 次）或回退率 ≥ 20%（路由，≥ 10 次）才提案 | **用全部历史**：旧预算下的失败不说明当前预算不够；**含评测执行**：评测会自我强化 |
| 测试集 | 回放该工作流最近 N 次（默认 3，上限 10）已结束真实执行的 `input_params`，通过 = 执行 `completed` | **人工维护用例集**：本期没有用例管理面；**用模型打分**：结论不可复现 |
| 候选版本 | 评测时从基线发布快照深拷贝并只应用补丁，以 `createVersionFromSnapshot` 建未发布版本；基线与候选两臂各用 `workflowVersionId` 启动执行（F2） | **从草稿建版本**：草稿上的无关编辑会混进评测与发布 |
| 发布条件 | 只有评测 `completed` 且结论 `improved` 可发布；结论：通过率上升为优、下降为劣，持平时平均成本变化 ≥ 5% 才判优/劣，否则无差异 | **允许无差异发布**：无法满足「新配置优于基线」 |
| 发布方式 | `publish({ versionId: candidate })`，即发布的正是被评测的快照（F3）；随后把补丁同步到草稿（OCC 更新），草稿缺该节点只记 `publishReport.note` | **重新从草稿发布**：发布内容与评测内容不一致 |
| 在途执行 | 不做任何迁移：已启动的执行沿用其冻结的版本与 `team_runs.config`（F2） | **热更新运行中的团队预算**：破坏「运行版本不漂移」 |
| 回滚 | 仅当发布版本仍是候选版本时，`publish({ versionId: base })`；草稿当前值仍等于建议值才回写原值（路由原值为空则删除该键），否则记「草稿已被手工修改」 | **无条件回写草稿**：会覆盖人工修改 |
| 失效 | 评测或发布时基线已不是发布版本 → 提案置 `superseded` 并返回 409。`superseded` 在独立事务中提交（先无锁读取判断，再脱离请求事务写入），否则会随请求事务回滚（F5） | **在请求事务内标记**：抛 409 后标记丢失 |
| 评测结算 | 执行终态事件结算对应 run；事件可能早于发出方提交或丢失，60 秒清扫按执行实际状态补偿，并为启动缺行的评测重做启动；全部 run 行（用例 × 2）都已结算才汇总结论 | **只靠事件**：丢事件评测永远停在评测中；**按已有行数判断完成**：早结束的 run 可能在其余 run 插入前就触发结算 |
| 超时 | `deadline = max(30 分钟, 2 × 候选版本团队节点最大截止时间)`；超时取消在途执行、评测失败（`timeout`）、提案回到 `proposed` | **无超时**：卡住的执行让提案永远无法处理 |
| 与 self-evolution 的关系 | 不复用（F6）：提案需要落库、可审计、跨会话审批 | **复用会话内提案工具**：审批记录不持久 |

## 后果

- 变容易：任何「配置不足」的结论都有证据、候选快照、两臂执行与结论可追溯；发布与回滚都是版本指针切换，审计日志记录 `optimization.proposal.published` / `rolled-back`。
- 变困难：评测执行计入执行列表与租户配额；评测期间发布版本被人工改动会让提案失效，需要重新分析。
- 新约束：同一 (工作流, 节点, 提案类型) 同时只有一条 `proposed` / `evaluating` / `evaluated` 提案（部分唯一索引）；评测执行以 `launchSource: 'evaluation'`、`triggerType: 'system'` 启动，不作为后续分析的证据；提案服务的写操作先锁提案行再转换状态。

## 确认方式

- 单测：`pnpm --filter agentloom-server test src/modules/optimization-proposal src/modules/workflow-definition src/modules/execution/__tests__/execution.service.spec.ts`。
- 全链路 E2E（三次预算耗尽 → 提案 1 → 2 → 评测基线 0% / 候选 100% → 发布 → 在途执行仍为 v1 → 回滚）：`E2E_REDIS_URL=… pnpm --filter agentloom-server test:e2e -- optimization-proposal.e2e`。
- RLS：`pnpm --filter agentloom-server test:e2e -- optimization-proposal-rls`。
