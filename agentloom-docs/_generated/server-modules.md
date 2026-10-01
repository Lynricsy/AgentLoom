<!-- 由 scripts/docs-reference/generate.ts 生成，勿手改；运行 pnpm docs:gen -->

来源：`agentloom-server/src/modules/*/`。REST 前缀取自各 `*.controller.ts` 的 `@Controller()`（全局前缀 `/api/v1`），Socket 命名空间取自 `*.gateway.ts`，队列取自模块内 `*_QUEUE` 常量。

| 模块 | REST 前缀 | Socket 命名空间 | BullMQ 队列 |
| --- | --- | --- | --- |
| `acp-gateway` |  |  |  |
| `agent` | `/api/v1/agent-runtime` |  |  |
| `agent-api` | `/api/v1/agent-api`<br>`/api/v1/agent-definitions/:agentId/api-keys` |  |  |
| `agent-api-runtime` |  |  | `agent-api-maintenance` |
| `agent-conversation` | `/api/v1` |  |  |
| `agent-definition` | `/api/v1/agent-definitions` |  |  |
| `agent-execution` |  | `/agent-conversation` | `agent-conversation-execution` |
| `agent-memory` | `/api/v1/memory-instances` | `/memory` |  |
| `api-key` | `/api/v1/api-keys` |  |  |
| `auth` | `/api/v1/auth`<br>`/api/v1/auth/mfa`<br>`/api/v1/auth/oauth` |  |  |
| `evidence` | `/api/v1/audit-logs`<br>`/api/v1/evidence-exports`<br>`/api/v1/executions/:executionId/evidence` |  | `audit-log-retention`<br>`evidence-export`<br>`evidence-export-cleanup` |
| `execution` | `/api/v1` | `/execution` | `agent-task`<br>`workflow-execution` |
| `execution-record` | `/api/v1/execution-records` |  |  |
| `generated-app` | `/api/v1/generated-apps`<br>`/api/v1/generated-apps/public` |  |  |
| `health` | `/api/v1/health` |  |  |
| `intervention-policy` | `/api/v1/workflow-definitions/:workflowId/intervention-policies` |  |  |
| `knowledge` | `/api/v1/knowledge-bases` | `/knowledge` | `document-indexing`<br>`document-processing` |
| `llm` | `/api/v1/llm`<br>`/api/v1/llm-models`<br>`/api/v1/llm-providers` |  |  |
| `marketplace` | `/api/v1/marketplace`<br>`/api/v1/marketplace/browse` |  |  |
| `mcp` | `/api/v1/mcp` |  |  |
| `monitoring` | `/api/v1` |  |  |
| `notification` | `/api/v1`<br>`/api/v1/devices` | `/notification` | `notification` |
| `optimization-suggestion` | `/api/v1/optimization-suggestions` |  | `optimization-analysis` |
| `organization` | `/api/v1` |  |  |
| `platform-api-token` | `/api/v1/platform-api-tokens` |  |  |
| `plugin` | `/api/v1/plugins`<br>`/api/v1/plugins/developer-keys`<br>`/api/v1/plugins/marketplace` |  | `earnings-settlement`<br>`plugin-execution` |
| `private-deployment` | `/api/v1` |  |  |
| `resource-governance` | `/api/v1` |  |  |
| `resource-source` | `/api/v1/resource-sources` |  |  |
| `reusable-block` | `/api/v1/reusable-blocks` |  |  |
| `sandbox` | `/api/v1`<br>`/api/v1/sandbox-nodes` |  | `sandbox-lifecycle` |
| `self-evolution` |  |  |  |
| `share` | `/api/v1/agent-shares`<br>`/api/v1/s`<br>`/api/v1/workflow-shares` |  |  |
| `shared-resources` |  |  |  |
| `skill` | `/api/v1/skills` |  |  |
| `smart-routing` | `/api/v1` |  | `routing-learning` |
| `template` | `/api/v1/templates` |  |  |
| `tenant-key` | `/api/v1/tenant-keys` |  |  |
| `trigger` | `/api/v1/api-events`<br>`/api/v1/webhooks`<br>`/api/v1/workflow-definitions/:workflowId/triggers` |  | `trigger-scheduler` |
| `user-preference` | `/api/v1/user-preferences` |  |  |
| `workflow` |  |  |  |
| `workflow-definition` | `/api/v1/workflow-definitions`<br>`/api/v1/workflow-definitions/:workflowId` |  |  |
| `workspace` | `/api/v1/workspaces` |  |  |
