<!-- 由 scripts/docs-reference/generate.ts 生成，勿手改；运行 pnpm docs:gen -->

来源：`agentloom-server/src/database/schema/index.ts` 导出的全部 Drizzle `pgTable`，按定义文件排序。

| 表名 | 列数 | 含 `tenant_id` | 定义文件 |
| --- | --- | --- | --- |
| `acp_conversation_sessions` | 7 | 是 | `acp-conversation-sessions.schema.ts` |
| `agent_api_keys` | 14 | 是 | `agent-api-keys.schema.ts` |
| `agent_api_runs` | 15 | 是 | `agent-api-runs.schema.ts` |
| `agent_conversations` | 12 | 是 | `agent-conversations.schema.ts` |
| `agent_messages` | 11 | 是 | `agent-conversations.schema.ts` |
| `agent_definitions` | 21 | 是 | `agent-definitions.schema.ts` |
| `agent_versions` | 10 | 是 | `agent-definitions.schema.ts` |
| `agent_memory_instances` | 13 | 是 | `agent-memory-instances.schema.ts` |
| `agent_shares` | 12 | 是 | `agent-shares.schema.ts` |
| `api_keys` | 18 | 是 | `api-keys.schema.ts` |
| `audit_log_archives` | 13 | 是 | `audit-logs.schema.ts` |
| `audit_logs` | 13 | 是 | `audit-logs.schema.ts` |
| `device_tokens` | 7 | 否 | `device-tokens.schema.ts` |
| `evidence_export_jobs` | 17 | 是 | `evidence-export-jobs.schema.ts` |
| `evidence_records` | 11 | 是 | `evidence.schema.ts` |
| `execution_governance_controls` | 12 | 是 | `execution-governance-controls.schema.ts` |
| `agent_execution_records` | 9 | 是 | `execution-records.schema.ts` |
| `execution_steps` | 17 | 否 | `execution-steps.schema.ts` |
| `generated_app_gate_runs` | 20 | 是 | `generated-apps.schema.ts` |
| `generated_app_generation_runs` | 15 | 是 | `generated-apps.schema.ts` |
| `generated_app_repair_attempts` | 17 | 是 | `generated-apps.schema.ts` |
| `generated_app_submissions` | 14 | 是 | `generated-apps.schema.ts` |
| `generated_apps` | 23 | 是 | `generated-apps.schema.ts` |
| `intervention_policies` | 14 | 是 | `intervention-policies.schema.ts` |
| `documents` | 12 | 是 | `knowledge-bases.schema.ts` |
| `knowledge_bases` | 14 | 是 | `knowledge-bases.schema.ts` |
| `knowledge_nodes` | 11 | 是 | `knowledge-nodes.schema.ts` |
| `llm_model_configs` | 19 | 是 | `llm-model-configs.schema.ts` |
| `llm_providers` | 15 | 是 | `llm-providers.schema.ts` |
| `marketplace_listings` | 23 | 是 | `marketplace-listings.schema.ts` |
| `marketplace_reviews` | 7 | 否 | `marketplace-reviews.schema.ts` |
| `mcp_server_configs` | 19 | 是 | `mcp-server-configs.schema.ts` |
| `memory_edges` | 9 | 是 | `memory-edges.schema.ts` |
| `memory_glossary_keywords` | 6 | 是 | `memory-glossary-keywords.schema.ts` |
| `memory_nodes` | 7 | 是 | `memory-nodes.schema.ts` |
| `memory_paths` | 8 | 是 | `memory-paths.schema.ts` |
| `memory_sessions` | 10 | 是 | `memory-sessions.schema.ts` |
| `memory_versions` | 11 | 是 | `memory-versions.schema.ts` |
| `notification_preferences` | 6 | 是 | `notifications.schema.ts` |
| `notifications` | 8 | 是 | `notifications.schema.ts` |
| `optimization_suggestions` | 20 | 是 | `optimization-suggestions.schema.ts` |
| `organization_autonomy_policies` | 9 | 是 | `org-autonomy-policies.schema.ts` |
| `organization_invitations` | 12 | 否 | `organizations.schema.ts` |
| `organization_members` | 6 | 否 | `organizations.schema.ts` |
| `organizations` | 10 | 是 | `organizations.schema.ts` |
| `platform_api_tokens` | 12 | 是 | `platform-api-tokens.schema.ts` |
| `plugin_developer_keys` | 11 | 是 | `plugin-developer-keys.schema.ts` |
| `plugin_earnings` | 24 | 是 | `plugin-earnings.schema.ts` |
| `plugin_usage_records` | 19 | 是 | `plugin-usage-records.schema.ts` |
| `plugins` | 22 | 是 | `plugins.schema.ts` |
| `private_deployment_settings` | 39 | 是 | `private-deployment-settings.schema.ts` |
| `provider_health_status` | 11 | 是 | `provider-health-status.schema.ts` |
| `resource_source_records` | 15 | 是 | `resource-source-records.schema.ts` |
| `reusable_blocks` | 14 | 是 | `reusable-blocks.schema.ts` |
| `revoked_tokens` | 4 | 否 | `revoked-tokens.schema.ts` |
| `router_models` | 11 | 是 | `router-models.schema.ts` |
| `routing_benchmarks` | 10 | 否 | `routing-benchmarks.schema.ts` |
| `routing_decisions` | 11 | 是 | `routing-decisions.schema.ts` |
| `runtime_plugins` | 21 | 是 | `runtime-plugins.schema.ts` |
| `sandbox_logs` | 5 | 否 | `sandbox-logs.schema.ts` |
| `sandbox_runtime_migrations` | 19 | 是 | `sandbox-runtime-migrations.schema.ts` |
| `sandbox_runtime_nodes` | 6 | 否 | `sandbox-runtime-nodes.schema.ts` |
| `sandbox_sessions` | 12 | 是 | `sandbox-sessions.schema.ts` |
| `skills` | 16 | 是 | `skills.schema.ts` |
| `tenant_encryption_keys` | 11 | 是 | `tenant-encryption-keys.schema.ts` |
| `tenant_quotas` | 15 | 是 | `tenant-quotas.schema.ts` |
| `tool_definitions` | 16 | 是 | `tool-definitions.schema.ts` |
| `user_preferences` | 7 | 是 | `user-preferences.schema.ts` |
| `users` | 9 | 否 | `users.schema.ts` |
| `workflow_definitions` | 18 | 是 | `workflow-definitions.schema.ts` |
| `workflow_executions` | 18 | 是 | `workflow-executions.schema.ts` |
| `workflow_shares` | 12 | 是 | `workflow-shares.schema.ts` |
| `workflow_templates` | 13 | 否 | `workflow-templates.schema.ts` |
| `workflow_trigger_history` | 8 | 是 | `workflow-triggers.schema.ts` |
| `workflow_triggers` | 14 | 是 | `workflow-triggers.schema.ts` |
| `workflow_versions` | 10 | 是 | `workflow-versions.schema.ts` |
| `workspace_runtime_leases` | 8 | 是 | `workspace-runtime-leases.schema.ts` |
| `workspace_snapshots` | 12 | 是 | `workspace-snapshots.schema.ts` |

### acp_conversation_sessions

定义：`agentloom-server/src/database/schema/acp-conversation-sessions.schema.ts`

| 列 | 类型 | 非空 | 默认值 |
| --- | --- | --- | --- |
| `session_id`（主键） | `text` | 是 |  |
| `tenant_id` | `uuid` | 是 |  |
| `agent_id` | `text` | 是 |  |
| `session_snapshot` | `jsonb` | 是 |  |
| `replay_entries` | `jsonb` | 是 | `'[]'::jsonb` |
| `created_at` | `timestamp with time zone` | 是 | `now()` |
| `updated_at` | `timestamp with time zone` | 是 | `now()` |

### agent_api_keys

定义：`agentloom-server/src/database/schema/agent-api-keys.schema.ts`

| 列 | 类型 | 非空 | 默认值 |
| --- | --- | --- | --- |
| `id`（主键） | `uuid` | 是 | `uuid_generate_v7()` |
| `tenant_id` | `uuid` | 是 |  |
| `agent_definition_id` | `uuid` | 是 |  |
| `name` | `varchar(255)` | 是 |  |
| `key_hash` | `varchar(64)` | 是 |  |
| `key_prefix` | `varchar(16)` | 是 |  |
| `rate_limit_per_minute` | `integer` |  |  |
| `max_concurrent_runs` | `integer` | 是 | `5` |
| `expires_at` | `timestamp with time zone` |  |  |
| `revoked_at` | `timestamp with time zone` |  |  |
| `last_used_at` | `timestamp with time zone` |  |  |
| `created_by` | `uuid` |  |  |
| `created_at` | `timestamp with time zone` | 是 | `now()` |
| `updated_at` | `timestamp with time zone` | 是 | `now()` |

### agent_api_runs

定义：`agentloom-server/src/database/schema/agent-api-runs.schema.ts`

| 列 | 类型 | 非空 | 默认值 |
| --- | --- | --- | --- |
| `id`（主键） | `uuid` | 是 | `uuid_generate_v7()` |
| `tenant_id` | `uuid` | 是 |  |
| `conversation_id` | `uuid` | 是 |  |
| `api_key_id` | `uuid` | 是 |  |
| `user_message_id` | `uuid` | 是 |  |
| `assistant_message_id` | `uuid` |  |  |
| `agent_version_id` | `uuid` |  |  |
| `status` | `agent_api_run_status_enum` | 是 | `"queued"` |
| `stop_reason` | `varchar(32)` |  |  |
| `error` | `jsonb` |  | `null` |
| `idempotency_key` | `varchar(255)` |  |  |
| `request_hash` | `varchar(64)` |  |  |
| `created_at` | `timestamp with time zone` | 是 | `now()` |
| `started_at` | `timestamp with time zone` |  |  |
| `completed_at` | `timestamp with time zone` |  |  |

### agent_conversations

定义：`agentloom-server/src/database/schema/agent-conversations.schema.ts`

| 列 | 类型 | 非空 | 默认值 |
| --- | --- | --- | --- |
| `id`（主键） | `uuid` | 是 | `uuid_generate_v7()` |
| `agent_definition_id` | `uuid` | 是 |  |
| `tenant_id` | `uuid` | 是 |  |
| `title` | `varchar(255)` |  |  |
| `status` | `conversation_status_enum` | 是 | `"active"` |
| `metadata` | `jsonb` | 是 | `{}` |
| `created_by` | `uuid` |  |  |
| `source` | `conversation_source_enum` | 是 | `"studio"` |
| `api_key_id` | `uuid` |  |  |
| `external_user_id` | `varchar(255)` |  |  |
| `created_at` | `timestamp with time zone` | 是 | `now()` |
| `updated_at` | `timestamp with time zone` | 是 | `now()` |

