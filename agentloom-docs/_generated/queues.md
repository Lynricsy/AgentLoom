<!-- 由 scripts/docs-reference/generate.ts 生成，勿手改；运行 pnpm docs:gen -->

来源：`agentloom-server/src` 中所有 `*_QUEUE = '…'` 常量；Worker 为 `@Processor(<常量>)` 所在类。

| 队列名 | 常量 | Worker | 定义文件 |
| --- | --- | --- | --- |
| `agent-api-maintenance` | `AGENT_API_MAINTENANCE_QUEUE` | `AgentApiMaintenanceWorker` | `agentloom-server/src/modules/agent-api-runtime/agent-api-runtime.constants.ts` |
| `agent-conversation-execution` | `AGENT_CONVERSATION_EXECUTION_QUEUE` | `AgentExecutionWorker` | `agentloom-server/src/modules/agent-execution/agent-execution.service.ts` |
| `agent-task` | `AGENT_TASK_QUEUE` | `AgentTaskWorker` | `agentloom-server/src/modules/execution/execution.constants.ts` |
| `audit-log-retention` | `AUDIT_LOG_RETENTION_QUEUE` | `AuditLogRetentionWorker` | `agentloom-server/src/modules/evidence/audit-log-retention.constants.ts` |
| `document-indexing` | `DOCUMENT_INDEXING_QUEUE` | `DocumentIndexingWorker` | `agentloom-server/src/modules/knowledge/knowledge.constants.ts` |
| `document-processing` | `DOCUMENT_PROCESSING_QUEUE` | `DocumentProcessingWorker` | `agentloom-server/src/modules/knowledge/knowledge.constants.ts` |
| `earnings-settlement` | `EARNINGS_SETTLEMENT_QUEUE` | `EarningsSettlementWorker` | `agentloom-server/src/modules/plugin/plugin.constants.ts` |
| `evidence-export` | `EVIDENCE_EXPORT_QUEUE` | `EvidenceExportWorker` | `agentloom-server/src/modules/evidence/evidence-export.constants.ts` |
| `evidence-export-cleanup` | `EVIDENCE_EXPORT_CLEANUP_QUEUE` | `EvidenceExportCleanupWorker` | `agentloom-server/src/modules/evidence/evidence-export.constants.ts` |
| `notification` | `NOTIFICATION_QUEUE` | `NotificationProcessor` | `agentloom-server/src/modules/notification/notification.constants.ts` |
| `optimization-analysis` | `OPTIMIZATION_ANALYSIS_QUEUE` | `OptimizationAnalysisWorker` | `agentloom-server/src/modules/optimization-suggestion/optimization-analysis.constants.ts` |
| `plugin-execution` | `PLUGIN_EXECUTION_QUEUE` | `PluginExecutionWorker` | `agentloom-server/src/modules/plugin/plugin.constants.ts` |
| `routing-learning` | `ROUTING_LEARNING_QUEUE` | `RoutingLearningWorker` | `agentloom-server/src/modules/smart-routing/learning/routing-learning.types.ts` |
| `sandbox-lifecycle` | `SANDBOX_LIFECYCLE_QUEUE` | `SandboxLifecycleWorker` | `agentloom-server/src/modules/sandbox/sandbox.constants.ts` |
| `trigger-scheduler` | `TRIGGER_QUEUE` | `TriggerSchedulerProcessor` | `agentloom-server/src/modules/trigger/trigger.constants.ts` |
| `workflow-execution` | `EXECUTION_QUEUE` | `ExecutionWorker` | `agentloom-server/src/modules/execution/execution.constants.ts` |
