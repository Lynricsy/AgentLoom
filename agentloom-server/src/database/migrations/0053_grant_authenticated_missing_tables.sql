-- Retrofit GRANT for 30 RLS-enabled tables that were missing authenticated role grants.
-- Without these GRANTs, SET LOCAL ROLE authenticated results in "permission denied" (42501)
-- even though RLS policies targeting the authenticated role exist on each table.
-- Precedent: migration 0027_tidy_marauders.sql applied the same retrofit for workflow_executions/execution_steps.

-- 0014: mcp_server_configs, tool_definitions
GRANT SELECT, INSERT, UPDATE, DELETE ON "mcp_server_configs" TO "authenticated";--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "tool_definitions" TO "authenticated";--> statement-breakpoint

-- 0015: documents, knowledge_bases
GRANT SELECT, INSERT, UPDATE, DELETE ON "documents" TO "authenticated";--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "knowledge_bases" TO "authenticated";--> statement-breakpoint

-- 0016: document_chunks
GRANT SELECT, INSERT, UPDATE, DELETE ON "document_chunks" TO "authenticated";--> statement-breakpoint

-- 0020: sandbox_logs, sandbox_sessions
GRANT SELECT, INSERT, UPDATE, DELETE ON "sandbox_logs" TO "authenticated";--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "sandbox_sessions" TO "authenticated";--> statement-breakpoint

-- 0022: notification_preferences, notifications
GRANT SELECT, INSERT, UPDATE, DELETE ON "notification_preferences" TO "authenticated";--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "notifications" TO "authenticated";--> statement-breakpoint

-- 0023: evidence_records
GRANT SELECT, INSERT, UPDATE, DELETE ON "evidence_records" TO "authenticated";--> statement-breakpoint

-- 0037: tenant_encryption_keys
GRANT SELECT, INSERT, UPDATE, DELETE ON "tenant_encryption_keys" TO "authenticated";--> statement-breakpoint

-- 0045: evidence_export_jobs
GRANT SELECT, INSERT, UPDATE, DELETE ON "evidence_export_jobs" TO "authenticated";--> statement-breakpoint

-- 0047: execution_governance_controls, tenant_quotas
GRANT SELECT, INSERT, UPDATE, DELETE ON "execution_governance_controls" TO "authenticated";--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "tenant_quotas" TO "authenticated";--> statement-breakpoint

-- 0050: agent_conversations, agent_definitions, agent_messages, agent_versions, workspace_snapshots
GRANT SELECT, INSERT, UPDATE, DELETE ON "agent_conversations" TO "authenticated";--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "agent_definitions" TO "authenticated";--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "agent_messages" TO "authenticated";--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "agent_versions" TO "authenticated";--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "workspace_snapshots" TO "authenticated";--> statement-breakpoint

-- 0051: agent_memory_instances, memory_edges, memory_glossary_keywords, memory_nodes,
--        memory_paths, memory_sessions, memory_versions,
--        provider_health_status, router_models, routing_benchmarks
GRANT SELECT, INSERT, UPDATE, DELETE ON "agent_memory_instances" TO "authenticated";--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "memory_edges" TO "authenticated";--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "memory_glossary_keywords" TO "authenticated";--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "memory_nodes" TO "authenticated";--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "memory_paths" TO "authenticated";--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "memory_sessions" TO "authenticated";--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "memory_versions" TO "authenticated";--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "provider_health_status" TO "authenticated";--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "router_models" TO "authenticated";--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "routing_benchmarks" TO "authenticated";--> statement-breakpoint

-- 0052: skills
GRANT SELECT, INSERT, UPDATE, DELETE ON "skills" TO "authenticated";