### agent_messages

定义：`agentloom-server/src/database/schema/agent-conversations.schema.ts`

| 列 | 类型 | 非空 | 默认值 |
| --- | --- | --- | --- |
| `id`（主键） | `uuid` | 是 | `uuid_generate_v7()` |
| `conversation_id` | `uuid` | 是 |  |
| `tenant_id` | `uuid` | 是 |  |
| `role` | `message_role_enum` | 是 |  |
| `content_type` | `message_content_type_enum` | 是 | `"text"` |
| `content` | `text` | 是 |  |
| `tool_calls` | `jsonb` |  | `null` |
| `tool_results` | `jsonb` |  | `null` |
| `metadata` | `jsonb` | 是 | `{}` |
| `parent_message_id` | `uuid` |  |  |
| `created_at` | `timestamp with time zone` | 是 | `now()` |

### agent_definitions

定义：`agentloom-server/src/database/schema/agent-definitions.schema.ts`

| 列 | 类型 | 非空 | 默认值 |
| --- | --- | --- | --- |
| `id`（主键） | `uuid` | 是 | `uuid_generate_v7()` |
| `tenant_id` | `uuid` | 是 |  |
| `name` | `varchar(255)` | 是 |  |
| `slug` | `varchar(255)` | 是 |  |
| `description` | `text` |  |  |
| `icon` | `varchar(255)` |  |  |
| `runtime_mode` | `agent_runtime_mode_enum` | 是 | `"sandbox"` |
| `system_prompt` | `text` |  |  |
| `nodes` | `jsonb` | 是 | `[]` |
| `edges` | `jsonb` | 是 | `[]` |
| `viewport` | `jsonb` |  |  |
| `metadata` | `jsonb` | 是 | `{}` |
| `sandbox_config` | `jsonb` |  | `null` |
| `workspace_snapshot_id` | `uuid` |  |  |
| `version` | `integer` | 是 | `1` |
| `status` | `agent_status_enum` | 是 | `"draft"` |
| `published_version_id` | `uuid` |  |  |
| `created_by` | `uuid` | 是 |  |
| `updated_by` | `uuid` | 是 |  |
| `created_at` | `timestamp with time zone` | 是 | `now()` |
| `updated_at` | `timestamp with time zone` | 是 | `now()` |

### agent_versions

定义：`agentloom-server/src/database/schema/agent-definitions.schema.ts`

| 列 | 类型 | 非空 | 默认值 |
| --- | --- | --- | --- |
| `id`（主键） | `uuid` | 是 | `uuid_generate_v7()` |
| `agent_definition_id` | `uuid` | 是 |  |
| `tenant_id` | `uuid` | 是 |  |
| `version_number` | `integer` | 是 |  |
| `label` | `varchar(255)` |  |  |
| `snapshot` | `jsonb` | 是 |  |
| `published_at` | `timestamp with time zone` |  |  |
| `archived_at` | `timestamp with time zone` |  |  |
| `created_by` | `uuid` | 是 |  |
| `created_at` | `timestamp with time zone` | 是 | `now()` |

### agent_memory_instances

定义：`agentloom-server/src/database/schema/agent-memory-instances.schema.ts`

| 列 | 类型 | 非空 | 默认值 |
| --- | --- | --- | --- |
| `id`（主键） | `uuid` | 是 | `uuid_generate_v7()` |
| `tenant_id` | `uuid` | 是 |  |
| `name` | `varchar(255)` | 是 |  |
| `description` | `text` |  |  |
| `config` | `jsonb` |  |  |
| `system_prompt_override` | `text` |  |  |
| `valid_domains` | `text[]` | 是 | `ARRAY['core', 'notes']::text[]` |
| `core_memory_uris` | `text[]` | 是 | `ARRAY['core://agent']::text[]` |
| `status` | `memory_instance_status` | 是 | `"active"` |
| `occ_version` | `integer` | 是 | `1` |
| `created_by` | `uuid` |  |  |
| `created_at` | `timestamp with time zone` | 是 | `now()` |
| `updated_at` | `timestamp with time zone` | 是 | `now()` |

### agent_shares

定义：`agentloom-server/src/database/schema/agent-shares.schema.ts`

| 列 | 类型 | 非空 | 默认值 |
| --- | --- | --- | --- |
| `id`（主键） | `uuid` | 是 | `uuid_generate_v7()` |
| `agent_definition_id` | `uuid` | 是 |  |
| `tenant_id` | `uuid` | 是 |  |
| `share_token` | `text` | 是 |  |
| `share_type` | `share_type` | 是 | `"read_only"` |
| `created_by` | `uuid` | 是 |  |
| `expires_at` | `timestamp with time zone` |  |  |
| `is_revoked` | `boolean` | 是 | `false` |
| `view_count` | `integer` | 是 | `0` |
| `copy_count` | `integer` | 是 | `0` |
| `created_at` | `timestamp with time zone` | 是 | `now()` |
| `updated_at` | `timestamp with time zone` | 是 | `now()` |

### api_keys

定义：`agentloom-server/src/database/schema/api-keys.schema.ts`

| 列 | 类型 | 非空 | 默认值 |
| --- | --- | --- | --- |
| `id`（主键） | `uuid` | 是 | `uuid_generate_v7()` |
| `tenant_id` | `uuid` | 是 |  |
| `organization_id` | `uuid` | 是 |  |
| `user_id` | `uuid` | 是 |  |
| `provider` | `varchar(50)` | 是 |  |
| `label` | `varchar(255)` | 是 |  |
| `key_preview` | `varchar(10)` | 是 |  |
| `encrypted_key` | `bytea` |  |  |
| `encrypted_dek` | `bytea` |  |  |
| `iv` | `bytea` |  |  |
| `auth_tag` | `bytea` |  |  |
| `is_default` | `boolean` | 是 | `false` |
| `status` | `api_key_status` | 是 | `"active"` |
| `last_used_at` | `timestamp with time zone` |  |  |
| `rotated_at` | `timestamp with time zone` |  |  |
| `expires_at` | `timestamp with time zone` |  |  |
| `created_at` | `timestamp with time zone` | 是 | `now()` |
| `updated_at` | `timestamp with time zone` | 是 | `now()` |

### audit_log_archives

定义：`agentloom-server/src/database/schema/audit-logs.schema.ts`

| 列 | 类型 | 非空 | 默认值 |
| --- | --- | --- | --- |
| `id`（主键） | `uuid` | 是 | `uuid_generate_v7()` |
| `tenant_id` | `uuid` | 是 |  |
| `actor_id` | `uuid` |  |  |
| `actor_type` | `audit_actor_type` | 是 |  |
| `event_type` | `text` | 是 |  |
| `resource_type` | `text` | 是 |  |
| `resource_id` | `text` | 是 |  |
| `execution_id` | `uuid` |  |  |
| `summary` | `text` | 是 |  |
| `before` | `jsonb` |  |  |
| `after` | `jsonb` |  |  |
| `metadata` | `jsonb` |  |  |
| `created_at` | `timestamp with time zone` | 是 | `now()` |

### audit_logs

定义：`agentloom-server/src/database/schema/audit-logs.schema.ts`

| 列 | 类型 | 非空 | 默认值 |
| --- | --- | --- | --- |
| `id`（主键） | `uuid` | 是 | `uuid_generate_v7()` |
| `tenant_id` | `uuid` | 是 |  |
| `actor_id` | `uuid` |  |  |
| `actor_type` | `audit_actor_type` | 是 |  |
| `event_type` | `text` | 是 |  |
| `resource_type` | `text` | 是 |  |
| `resource_id` | `text` | 是 |  |
| `execution_id` | `uuid` |  |  |
| `summary` | `text` | 是 |  |
| `before` | `jsonb` |  |  |
| `after` | `jsonb` |  |  |
| `metadata` | `jsonb` |  |  |
| `created_at` | `timestamp with time zone` | 是 | `now()` |

### device_tokens

定义：`agentloom-server/src/database/schema/device-tokens.schema.ts`

| 列 | 类型 | 非空 | 默认值 |
| --- | --- | --- | --- |
| `id`（主键） | `uuid` | 是 | `uuid_generate_v7()` |
| `user_id` | `uuid` | 是 |  |
| `device_token` | `varchar(512)` | 是 |  |
| `platform` | `varchar(10)` | 是 |  |
| `is_active` | `boolean` | 是 | `true` |
| `created_at` | `timestamp with time zone` | 是 | `now()` |
| `updated_at` | `timestamp with time zone` | 是 | `now()` |

### evidence_export_jobs

定义：`agentloom-server/src/database/schema/evidence-export-jobs.schema.ts`

| 列 | 类型 | 非空 | 默认值 |
| --- | --- | --- | --- |
| `id`（主键） | `uuid` | 是 | `uuid_generate_v7()` |
| `tenant_id` | `uuid` | 是 |  |
| `requested_by` | `uuid` | 是 |  |
| `status` | `evidence_export_job_status` | 是 | `"queued"` |
| `filters` | `jsonb` | 是 |  |
| `storage_key` | `varchar(512)` |  |  |
| `artifact_format` | `varchar(32)` | 是 |  |
| `file_name` | `varchar(255)` |  |  |
| `mime_type` | `varchar(255)` |  |  |
| `matched_execution_count` | `integer` | 是 | `0` |
| `expires_at` | `timestamp with time zone` |  |  |
| `requested_at` | `timestamp with time zone` | 是 | `now()` |
| `completed_at` | `timestamp with time zone` |  |  |
| `failed_at` | `timestamp with time zone` |  |  |
| `last_error` | `text` |  |  |
| `created_at` | `timestamp with time zone` | 是 | `now()` |
| `updated_at` | `timestamp with time zone` | 是 | `now()` |

### evidence_records

定义：`agentloom-server/src/database/schema/evidence.schema.ts`

| 列 | 类型 | 非空 | 默认值 |
| --- | --- | --- | --- |
| `id`（主键） | `uuid` | 是 | `uuid_generate_v7()` |
| `execution_id` | `uuid` | 是 |  |
| `step_id` | `uuid` | 是 |  |
| `tenant_id` | `uuid` | 是 |  |
| `source_type` | `evidence_source_type` | 是 |  |
| `packet` | `jsonb` | 是 |  |
| `content_hash` | `varchar(64)` | 是 |  |
| `parent_evidence_id` | `uuid` |  |  |
| `is_encrypted` | `boolean` | 是 | `false` |
| `encryption_metadata` | `jsonb` |  |  |
| `created_at` | `timestamp with time zone` | 是 | `now()` |

### execution_governance_controls

定义：`agentloom-server/src/database/schema/execution-governance-controls.schema.ts`

| 列 | 类型 | 非空 | 默认值 |
| --- | --- | --- | --- |
| `id`（主键） | `uuid` | 是 | `uuid_generate_v7()` |
| `organization_id` | `uuid` | 是 |  |
| `tenant_id` | `uuid` | 是 |  |
| `scope` | `governance_scope_enum` | 是 |  |
| `target_id` | `uuid` | 是 |  |
| `status` | `execution_governance_state_enum` | 是 | `"active"` |
| `reason` | `text` |  |  |
| `version` | `integer` | 是 | `1` |
| `created_by` | `uuid` | 是 |  |
| `updated_by` | `uuid` | 是 |  |
| `created_at` | `timestamp with time zone` | 是 | `now()` |
| `updated_at` | `timestamp with time zone` | 是 | `now()` |

### agent_execution_records

定义：`agentloom-server/src/database/schema/execution-records.schema.ts`

| 列 | 类型 | 非空 | 默认值 |
| --- | --- | --- | --- |
| `id`（主键） | `uuid` | 是 | `uuid_generate_v7()` |
| `tenant_id` | `uuid` | 是 |  |
| `execution_id` | `uuid` | 是 |  |
| `step_id` | `uuid` |  |  |
| `node_id` | `text` |  |  |
| `record_type` | `record_type` | 是 |  |
| `telemetry_data` | `jsonb` |  |  |
| `summary_data` | `jsonb` |  |  |
| `created_at` | `timestamp with time zone` | 是 | `now()` |

### execution_steps

定义：`agentloom-server/src/database/schema/execution-steps.schema.ts`

| 列 | 类型 | 非空 | 默认值 |
| --- | --- | --- | --- |
| `id`（主键） | `uuid` | 是 | `uuid_generate_v7()` |
| `execution_id` | `uuid` | 是 |  |
| `node_id` | `text` | 是 |  |
| `step_order` | `integer` | 是 |  |
| `status` | `step_status_enum` | 是 | `"pending"` |
| `node_type` | `jsonb` |  |  |
| `node_data` | `jsonb` |  |  |
| `input` | `jsonb` |  |  |
| `result` | `jsonb` |  |  |
| `attempt_count` | `integer` | 是 | `0` |
| `checkpoint_data` | `jsonb` |  |  |
| `error_message` | `jsonb` |  |  |
| `is_encrypted` | `boolean` | 是 | `false` |
| `started_at` | `timestamp with time zone` |  |  |
| `completed_at` | `timestamp with time zone` |  |  |
| `created_at` | `timestamp with time zone` | 是 | `now()` |
| `updated_at` | `timestamp with time zone` | 是 | `now()` |

### generated_app_gate_runs

定义：`agentloom-server/src/database/schema/generated-apps.schema.ts`

| 列 | 类型 | 非空 | 默认值 |
| --- | --- | --- | --- |
| `id`（主键） | `uuid` | 是 | `uuid_generate_v7()` |
| `tenant_id` | `uuid` | 是 |  |
| `generated_app_id` | `uuid` | 是 |  |
| `generation_run_id` | `uuid` |  |  |
| `repair_attempt_id` | `uuid` |  |  |
| `gate_id` | `varchar(64)` | 是 |  |
| `gate_order` | `integer` | 是 |  |
| `gate_name` | `varchar(255)` | 是 |  |
| `blocking` | `boolean` | 是 |  |
| `attempt_number` | `integer` | 是 | `1` |
| `status` | `generated_app_gate_run_status` | 是 |  |
| `summary` | `text` | 是 |  |
| `evidence` | `jsonb` | 是 | `'[]'::jsonb` |
| `failure` | `jsonb` |  |  |
| `repair_instructions` | `text` |  |  |
| `started_at` | `timestamp with time zone` | 是 | `now()` |
| `completed_at` | `timestamp with time zone` |  |  |
| `created_by` | `uuid` |  |  |
| `created_at` | `timestamp with time zone` | 是 | `now()` |
| `updated_at` | `timestamp with time zone` | 是 | `now()` |

### generated_app_generation_runs

定义：`agentloom-server/src/database/schema/generated-apps.schema.ts`

| 列 | 类型 | 非空 | 默认值 |
| --- | --- | --- | --- |
| `id`（主键） | `uuid` | 是 | `uuid_generate_v7()` |
| `tenant_id` | `uuid` | 是 |  |
| `generated_app_id` | `uuid` | 是 |  |
| `run_number` | `integer` | 是 | `1` |
| `status` | `generated_app_generation_run_status` | 是 | `"running"` |
| `trigger_source` | `generated_app_generation_run_trigger` | 是 | `"manual"` |
| `max_repair_attempts` | `integer` | 是 | `3` |
| `max_runtime_seconds` | `integer` | 是 | `1800` |
| `summary` | `text` | 是 |  |
| `failure_reason` | `text` |  |  |
| `started_at` | `timestamp with time zone` | 是 | `now()` |
| `completed_at` | `timestamp with time zone` |  |  |
| `created_by` | `uuid` |  |  |
| `created_at` | `timestamp with time zone` | 是 | `now()` |
| `updated_at` | `timestamp with time zone` | 是 | `now()` |

### generated_app_repair_attempts

定义：`agentloom-server/src/database/schema/generated-apps.schema.ts`

| 列 | 类型 | 非空 | 默认值 |
| --- | --- | --- | --- |
| `id`（主键） | `uuid` | 是 | `uuid_generate_v7()` |
| `tenant_id` | `uuid` | 是 |  |
| `generated_app_id` | `uuid` | 是 |  |
| `generation_run_id` | `uuid` | 是 |  |
| `attempt_number` | `integer` | 是 | `1` |
| `target_gate_id` | `varchar(64)` | 是 |  |
| `status` | `generated_app_repair_attempt_status` | 是 | `"running"` |
| `failure_summary` | `text` | 是 |  |
| `change_summary` | `text` |  |  |
| `verification_summary` | `text` |  |  |
| `repair_plan` | `jsonb` |  |  |
| `reverification_plan` | `jsonb` |  |  |
| `started_at` | `timestamp with time zone` | 是 | `now()` |
| `completed_at` | `timestamp with time zone` |  |  |
| `created_by` | `uuid` |  |  |
| `created_at` | `timestamp with time zone` | 是 | `now()` |
| `updated_at` | `timestamp with time zone` | 是 | `now()` |

### generated_app_submissions

定义：`agentloom-server/src/database/schema/generated-apps.schema.ts`

| 列 | 类型 | 非空 | 默认值 |
| --- | --- | --- | --- |
| `id`（主键） | `uuid` | 是 | `uuid_generate_v7()` |
| `tenant_id` | `uuid` | 是 |  |
| `generated_app_id` | `uuid` | 是 |  |
| `app_spec_version` | `integer` | 是 |  |
| `public_share_token` | `text` | 是 |  |
| `anonymous_session_id` | `varchar(128)` | 是 |  |
| `status` | `generated_app_submission_status` | 是 | `"received"` |
| `input` | `jsonb` | 是 | `'{}'::jsonb` |
| `result` | `jsonb` |  |  |
| `report` | `jsonb` |  |  |
| `error_message` | `text` |  |  |
| `created_at` | `timestamp with time zone` | 是 | `now()` |
| `updated_at` | `timestamp with time zone` | 是 | `now()` |
| `deleted_at` | `timestamp with time zone` |  |  |

### generated_apps

定义：`agentloom-server/src/database/schema/generated-apps.schema.ts`

| 列 | 类型 | 非空 | 默认值 |
| --- | --- | --- | --- |
| `id`（主键） | `uuid` | 是 | `uuid_generate_v7()` |
| `tenant_id` | `uuid` | 是 |  |
| `prompt` | `text` | 是 |  |
| `app_name` | `varchar(255)` | 是 |  |
| `description` | `text` | 是 |  |
| `status` | `generated_app_status` | 是 | `"app_spec_ready"` |
| `app_spec` | `jsonb` | 是 |  |
| `generation_plan` | `jsonb` |  | `null` |
| `gate_results` | `jsonb` | 是 | `[]` |
| `readiness` | `jsonb` | 是 |  |
| `preview` | `jsonb` | 是 |  |
| `agent_definition_id` | `uuid` |  |  |
| `workflow_definition_id` | `uuid` |  |  |
| `plugin_ids` | `jsonb` | 是 | `[]` |
| `public_share_token` | `text` |  |  |
| `public_share_enabled` | `boolean` | 是 | `false` |
| `public_share_created_at` | `timestamp with time zone` |  |  |
| `public_share_disabled_at` | `timestamp with time zone` |  |  |
| `public_view_count` | `integer` | 是 | `0` |
| `created_by` | `uuid` | 是 |  |
| `updated_by` | `uuid` | 是 |  |
| `created_at` | `timestamp with time zone` | 是 | `now()` |
| `updated_at` | `timestamp with time zone` | 是 | `now()` |

### intervention_policies

定义：`agentloom-server/src/database/schema/intervention-policies.schema.ts`

| 列 | 类型 | 非空 | 默认值 |
| --- | --- | --- | --- |
| `id`（主键） | `uuid` | 是 | `uuid_generate_v7()` |
| `workflow_id` | `uuid` | 是 |  |
| `tenant_id` | `uuid` | 是 |  |
| `node_id` | `varchar(255)` |  |  |
| `allowed_roles` | `text[]` | 是 | `'{"owner","admin"}'::text[]` |
| `timeout_seconds` | `integer` | 是 | `86400` |
| `timeout_action` | `varchar(20)` | 是 | `"reject"` |
| `escalate_to_role` | `varchar(50)` |  |  |
| `notify_channels` | `text[]` | 是 | `'{"in_app"}'::text[]` |
| `is_active` | `boolean` | 是 | `true` |
| `version` | `integer` | 是 | `1` |
| `created_by` | `uuid` | 是 |  |
| `created_at` | `timestamp with time zone` | 是 | `now()` |
| `updated_at` | `timestamp with time zone` | 是 | `now()` |

### documents

定义：`agentloom-server/src/database/schema/knowledge-bases.schema.ts`

| 列 | 类型 | 非空 | 默认值 |
| --- | --- | --- | --- |
| `id`（主键） | `uuid` | 是 | `uuid_generate_v7()` |
| `knowledge_base_id` | `uuid` | 是 |  |
| `tenant_id` | `uuid` | 是 |  |
| `file_name` | `varchar(1024)` | 是 |  |
| `mime_type` | `varchar(255)` | 是 |  |
| `size_bytes` | `integer` | 是 |  |
| `storage_key` | `varchar(2048)` | 是 |  |
| `status` | `document_status` | 是 | `"uploaded"` |
| `error_message` | `text` |  |  |
| `uploaded_by` | `uuid` | 是 |  |
| `created_at` | `timestamp with time zone` | 是 | `now()` |
| `updated_at` | `timestamp with time zone` | 是 | `now()` |

### knowledge_bases

定义：`agentloom-server/src/database/schema/knowledge-bases.schema.ts`

| 列 | 类型 | 非空 | 默认值 |
| --- | --- | --- | --- |
| `id`（主键） | `uuid` | 是 | `uuid_generate_v7()` |
| `tenant_id` | `uuid` | 是 |  |
| `name` | `varchar(255)` | 是 |  |
| `description` | `text` |  |  |
| `visibility` | `knowledge_base_visibility` | 是 | `"private"` |
| `chunking_strategy` | `jsonb` | 是 | `{"type":"sentence_window","windowSize":3}` |
| `retrieval_strategy` | `jsonb` | 是 | `{"topK":8,"similarityThreshold":null}` |
| `reranking_strategy` | `jsonb` | 是 | `{"type":"none"}` |
| `query_orchestration` | `jsonb` | 是 | `{"type":"none"}` |
| `embedding_model` | `varchar(255)` | 是 | `"text-embedding-3-small"` |
| `embedding_model_config_id` | `uuid` |  |  |
| `created_by` | `uuid` | 是 |  |
| `created_at` | `timestamp with time zone` | 是 | `now()` |
| `updated_at` | `timestamp with time zone` | 是 | `now()` |

### knowledge_nodes

定义：`agentloom-server/src/database/schema/knowledge-nodes.schema.ts`

| 列 | 类型 | 非空 | 默认值 |
| --- | --- | --- | --- |
| `id`（主键） | `text` | 是 |  |
| `document_id` | `uuid` | 是 |  |
| `tenant_id` | `uuid` | 是 |  |
| `knowledge_base_id` | `uuid` | 是 |  |
| `node_index` | `integer` | 是 |  |
| `node_type` | `varchar(64)` | 是 |  |
| `content` | `text` | 是 |  |
| `token_count` | `integer` | 是 |  |
| `metadata` | `jsonb` | 是 |  |
| `payload` | `jsonb` | 是 |  |
| `created_at` | `timestamp with time zone` | 是 | `now()` |

### llm_model_configs

定义：`agentloom-server/src/database/schema/llm-model-configs.schema.ts`

| 列 | 类型 | 非空 | 默认值 |
| --- | --- | --- | --- |
| `id`（主键） | `uuid` | 是 | `uuid_generate_v7()` |
| `org_id` | `uuid` | 是 |  |
| `tenant_id` | `uuid` | 是 |  |
| `provider_id` | `uuid` | 是 |  |
| `name` | `varchar(100)` | 是 |  |
| `model_id` | `varchar(100)` | 是 |  |
| `model_type` | `llm_model_type` | 是 | `"chat"` |
| `is_enabled` | `boolean` | 是 | `true` |
| `is_default` | `boolean` | 是 | `false` |
| `capabilities` | `jsonb` |  | `{}` |
| `context_window` | `integer` |  |  |
| `max_output_tokens` | `integer` |  |  |
| `pricing` | `jsonb` |  |  |
| `parameters` | `jsonb` | 是 | `{}` |
| `metadata_source` | `metadata_source` |  |  |
| `embedding_dimensions` | `integer` |  |  |
| `timeout_ms` | `integer` |  |  |
| `created_at` | `timestamp with time zone` | 是 | `now()` |
| `updated_at` | `timestamp with time zone` | 是 | `now()` |

### llm_providers

定义：`agentloom-server/src/database/schema/llm-providers.schema.ts`

| 列 | 类型 | 非空 | 默认值 |
| --- | --- | --- | --- |
| `id`（主键） | `uuid` | 是 | `uuid_generate_v7()` |
| `org_id` | `uuid` | 是 |  |
| `tenant_id` | `uuid` | 是 |  |
| `slug` | `varchar(50)` | 是 |  |
| `name` | `varchar(100)` | 是 |  |
| `icon_url` | `varchar(2048)` |  |  |
| `base_url` | `varchar(2048)` |  |  |
| `default_base_url` | `varchar(2048)` |  |  |
| `is_builtin` | `boolean` | 是 | `false` |
| `is_enabled` | `boolean` | 是 | `true` |
| `api_protocol` | `api_protocol` | 是 | `"openai_chat"` |
| `api_key_id` | `uuid` |  |  |
| `sort_order` | `integer` | 是 | `0` |
| `created_at` | `timestamp with time zone` | 是 | `now()` |
| `updated_at` | `timestamp with time zone` | 是 | `now()` |

### marketplace_listings

定义：`agentloom-server/src/database/schema/marketplace-listings.schema.ts`

| 列 | 类型 | 非空 | 默认值 |
| --- | --- | --- | --- |
| `id`（主键） | `uuid` | 是 | `uuid_generate_v7()` |
| `workflow_version_id` | `uuid` |  |  |
| `plugin_db_id` | `uuid` |  |  |
| `listing_type` | `marketplace_listing_type` | 是 | `"workflow"` |
| `pricing_model` | `marketplace_pricing_model` | 是 | `"free"` |
| `price_per_execution` | `numeric(18, 8)` |  |  |
| `tenant_id` | `uuid` | 是 |  |
| `title` | `varchar(120)` | 是 |  |
| `summary` | `text` | 是 |  |
| `tags` | `text[]` | 是 | `'{}'::text[]` |
| `cover_image_url` | `text` |  |  |
| `category` | `marketplace_category_enum` |  |  |
| `status` | `marketplace_listing_status` | 是 | `"pending_review"` |
| `use_count` | `integer` | 是 | `0` |
| `avg_rating` | `numeric(3, 2)` |  |  |
| `review_count` | `integer` | 是 | `0` |
| `review_result` | `jsonb` |  |  |
| `submitted_by` | `uuid` | 是 |  |
| `submitted_at` | `timestamp with time zone` | 是 | `now()` |
| `published_at` | `timestamp with time zone` |  |  |
| `unlisted_at` | `timestamp with time zone` |  |  |
| `created_at` | `timestamp with time zone` | 是 | `now()` |
| `updated_at` | `timestamp with time zone` | 是 | `now()` |

### marketplace_reviews

定义：`agentloom-server/src/database/schema/marketplace-reviews.schema.ts`

| 列 | 类型 | 非空 | 默认值 |
| --- | --- | --- | --- |
| `id`（主键） | `uuid` | 是 | `uuid_generate_v7()` |
| `listing_id` | `uuid` | 是 |  |
| `user_id` | `uuid` | 是 |  |
| `rating` | `smallint` | 是 |  |
| `content` | `text` |  |  |
| `created_at` | `timestamp with time zone` | 是 | `now()` |
| `updated_at` | `timestamp with time zone` | 是 | `now()` |

### mcp_server_configs

定义：`agentloom-server/src/database/schema/mcp-server-configs.schema.ts`

| 列 | 类型 | 非空 | 默认值 |
| --- | --- | --- | --- |
| `id`（主键） | `uuid` | 是 | `uuid_generate_v7()` |
| `tenant_id` | `uuid` | 是 |  |
| `organization_id` | `uuid` | 是 |  |
| `created_by` | `uuid` | 是 |  |
| `name` | `text` | 是 |  |
| `description` | `text` |  |  |
| `transport_type` | `mcp_transport_type` | 是 |  |
| `command` | `text` |  |  |
| `args` | `jsonb` |  |  |
| `url` | `text` |  |  |
| `connection_fingerprint` | `text` |  |  |
| `encrypted_data` | `bytea` |  |  |
| `encrypted_dek` | `bytea` |  |  |
| `iv` | `bytea` |  |  |
| `auth_tag` | `bytea` |  |  |
| `status` | `mcp_server_status` | 是 | `"active"` |
| `last_tested_at` | `timestamp with time zone` |  |  |
| `created_at` | `timestamp with time zone` | 是 | `now()` |
| `updated_at` | `timestamp with time zone` | 是 | `now()` |

### memory_edges

定义：`agentloom-server/src/database/schema/memory-edges.schema.ts`

| 列 | 类型 | 非空 | 默认值 |
| --- | --- | --- | --- |
| `id`（主键） | `uuid` | 是 | `uuid_generate_v7()` |
| `instance_id` | `uuid` | 是 |  |
| `tenant_id` | `uuid` | 是 |  |
| `parent_node_id` | `uuid` | 是 |  |
| `child_node_id` | `uuid` | 是 |  |
| `name` | `varchar(256)` |  |  |
| `priority` | `integer` | 是 | `0` |
| `disclosure` | `integer` | 是 | `0` |
| `created_at` | `timestamp with time zone` | 是 | `now()` |

### memory_glossary_keywords

定义：`agentloom-server/src/database/schema/memory-glossary-keywords.schema.ts`

| 列 | 类型 | 非空 | 默认值 |
| --- | --- | --- | --- |
| `id`（主键） | `uuid` | 是 | `uuid_generate_v7()` |
| `instance_id` | `uuid` | 是 |  |
| `tenant_id` | `uuid` | 是 |  |
| `keyword` | `varchar(256)` | 是 |  |
| `node_id` | `uuid` | 是 |  |
| `created_at` | `timestamp with time zone` | 是 | `now()` |

### memory_nodes

定义：`agentloom-server/src/database/schema/memory-nodes.schema.ts`

| 列 | 类型 | 非空 | 默认值 |
| --- | --- | --- | --- |
| `id`（主键） | `uuid` | 是 | `uuid_generate_v7()` |
| `instance_id` | `uuid` | 是 |  |
| `tenant_id` | `uuid` | 是 |  |
| `content_type` | `varchar(64)` | 是 | `"text"` |
| `metadata` | `jsonb` |  |  |
| `disclosure_level` | `integer` | 是 | `0` |
| `created_at` | `timestamp with time zone` | 是 | `now()` |

### memory_paths

定义：`agentloom-server/src/database/schema/memory-paths.schema.ts`

| 列 | 类型 | 非空 | 默认值 |
| --- | --- | --- | --- |
| `id`（主键） | `uuid` | 是 | `uuid_generate_v7()` |
| `instance_id` | `uuid` | 是 |  |
| `tenant_id` | `uuid` | 是 |  |
| `domain` | `varchar(64)` | 是 |  |
| `path_string` | `varchar(512)` | 是 |  |
| `edge_id` | `uuid` |  |  |
| `node_id` | `uuid` | 是 |  |
| `created_at` | `timestamp with time zone` | 是 | `now()` |

### memory_sessions

定义：`agentloom-server/src/database/schema/memory-sessions.schema.ts`

| 列 | 类型 | 非空 | 默认值 |
| --- | --- | --- | --- |
| `id`（主键） | `uuid` | 是 | `uuid_generate_v7()` |
| `tenant_id` | `uuid` | 是 |  |
| `memory_instance_id` | `uuid` | 是 |  |
| `execution_id` | `uuid` |  |  |
| `agent_conversation_id` | `uuid` |  |  |
| `role` | `memory_session_role_enum` | 是 | `"primary"` |
| `status` | `memory_session_status_enum` | 是 | `"active"` |
| `config` | `jsonb` |  |  |
| `created_at` | `timestamp with time zone` | 是 | `now()` |
| `updated_at` | `timestamp with time zone` | 是 | `now()` |

### memory_versions

定义：`agentloom-server/src/database/schema/memory-versions.schema.ts`

| 列 | 类型 | 非空 | 默认值 |
| --- | --- | --- | --- |
| `id`（主键） | `uuid` | 是 | `uuid_generate_v7()` |
| `node_id` | `uuid` | 是 |  |
| `tenant_id` | `uuid` | 是 |  |
| `content` | `text` | 是 |  |
| `version` | `integer` | 是 | `1` |
| `deprecated` | `boolean` | 是 | `false` |
| `migrated_to` | `uuid` |  |  |
| `review_status` | `memory_review_status` | 是 | `"pending"` |
| `patch_summary` | `text` |  |  |
| `created_by` | `uuid` |  |  |
| `created_at` | `timestamp with time zone` | 是 | `now()` |

### notification_preferences

定义：`agentloom-server/src/database/schema/notifications.schema.ts`

| 列 | 类型 | 非空 | 默认值 |
| --- | --- | --- | --- |
| `id`（主键） | `uuid` | 是 | `uuid_generate_v7()` |
| `user_id` | `uuid` | 是 |  |
| `tenant_id` | `uuid` | 是 |  |
| `type` | `notification_type_enum` | 是 |  |
| `channel` | `varchar(32)` | 是 |  |
| `enabled` | `boolean` | 是 | `true` |

### notifications

定义：`agentloom-server/src/database/schema/notifications.schema.ts`

| 列 | 类型 | 非空 | 默认值 |
| --- | --- | --- | --- |
| `id`（主键） | `uuid` | 是 | `uuid_generate_v7()` |
| `tenant_id` | `uuid` | 是 |  |
| `user_id` | `uuid` | 是 |  |
| `type` | `notification_type_enum` | 是 |  |
| `title` | `varchar(256)` | 是 |  |
| `body` | `jsonb` |  |  |
| `is_read` | `boolean` | 是 | `false` |
| `created_at` | `timestamp with time zone` | 是 | `now()` |

### optimization_suggestions

定义：`agentloom-server/src/database/schema/optimization-suggestions.schema.ts`

| 列 | 类型 | 非空 | 默认值 |
| --- | --- | --- | --- |
| `id`（主键） | `uuid` | 是 | `uuid_generate_v7()` |
| `tenant_id` | `uuid` | 是 |  |
| `workflow_definition_id` | `uuid` | 是 |  |
| `node_id` | `text` | 是 |  |
| `suggestion_type` | `suggestion_type` | 是 |  |
| `status` | `suggestion_status` | 是 | `"pending"` |
| `confidence` | `real` | 是 |  |
| `current_value` | `jsonb` | 是 |  |
| `suggested_value` | `jsonb` | 是 |  |
| `rationale` | `text` | 是 |  |
| `impact_estimate` | `jsonb` |  |  |
| `analysis_metadata` | `jsonb` |  |  |
| `analysis_period_start` | `timestamp with time zone` | 是 |  |
| `analysis_period_end` | `timestamp with time zone` | 是 |  |
| `applied_at` | `timestamp with time zone` |  |  |
| `applied_by_user_id` | `uuid` |  |  |
| `dismissed_at` | `timestamp with time zone` |  |  |
| `dismissed_by_user_id` | `uuid` |  |  |
| `created_at` | `timestamp with time zone` | 是 | `now()` |
| `updated_at` | `timestamp with time zone` | 是 | `now()` |

### organization_autonomy_policies

定义：`agentloom-server/src/database/schema/org-autonomy-policies.schema.ts`

| 列 | 类型 | 非空 | 默认值 |
| --- | --- | --- | --- |
| `id`（主键） | `uuid` | 是 | `uuid_generate_v7()` |
| `organization_id` | `uuid` | 是 |  |
| `tenant_id` | `uuid` | 是 |  |
| `autonomy_cap` | `varchar(32)` | 是 | `"LLM_SUGGEST"` |
| `version` | `integer` | 是 | `1` |
| `created_by` | `uuid` | 是 |  |
| `updated_by` | `uuid` | 是 |  |
| `created_at` | `timestamp with time zone` | 是 | `now()` |
| `updated_at` | `timestamp with time zone` | 是 | `now()` |

### organization_invitations

定义：`agentloom-server/src/database/schema/organizations.schema.ts`

| 列 | 类型 | 非空 | 默认值 |
| --- | --- | --- | --- |
| `id`（主键） | `uuid` | 是 | `uuid_generate_v7()` |
| `organization_id` | `uuid` | 是 |  |
| `email` | `varchar(255)` | 是 |  |
| `role` | `org_role` | 是 | `"viewer"` |
| `token` | `varchar(255)` | 是 |  |
| `invited_by` | `uuid` | 是 |  |
| `expires_at` | `timestamp with time zone` | 是 |  |
| `status` | `invitation_status` | 是 | `"pending"` |
| `accepted_at` | `timestamp with time zone` |  |  |
| `accepted_by` | `uuid` |  |  |
| `created_at` | `timestamp with time zone` | 是 | `now()` |
| `updated_at` | `timestamp with time zone` | 是 | `now()` |

### organization_members

定义：`agentloom-server/src/database/schema/organizations.schema.ts`

| 列 | 类型 | 非空 | 默认值 |
| --- | --- | --- | --- |
| `id`（主键） | `uuid` | 是 | `uuid_generate_v7()` |
| `organization_id` | `uuid` | 是 |  |
| `user_id` | `uuid` | 是 |  |
| `role` | `org_role` | 是 | `"viewer"` |
| `invited_by` | `uuid` |  |  |
| `joined_at` | `timestamp with time zone` | 是 | `now()` |

### organizations

定义：`agentloom-server/src/database/schema/organizations.schema.ts`

| 列 | 类型 | 非空 | 默认值 |
| --- | --- | --- | --- |
| `id`（主键） | `uuid` | 是 | `uuid_generate_v7()` |
| `name` | `varchar(255)` | 是 |  |
| `slug` | `varchar(100)` | 是 |  |
| `tenant_id` | `uuid` | 是 | `uuid_generate_v7()` |
| `owner_id` | `uuid` | 是 |  |
| `description` | `varchar(500)` |  |  |
| `settings` | `jsonb` |  |  |
| `is_active` | `boolean` | 是 | `true` |
| `created_at` | `timestamp with time zone` | 是 | `now()` |
| `updated_at` | `timestamp with time zone` | 是 | `now()` |

### platform_api_tokens

定义：`agentloom-server/src/database/schema/platform-api-tokens.schema.ts`

| 列 | 类型 | 非空 | 默认值 |
| --- | --- | --- | --- |
| `id`（主键） | `uuid` | 是 | `uuid_generate_v7()` |
| `user_id` | `uuid` | 是 |  |
| `tenant_id` | `uuid` | 是 |  |
| `name` | `varchar(255)` | 是 |  |
| `token_hash` | `varchar(128)` | 是 |  |
| `token_prefix` | `varchar(16)` | 是 |  |
| `scopes` | `varchar(1024)` |  |  |
| `last_used_at` | `timestamp with time zone` |  |  |
| `expires_at` | `timestamp with time zone` |  |  |
| `is_revoked` | `boolean` | 是 | `false` |
| `created_at` | `timestamp with time zone` | 是 | `now()` |
| `updated_at` | `timestamp with time zone` | 是 | `now()` |

### plugin_developer_keys

定义：`agentloom-server/src/database/schema/plugin-developer-keys.schema.ts`

| 列 | 类型 | 非空 | 默认值 |
| --- | --- | --- | --- |
| `id`（主键） | `uuid` | 是 | `uuid_generate_v7()` |
| `tenant_id` | `uuid` | 是 |  |
| `org_id` | `uuid` | 是 |  |
| `user_id` | `uuid` | 是 |  |
| `public_key` | `text` | 是 |  |
| `key_fingerprint` | `varchar(64)` | 是 |  |
| `label` | `varchar(255)` |  |  |
| `status` | `plugin_developer_key_status` | 是 | `"active"` |
| `revoked_at` | `timestamp with time zone` |  |  |
| `created_at` | `timestamp with time zone` | 是 | `now()` |
| `updated_at` | `timestamp with time zone` | 是 | `now()` |

### plugin_earnings

定义：`agentloom-server/src/database/schema/plugin-earnings.schema.ts`

| 列 | 类型 | 非空 | 默认值 |
| --- | --- | --- | --- |
| `id`（主键） | `uuid` | 是 | `uuid_generate_v7()` |
| `tenant_id` | `uuid` | 是 |  |
| `plugin_db_id` | `uuid` | 是 |  |
| `plugin_id` | `varchar(255)` | 是 |  |
| `org_id` | `uuid` | 是 |  |
| `source_tenant_id` | `uuid` |  |  |
| `source_org_id` | `uuid` |  |  |
| `source_plugin_db_id` | `uuid` |  |  |
| `source_plugin_id` | `varchar(255)` |  |  |
| `source_listing_id` | `uuid` |  |  |
| `period_start` | `timestamp with time zone` | 是 |  |
| `period_end` | `timestamp with time zone` | 是 |  |
| `total_executions` | `integer` | 是 | `0` |
| `total_revenue` | `numeric(18, 8)` | 是 | `"0"` |
| `developer_share` | `numeric(18, 8)` | 是 | `"0"` |
| `platform_share` | `numeric(18, 8)` | 是 | `"0"` |
| `listing_commission` | `numeric(18, 8)` | 是 | `"0"` |
| `currency` | `varchar(10)` | 是 | `"USD"` |
| `payout_status` | `payout_status` | 是 | `"pending"` |
| `payout_reference` | `varchar(255)` |  |  |
| `payout_at` | `timestamp with time zone` |  |  |
| `metadata` | `jsonb` |  |  |
| `created_at` | `timestamp with time zone` | 是 | `now()` |
| `updated_at` | `timestamp with time zone` | 是 | `now()` |

### plugin_usage_records

定义：`agentloom-server/src/database/schema/plugin-usage-records.schema.ts`

| 列 | 类型 | 非空 | 默认值 |
| --- | --- | --- | --- |
| `id`（主键） | `uuid` | 是 | `uuid_generate_v7()` |
| `tenant_id` | `uuid` | 是 |  |
| `plugin_db_id` | `uuid` | 是 |  |
| `plugin_id` | `varchar(255)` | 是 |  |
| `source_tenant_id` | `uuid` |  |  |
| `source_org_id` | `uuid` |  |  |
| `source_plugin_db_id` | `uuid` |  |  |
| `source_plugin_id` | `varchar(255)` |  |  |
| `source_listing_id` | `uuid` |  |  |
| `execution_id` | `uuid` | 是 |  |
| `step_id` | `uuid` |  |  |
| `executed_by` | `uuid` |  |  |
| `billing_amount` | `numeric(18, 8)` |  |  |
| `currency` | `varchar(10)` |  | `"USD"` |
| `execution_duration_ms` | `numeric(12, 0)` |  |  |
| `input_tokens` | `numeric(12, 0)` |  |  |
| `output_tokens` | `numeric(12, 0)` |  |  |
| `metadata` | `jsonb` |  |  |
| `created_at` | `timestamp with time zone` | 是 | `now()` |

### plugins

定义：`agentloom-server/src/database/schema/plugins.schema.ts`

| 列 | 类型 | 非空 | 默认值 |
| --- | --- | --- | --- |
| `id`（主键） | `uuid` | 是 | `uuid_generate_v7()` |
| `tenant_id` | `uuid` | 是 |  |
| `org_id` | `uuid` | 是 |  |
| `plugin_id` | `varchar(255)` | 是 |  |
| `name` | `varchar(255)` | 是 |  |
| `version` | `varchar(50)` | 是 |  |
| `author` | `varchar(255)` | 是 |  |
| `description` | `text` |  |  |
| `license` | `varchar(100)` |  |  |
| `status` | `plugin_status` | 是 | `"registered"` |
| `manifest` | `jsonb` | 是 |  |
| `node_definitions` | `jsonb` | 是 | `'[]'::jsonb` |
| `storage_key` | `varchar(500)` |  |  |
| `signature` | `text` |  |  |
| `content_hash` | `varchar(64)` |  |  |
| `wasm_bundle_url` | `varchar(512)` |  |  |
| `permissions` | `text[]` | 是 | `'{}'::text[]` |
| `installed_by` | `uuid` |  |  |
| `metadata` | `jsonb` |  |  |
| `occ_version` | `integer` | 是 | `1` |
| `created_at` | `timestamp with time zone` | 是 | `now()` |
| `updated_at` | `timestamp with time zone` | 是 | `now()` |

### private_deployment_settings

定义：`agentloom-server/src/database/schema/private-deployment-settings.schema.ts`

| 列 | 类型 | 非空 | 默认值 |
| --- | --- | --- | --- |
| `id`（主键） | `uuid` | 是 | `uuid_generate_v7()` |
| `organization_id` | `uuid` | 是 |  |
| `tenant_id` | `uuid` | 是 |  |
| `smtp_host` | `varchar(255)` |  |  |
| `smtp_port` | `integer` |  |  |
| `smtp_username` | `varchar(255)` |  |  |
| `smtp_from_email` | `varchar(320)` |  |  |
| `smtp_use_tls` | `boolean` | 是 | `false` |
| `smtp_password_encrypted_key` | `bytea` |  |  |
| `smtp_password_encrypted_dek` | `bytea` |  |  |
| `smtp_password_iv` | `bytea` |  |  |
| `smtp_password_auth_tag` | `bytea` |  |  |
| `private_cloud_endpoint_url` | `varchar(512)` |  |  |
| `private_cloud_auth_method` | `private_cloud_auth_method` | 是 | `"none"` |
| `private_cloud_allow_external_egress` | `boolean` | 是 | `false` |
| `private_cloud_api_key_encrypted_key` | `bytea` |  |  |
| `private_cloud_api_key_encrypted_dek` | `bytea` |  |  |
| `private_cloud_api_key_iv` | `bytea` |  |  |
| `private_cloud_api_key_auth_tag` | `bytea` |  |  |
| `certificate_source` | `private_deployment_certificate_source` | 是 | `"none"` |
| `certificate_tls_secret_ref` | `varchar(255)` |  |  |
| `certificate_expires_at` | `timestamp with time zone` |  |  |
| `certificate_pem_encrypted_key` | `bytea` |  |  |
| `certificate_pem_encrypted_dek` | `bytea` |  |  |
| `certificate_pem_iv` | `bytea` |  |  |
| `certificate_pem_auth_tag` | `bytea` |  |  |
| `certificate_private_key_encrypted_key` | `bytea` |  |  |
| `certificate_private_key_encrypted_dek` | `bytea` |  |  |
| `certificate_private_key_iv` | `bytea` |  |  |
| `certificate_private_key_auth_tag` | `bytea` |  |  |
| `license_key_encrypted_key` | `bytea` |  |  |
| `license_key_encrypted_dek` | `bytea` |  |  |
| `license_key_iv` | `bytea` |  |  |
| `license_key_auth_tag` | `bytea` |  |  |
| `version` | `integer` | 是 | `1` |
| `created_by` | `uuid` | 是 |  |
| `updated_by` | `uuid` | 是 |  |
| `created_at` | `timestamp with time zone` | 是 | `now()` |
| `updated_at` | `timestamp with time zone` | 是 | `now()` |

### provider_health_status

定义：`agentloom-server/src/database/schema/provider-health-status.schema.ts`

| 列 | 类型 | 非空 | 默认值 |
| --- | --- | --- | --- |
| `id`（主键） | `uuid` | 是 | `uuid_generate_v7()` |
| `tenant_id` | `uuid` | 是 |  |
| `provider_name` | `varchar(50)` | 是 |  |
| `model_id` | `uuid` |  |  |
| `status` | `varchar(20)` | 是 | `"healthy"` |
| `failure_count` | `integer` | 是 | `0` |
| `last_failure_at` | `timestamp with time zone` |  |  |
| `last_success_at` | `timestamp with time zone` |  |  |
| `circuit_opened_at` | `timestamp with time zone` |  |  |
| `window_start_at` | `timestamp with time zone` | 是 | `now()` |
| `updated_at` | `timestamp with time zone` | 是 | `now()` |

### resource_source_records

定义：`agentloom-server/src/database/schema/resource-source-records.schema.ts`

| 列 | 类型 | 非空 | 默认值 |
| --- | --- | --- | --- |
| `id`（主键） | `uuid` | 是 | `uuid_generate_v7()` |
| `tenant_id` | `uuid` | 是 |  |
| `resource_type` | `resource_source_resource_type` | 是 |  |
| `resource_id` | `uuid` | 是 |  |
| `origin_kind` | `resource_source_kind` | 是 |  |
| `current_kind` | `resource_source_kind` | 是 |  |
| `source_share_type` | `resource_source_share_type` |  |  |
| `source_share_id` | `uuid` |  |  |
| `source_share_token` | `text` |  |  |
| `source_resource_type` | `resource_source_resource_type` |  |  |
| `source_resource_id` | `uuid` |  |  |
| `source_resource_title` | `text` |  |  |
| `created_by` | `uuid` | 是 |  |
| `created_at` | `timestamp with time zone` | 是 | `now()` |
| `updated_at` | `timestamp with time zone` | 是 | `now()` |

### reusable_blocks

定义：`agentloom-server/src/database/schema/reusable-blocks.schema.ts`

| 列 | 类型 | 非空 | 默认值 |
| --- | --- | --- | --- |
| `id`（主键） | `uuid` | 是 | `uuid_generate_v7()` |
| `org_id` | `uuid` | 是 |  |
| `tenant_id` | `uuid` | 是 |  |
| `name` | `varchar(255)` | 是 |  |
| `description` | `text` |  |  |
| `category` | `varchar(64)` |  |  |
| `tags` | `text[]` | 是 | `'{}'::text[]` |
| `definition` | `jsonb` | 是 |  |
| `metadata` | `jsonb` |  |  |
| `version` | `integer` | 是 | `1` |
| `is_published` | `boolean` | 是 | `false` |
| `created_by` | `uuid` | 是 |  |
| `created_at` | `timestamp with time zone` | 是 | `now()` |
| `updated_at` | `timestamp with time zone` | 是 | `now()` |

### revoked_tokens

定义：`agentloom-server/src/database/schema/revoked-tokens.schema.ts`

| 列 | 类型 | 非空 | 默认值 |
| --- | --- | --- | --- |
| `token_hash`（主键） | `varchar(64)` | 是 |  |
| `user_id` | `varchar(36)` |  |  |
| `expires_at` | `timestamp with time zone` | 是 |  |
| `revoked_at` | `timestamp with time zone` | 是 | `now()` |

### router_models

定义：`agentloom-server/src/database/schema/router-models.schema.ts`

| 列 | 类型 | 非空 | 默认值 |
| --- | --- | --- | --- |
| `id`（主键） | `uuid` | 是 | `uuid_generate_v7()` |
| `tenant_id` | `uuid` | 是 |  |
| `model_id` | `uuid` | 是 |  |
| `provider_name` | `varchar(50)` | 是 |  |
| `routing_meta` | `jsonb` | 是 |  |
| `elo_rating` | `numeric(10, 4)` | 是 | `"1500"` |
| `total_matches` | `integer` | 是 | `0` |
| `is_active` | `boolean` | 是 | `true` |
| `occ_version` | `integer` | 是 | `0` |
| `updated_at` | `timestamp with time zone` | 是 | `now()` |
| `created_at` | `timestamp with time zone` | 是 | `now()` |

### routing_benchmarks

定义：`agentloom-server/src/database/schema/routing-benchmarks.schema.ts`

| 列 | 类型 | 非空 | 默认值 |
| --- | --- | --- | --- |
| `id`（主键） | `uuid` | 是 | `uuid_generate_v7()` |
| `task_category` | `varchar(30)` | 是 |  |
| `query_text` | `text` | 是 |  |
| `query_embedding_id` | `varchar(255)` |  |  |
| `model_id` | `uuid` | 是 |  |
| `performance_score` | `numeric(10, 4)` | 是 |  |
| `token_count` | `integer` | 是 |  |
| `latency_ms` | `integer` | 是 |  |
| `mlp_weights` | `jsonb` |  |  |
| `created_at` | `timestamp with time zone` | 是 | `now()` |

### routing_decisions

定义：`agentloom-server/src/database/schema/routing-decisions.schema.ts`

| 列 | 类型 | 非空 | 默认值 |
| --- | --- | --- | --- |
| `id`（主键） | `uuid` | 是 | `uuid_generate_v7()` |
| `execution_step_id` | `uuid` | 是 |  |
| `tenant_id` | `uuid` | 是 |  |
| `routing_node_id` | `text` | 是 |  |
| `strategy` | `varchar(30)` | 是 |  |
| `router_type` | `varchar(30)` |  |  |
| `models_evaluated` | `jsonb` | 是 |  |
| `selected_model_id` | `uuid` |  |  |
| `decision_reasoning` | `text` | 是 |  |
| `routing_latency_ms` | `integer` | 是 |  |
| `created_at` | `timestamp with time zone` | 是 | `now()` |

### runtime_plugins

定义：`agentloom-server/src/database/schema/runtime-plugins.schema.ts`

| 列 | 类型 | 非空 | 默认值 |
| --- | --- | --- | --- |
| `id`（主键） | `uuid` | 是 | `uuid_generate_v7()` |
| `tenant_id` | `uuid` | 是 |  |
| `org_id` | `uuid` | 是 |  |
| `plugin_id` | `varchar(255)` | 是 |  |
| `name` | `varchar(255)` | 是 |  |
| `version` | `varchar(50)` | 是 |  |
| `author` | `varchar(255)` | 是 |  |
| `description` | `text` |  |  |
| `license` | `varchar(100)` |  |  |
| `status` | `runtime_plugin_status` | 是 | `"registered"` |
| `manifest` | `jsonb` | 是 |  |
| `bundle_patch` | `text` | 是 |  |
| `config_schema` | `jsonb` |  |  |
| `storage_key` | `varchar(500)` | 是 |  |
| `content_hash` | `varchar(64)` | 是 |  |
| `signature` | `text` | 是 |  |
| `size_bytes` | `integer` | 是 |  |
| `installed_by` | `uuid` |  |  |
| `occ_version` | `integer` | 是 | `1` |
| `created_at` | `timestamp with time zone` | 是 | `now()` |
| `updated_at` | `timestamp with time zone` | 是 | `now()` |

### sandbox_logs

定义：`agentloom-server/src/database/schema/sandbox-logs.schema.ts`

| 列 | 类型 | 非空 | 默认值 |
| --- | --- | --- | --- |
| `id`（主键） | `uuid` | 是 | `uuid_generate_v7()` |
| `session_id` | `uuid` | 是 |  |
| `level` | `varchar(16)` | 是 |  |
| `message` | `text` | 是 |  |
| `created_at` | `timestamp with time zone` | 是 | `now()` |

### sandbox_runtime_migrations

定义：`agentloom-server/src/database/schema/sandbox-runtime-migrations.schema.ts`

| 列 | 类型 | 非空 | 默认值 |
| --- | --- | --- | --- |
| `sandbox_session_id`（主键） | `uuid` | 是 |  |
| `tenant_id` | `uuid` | 是 |  |
| `legacy_container_id` | `varchar(128)` | 是 |  |
| `source_workspace_identity` | `varchar(512)` | 是 |  |
| `archive_object_key` | `varchar(1024)` |  |  |
| `manifest_object_key` | `varchar(1024)` |  |  |
| `archive_sha256` | `varchar(64)` |  |  |
| `manifest_sha256` | `varchar(64)` |  |  |
| `file_count` | `bigint` |  |  |
| `total_bytes` | `bigint` |  |  |
| `status` | `sandbox_runtime_migration_status_enum` | 是 | `"pending"` |
| `error` | `text` |  |  |
| `archived_at` | `timestamp with time zone` |  |  |
| `restored_at` | `timestamp with time zone` |  |  |
| `verified_at` | `timestamp with time zone` |  |  |
| `finalized_at` | `timestamp with time zone` |  |  |
| `rolled_back_at` | `timestamp with time zone` |  |  |
| `created_at` | `timestamp with time zone` | 是 | `now()` |
| `updated_at` | `timestamp with time zone` | 是 | `now()` |

### sandbox_runtime_nodes

定义：`agentloom-server/src/database/schema/sandbox-runtime-nodes.schema.ts`

| 列 | 类型 | 非空 | 默认值 |
| --- | --- | --- | --- |
| `id`（主键） | `varchar(32)` | 是 |  |
| `base_url` | `varchar(256)` | 是 |  |
| `server_name` | `varchar(128)` |  |  |
| `status` | `sandbox_runtime_node_status_enum` | 是 | `"active"` |
| `created_at` | `timestamp with time zone` | 是 | `now()` |
| `updated_at` | `timestamp with time zone` | 是 | `now()` |

### sandbox_sessions

定义：`agentloom-server/src/database/schema/sandbox-sessions.schema.ts`

| 列 | 类型 | 非空 | 默认值 |
| --- | --- | --- | --- |
| `id`（主键） | `uuid` | 是 | `uuid_generate_v7()` |
| `execution_id` | `uuid` |  |  |
| `agent_conversation_id` | `uuid` |  |  |
| `sandbox_node_id` | `varchar(64)` |  |  |
| `tenant_id` | `uuid` | 是 |  |
| `runtime_handle` | `varchar(128)` |  |  |
| `status` | `sandbox_session_status_enum` | 是 | `"creating"` |
| `config` | `jsonb` | 是 |  |
| `workspace_path` | `varchar(256)` |  |  |
| `started_at` | `timestamp with time zone` |  |  |
| `stopped_at` | `timestamp with time zone` |  |  |
| `created_at` | `timestamp with time zone` | 是 | `now()` |

### skills

定义：`agentloom-server/src/database/schema/skills.schema.ts`

| 列 | 类型 | 非空 | 默认值 |
| --- | --- | --- | --- |
| `id`（主键） | `uuid` | 是 | `uuid_generate_v7()` |
| `tenant_id` | `uuid` | 是 |  |
| `name` | `varchar(128)` | 是 |  |
| `slug` | `varchar(128)` | 是 |  |
| `description` | `text` | 是 |  |
| `content` | `text` |  |  |
| `frontmatter` | `jsonb` |  |  |
| `is_builtin` | `boolean` | 是 | `false` |
| `status` | `varchar(20)` | 是 | `"active"` |
| `file_count` | `integer` | 是 | `1` |
| `total_size_bytes` | `bigint` | 是 | `0` |
| `version` | `integer` | 是 | `1` |
| `created_by` | `uuid` | 是 |  |
| `updated_by` | `uuid` | 是 |  |
| `created_at` | `timestamp with time zone` | 是 | `now()` |
| `updated_at` | `timestamp with time zone` | 是 | `now()` |

### tenant_encryption_keys

定义：`agentloom-server/src/database/schema/tenant-encryption-keys.schema.ts`

| 列 | 类型 | 非空 | 默认值 |
| --- | --- | --- | --- |
| `id`（主键） | `uuid` | 是 | `uuid_generate_v7()` |
| `organization_id` | `uuid` | 是 |  |
| `tenant_id` | `uuid` | 是 |  |
| `public_key` | `text` | 是 |  |
| `key_fingerprint` | `varchar(64)` | 是 |  |
| `status` | `encryption_key_status` | 是 | `"active"` |
| `activated_at` | `timestamp with time zone` | 是 | `now()` |
| `rotated_at` | `timestamp with time zone` |  |  |
| `revoked_at` | `timestamp with time zone` |  |  |
| `created_at` | `timestamp with time zone` | 是 | `now()` |
| `updated_at` | `timestamp with time zone` | 是 | `now()` |

### tenant_quotas

定义：`agentloom-server/src/database/schema/tenant-quotas.schema.ts`

| 列 | 类型 | 非空 | 默认值 |
| --- | --- | --- | --- |
| `id`（主键） | `uuid` | 是 | `uuid_generate_v7()` |
| `organization_id` | `uuid` | 是 |  |
| `tenant_id` | `uuid` | 是 |  |
| `api_rate_limit_per_minute` | `integer` | 是 | `100` |
| `max_concurrent_executions` | `integer` |  |  |
| `daily_execution_limit` | `integer` |  |  |
| `daily_api_call_limit` | `integer` |  |  |
| `storage_quota_mb` | `integer` |  |  |
| `max_sandbox_cpu_percent` | `integer` |  |  |
| `max_sandbox_memory_mb` | `integer` |  |  |
| `version` | `integer` | 是 | `1` |
| `created_by` | `uuid` | 是 |  |
| `updated_by` | `uuid` | 是 |  |
| `created_at` | `timestamp with time zone` | 是 | `now()` |
| `updated_at` | `timestamp with time zone` | 是 | `now()` |

### tool_definitions

定义：`agentloom-server/src/database/schema/tool-definitions.schema.ts`

| 列 | 类型 | 非空 | 默认值 |
| --- | --- | --- | --- |
| `id`（主键） | `uuid` | 是 | `uuid_generate_v7()` |
| `tenant_id` | `uuid` | 是 |  |
| `organization_id` | `uuid` | 是 |  |
| `mcp_server_config_id` | `uuid` |  |  |
| `source` | `tool_source` | 是 | `"mcp"` |
| `name` | `text` | 是 |  |
| `title` | `text` |  |  |
| `description` | `text` |  |  |
| `input_schema` | `jsonb` |  |  |
| `output_schema` | `jsonb` |  |  |
| `port_mapping_metadata` | `jsonb` |  |  |
| `annotations` | `jsonb` |  |  |
| `is_active` | `boolean` | 是 | `true` |
| `imported_at` | `timestamp with time zone` |  |  |
| `created_at` | `timestamp with time zone` | 是 | `now()` |
| `updated_at` | `timestamp with time zone` | 是 | `now()` |

### user_preferences

定义：`agentloom-server/src/database/schema/user-preferences.schema.ts`

| 列 | 类型 | 非空 | 默认值 |
| --- | --- | --- | --- |
| `id`（主键） | `uuid` | 是 | `uuid_generate_v7()` |
| `user_id` | `uuid` | 是 |  |
| `tenant_id` | `uuid` | 是 |  |
| `title_model_config_id` | `uuid` |  |  |
| `preferences` | `jsonb` | 是 | `{}` |
| `created_at` | `timestamp with time zone` | 是 | `now()` |
| `updated_at` | `timestamp with time zone` | 是 | `now()` |

### users

定义：`agentloom-server/src/database/schema/users.schema.ts`

| 列 | 类型 | 非空 | 默认值 |
| --- | --- | --- | --- |
| `id`（主键） | `uuid` | 是 | `uuid_generate_v7()` |
| `supabase_user_id` | `uuid` | 是 |  |
| `email` | `varchar(255)` | 是 |  |
| `display_name` | `varchar(100)` |  |  |
| `avatar_url` | `varchar(500)` |  |  |
| `is_active` | `boolean` | 是 | `true` |
| `current_organization_id` | `uuid` |  |  |
| `created_at` | `timestamp with time zone` | 是 | `now()` |
| `updated_at` | `timestamp with time zone` | 是 | `now()` |

### workflow_definitions

定义：`agentloom-server/src/database/schema/workflow-definitions.schema.ts`

| 列 | 类型 | 非空 | 默认值 |
| --- | --- | --- | --- |
| `id`（主键） | `uuid` | 是 | `uuid_generate_v7()` |
| `tenant_id` | `uuid` | 是 |  |
| `name` | `varchar(255)` | 是 |  |
| `slug` | `varchar(255)` | 是 |  |
| `description` | `text` |  |  |
| `icon` | `varchar(255)` |  |  |
| `nodes` | `jsonb` | 是 | `[]` |
| `edges` | `jsonb` | 是 | `[]` |
| `viewport` | `jsonb` |  |  |
| `metadata` | `jsonb` | 是 | `{}` |
| `input_schema` | `jsonb` |  | `null` |
| `version` | `integer` | 是 | `1` |
| `status` | `workflow_status_enum` | 是 | `"draft"` |
| `published_version_id` | `uuid` |  |  |
| `created_by` | `uuid` | 是 |  |
| `updated_by` | `uuid` | 是 |  |
| `created_at` | `timestamp with time zone` | 是 | `now()` |
| `updated_at` | `timestamp with time zone` | 是 | `now()` |

### workflow_executions

定义：`agentloom-server/src/database/schema/workflow-executions.schema.ts`

| 列 | 类型 | 非空 | 默认值 |
| --- | --- | --- | --- |
| `id`（主键） | `uuid` | 是 | `uuid_generate_v7()` |
| `workflow_definition_id` | `uuid` | 是 |  |
| `workflow_version_id` | `uuid` | 是 |  |
| `tenant_id` | `uuid` | 是 |  |
| `status` | `execution_status_enum` | 是 | `"pending"` |
| `trigger_type` | `execution_trigger_type_enum` | 是 | `"manual"` |
| `input_params` | `jsonb` | 是 | `'{}'::jsonb` |
| `definition_snapshot` | `jsonb` | 是 |  |
| `started_at` | `timestamp with time zone` |  |  |
| `completed_at` | `timestamp with time zone` |  |  |
| `failed_at` | `timestamp with time zone` |  |  |
| `cancelled_at` | `timestamp with time zone` |  |  |
| `error_message` | `jsonb` |  |  |
| `total_steps` | `integer` | 是 | `0` |
| `completed_steps` | `integer` | 是 | `0` |
| `created_by` | `uuid` | 是 |  |
| `created_at` | `timestamp with time zone` | 是 | `now()` |
| `updated_at` | `timestamp with time zone` | 是 | `now()` |

### workflow_shares

定义：`agentloom-server/src/database/schema/workflow-shares.schema.ts`

| 列 | 类型 | 非空 | 默认值 |
| --- | --- | --- | --- |
| `id`（主键） | `uuid` | 是 | `uuid_generate_v7()` |
| `workflow_definition_id` | `uuid` | 是 |  |
| `tenant_id` | `uuid` | 是 |  |
| `share_token` | `text` | 是 |  |
| `share_type` | `share_type` | 是 | `"read_only"` |
| `created_by` | `uuid` | 是 |  |
| `expires_at` | `timestamp with time zone` |  |  |
| `is_revoked` | `boolean` | 是 | `false` |
| `view_count` | `integer` | 是 | `0` |
| `copy_count` | `integer` | 是 | `0` |
| `created_at` | `timestamp with time zone` | 是 | `now()` |
| `updated_at` | `timestamp with time zone` | 是 | `now()` |

### workflow_templates

定义：`agentloom-server/src/database/schema/workflow-templates.schema.ts`

| 列 | 类型 | 非空 | 默认值 |
| --- | --- | --- | --- |
| `id`（主键） | `uuid` | 是 | `uuid_generate_v7()` |
| `slug` | `varchar(128)` | 是 |  |
| `name` | `varchar(255)` | 是 |  |
| `description` | `text` |  |  |
| `category` | `varchar(64)` | 是 |  |
| `tags` | `text[]` | 是 | `'{}'::text[]` |
| `thumbnail_url` | `varchar(512)` |  |  |
| `definition` | `jsonb` | 是 |  |
| `metadata` | `jsonb` | 是 | `{}` |
| `is_published` | `boolean` | 是 | `true` |
| `display_order` | `integer` | 是 | `0` |
| `created_at` | `timestamp with time zone` | 是 | `now()` |
| `updated_at` | `timestamp with time zone` | 是 | `now()` |

### workflow_trigger_history

定义：`agentloom-server/src/database/schema/workflow-triggers.schema.ts`

| 列 | 类型 | 非空 | 默认值 |
| --- | --- | --- | --- |
| `id`（主键） | `uuid` | 是 | `uuid_generate_v7()` |
| `trigger_id` | `uuid` | 是 |  |
| `tenant_id` | `uuid` | 是 |  |
| `status` | `trigger_history_status_enum` | 是 |  |
| `execution_id` | `uuid` |  |  |
| `error_message` | `text` |  |  |
| `payload` | `jsonb` |  |  |
| `triggered_at` | `timestamp with time zone` | 是 | `now()` |

### workflow_triggers

定义：`agentloom-server/src/database/schema/workflow-triggers.schema.ts`

| 列 | 类型 | 非空 | 默认值 |
| --- | --- | --- | --- |
| `id`（主键） | `uuid` | 是 | `uuid_generate_v7()` |
| `workflow_definition_id` | `uuid` | 是 |  |
| `tenant_id` | `uuid` | 是 |  |
| `name` | `varchar(255)` | 是 |  |
| `description` | `text` |  |  |
| `type` | `trigger_type_enum` | 是 |  |
| `config` | `jsonb` | 是 |  |
| `is_enabled` | `boolean` | 是 | `true` |
| `last_triggered_at` | `timestamp with time zone` |  |  |
| `next_fire_at` | `timestamp with time zone` |  |  |
| `trigger_count` | `integer` | 是 | `0` |
| `created_by` | `uuid` | 是 |  |
| `created_at` | `timestamp with time zone` | 是 | `now()` |
| `updated_at` | `timestamp with time zone` | 是 | `now()` |

### workflow_versions

定义：`agentloom-server/src/database/schema/workflow-versions.schema.ts`

| 列 | 类型 | 非空 | 默认值 |
| --- | --- | --- | --- |
| `id`（主键） | `uuid` | 是 | `uuid_generate_v7()` |
| `workflow_definition_id` | `uuid` | 是 |  |
| `tenant_id` | `uuid` | 是 |  |
| `version_number` | `integer` | 是 |  |
| `label` | `varchar(255)` |  |  |
| `snapshot` | `jsonb` | 是 |  |
| `published_at` | `timestamp with time zone` |  |  |
| `archived_at` | `timestamp with time zone` |  |  |
| `created_by` | `uuid` | 是 |  |
| `created_at` | `timestamp with time zone` | 是 | `now()` |

### workspace_runtime_leases

定义：`agentloom-server/src/database/schema/workspace-runtime-leases.schema.ts`

| 列 | 类型 | 非空 | 默认值 |
| --- | --- | --- | --- |
| `id`（主键） | `uuid` | 是 | `uuid_generate_v7()` |
| `tenant_id` | `uuid` | 是 |  |
| `workspace_id` | `uuid` | 是 |  |
| `sandbox_session_id` | `uuid` | 是 |  |
| `fencing_token` | `bigint` | 是 |  |
| `lease_expires_at` | `timestamp with time zone` | 是 |  |
| `created_at` | `timestamp with time zone` | 是 | `now()` |
| `updated_at` | `timestamp with time zone` | 是 | `now()` |

### workspace_snapshots

定义：`agentloom-server/src/database/schema/workspace-snapshots.schema.ts`

| 列 | 类型 | 非空 | 默认值 |
| --- | --- | --- | --- |
| `id`（主键） | `uuid` | 是 | `uuid_generate_v7()` |
| `organization_id` | `uuid` | 是 |  |
| `tenant_id` | `uuid` | 是 |  |
| `name` | `varchar(255)` | 是 |  |
| `description` | `text` |  |  |
| `storage_key` | `varchar(512)` | 是 |  |
| `size_bytes` | `bigint` |  |  |
| `status` | `workspace_snapshot_status_enum` | 是 | `"creating"` |
| `config` | `jsonb` |  | `null` |
| `created_by_id` | `uuid` | 是 |  |
| `created_at` | `timestamp with time zone` | 是 | `now()` |
| `updated_at` | `timestamp with time zone` | 是 | `now()` |
