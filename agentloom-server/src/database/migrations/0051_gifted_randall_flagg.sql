CREATE TYPE "public"."memory_instance_status" AS ENUM('active', 'archived', 'deleted');--> statement-breakpoint
CREATE TYPE "public"."memory_review_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."memory_session_role_enum" AS ENUM('primary', 'readonly');--> statement-breakpoint
CREATE TYPE "public"."memory_session_status_enum" AS ENUM('active', 'disconnected', 'expired');--> statement-breakpoint
CREATE TABLE "agent_memory_instances" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"config" jsonb,
	"system_prompt_override" text,
	"valid_domains" text[] DEFAULT ARRAY['core', 'notes']::text[] NOT NULL,
	"core_memory_uris" text[] DEFAULT ARRAY['core://agent']::text[] NOT NULL,
	"status" "memory_instance_status" DEFAULT 'active' NOT NULL,
	"occ_version" integer DEFAULT 1 NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_memory_instances" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "memory_edges" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"instance_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"parent_node_id" uuid NOT NULL,
	"child_node_id" uuid NOT NULL,
	"name" varchar(256),
	"priority" integer DEFAULT 0 NOT NULL,
	"disclosure" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "memory_edges" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "memory_glossary_keywords" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"instance_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"keyword" varchar(256) NOT NULL,
	"node_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "memory_glossary_keywords" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "memory_nodes" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"instance_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"content_type" varchar(64) DEFAULT 'text' NOT NULL,
	"metadata" jsonb,
	"disclosure_level" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "memory_nodes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "memory_paths" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"instance_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"domain" varchar(64) NOT NULL,
	"path_string" varchar(512) NOT NULL,
	"edge_id" uuid,
	"node_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "memory_paths" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "memory_sessions" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"memory_instance_id" uuid NOT NULL,
	"execution_id" uuid,
	"agent_conversation_id" uuid,
	"role" "memory_session_role_enum" DEFAULT 'primary' NOT NULL,
	"status" "memory_session_status_enum" DEFAULT 'active' NOT NULL,
	"config" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_memory_sessions_fk" CHECK (execution_id IS NOT NULL OR agent_conversation_id IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "memory_sessions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "memory_versions" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"node_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"content" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"deprecated" boolean DEFAULT false NOT NULL,
	"migrated_to" uuid,
	"review_status" "memory_review_status" DEFAULT 'pending' NOT NULL,
	"patch_summary" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "memory_versions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "provider_health_status" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"provider_name" varchar(50) NOT NULL,
	"model_id" uuid,
	"status" varchar(20) DEFAULT 'healthy' NOT NULL,
	"failure_count" integer DEFAULT 0 NOT NULL,
	"last_failure_at" timestamp with time zone,
	"last_success_at" timestamp with time zone,
	"circuit_opened_at" timestamp with time zone,
	"window_start_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "provider_health_status" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "router_models" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"model_id" uuid NOT NULL,
	"provider_name" varchar(50) NOT NULL,
	"routing_meta" jsonb NOT NULL,
	"elo_rating" numeric(10, 4) DEFAULT '1500' NOT NULL,
	"total_matches" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"occ_version" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "router_models" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "routing_benchmarks" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"task_category" varchar(30) NOT NULL,
	"query_text" text NOT NULL,
	"query_embedding_id" varchar(255),
	"model_id" uuid NOT NULL,
	"performance_score" numeric(10, 4) NOT NULL,
	"token_count" integer NOT NULL,
	"latency_ms" integer NOT NULL,
	"mlp_weights" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "routing_benchmarks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "routing_decisions" ADD COLUMN "router_type" varchar(30);--> statement-breakpoint
ALTER TABLE "memory_edges" ADD CONSTRAINT "memory_edges_instance_id_agent_memory_instances_id_fk" FOREIGN KEY ("instance_id") REFERENCES "public"."agent_memory_instances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_edges" ADD CONSTRAINT "memory_edges_parent_node_id_memory_nodes_id_fk" FOREIGN KEY ("parent_node_id") REFERENCES "public"."memory_nodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_edges" ADD CONSTRAINT "memory_edges_child_node_id_memory_nodes_id_fk" FOREIGN KEY ("child_node_id") REFERENCES "public"."memory_nodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_glossary_keywords" ADD CONSTRAINT "memory_glossary_keywords_instance_id_agent_memory_instances_id_fk" FOREIGN KEY ("instance_id") REFERENCES "public"."agent_memory_instances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_glossary_keywords" ADD CONSTRAINT "memory_glossary_keywords_node_id_memory_nodes_id_fk" FOREIGN KEY ("node_id") REFERENCES "public"."memory_nodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_nodes" ADD CONSTRAINT "memory_nodes_instance_id_agent_memory_instances_id_fk" FOREIGN KEY ("instance_id") REFERENCES "public"."agent_memory_instances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_paths" ADD CONSTRAINT "memory_paths_instance_id_agent_memory_instances_id_fk" FOREIGN KEY ("instance_id") REFERENCES "public"."agent_memory_instances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_paths" ADD CONSTRAINT "memory_paths_edge_id_memory_edges_id_fk" FOREIGN KEY ("edge_id") REFERENCES "public"."memory_edges"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_paths" ADD CONSTRAINT "memory_paths_node_id_memory_nodes_id_fk" FOREIGN KEY ("node_id") REFERENCES "public"."memory_nodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_sessions" ADD CONSTRAINT "memory_sessions_memory_instance_id_agent_memory_instances_id_fk" FOREIGN KEY ("memory_instance_id") REFERENCES "public"."agent_memory_instances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_sessions" ADD CONSTRAINT "memory_sessions_execution_id_workflow_executions_id_fk" FOREIGN KEY ("execution_id") REFERENCES "public"."workflow_executions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_sessions" ADD CONSTRAINT "memory_sessions_agent_conversation_id_agent_conversations_id_fk" FOREIGN KEY ("agent_conversation_id") REFERENCES "public"."agent_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_versions" ADD CONSTRAINT "memory_versions_node_id_memory_nodes_id_fk" FOREIGN KEY ("node_id") REFERENCES "public"."memory_nodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_versions" ADD CONSTRAINT "memory_versions_migrated_to_fkey" FOREIGN KEY ("migrated_to") REFERENCES "public"."memory_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_health_status" ADD CONSTRAINT "provider_health_status_tenant_id_organizations_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organizations"("tenant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_health_status" ADD CONSTRAINT "provider_health_status_model_id_router_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."router_models"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "router_models" ADD CONSTRAINT "router_models_tenant_id_organizations_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organizations"("tenant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "router_models" ADD CONSTRAINT "router_models_model_id_llm_model_configs_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."llm_model_configs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routing_benchmarks" ADD CONSTRAINT "routing_benchmarks_model_id_router_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."router_models"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_agent_memory_instances_tenant_id" ON "agent_memory_instances" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_agent_memory_instances_created_by" ON "agent_memory_instances" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "idx_agent_memory_instances_status" ON "agent_memory_instances" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_memory_edges_instance_parent_child" ON "memory_edges" USING btree ("instance_id","parent_node_id","child_node_id");--> statement-breakpoint
CREATE INDEX "idx_memory_edges_instance_id" ON "memory_edges" USING btree ("instance_id");--> statement-breakpoint
CREATE INDEX "idx_memory_edges_parent_node_id" ON "memory_edges" USING btree ("parent_node_id");--> statement-breakpoint
CREATE INDEX "idx_memory_edges_child_node_id" ON "memory_edges" USING btree ("child_node_id");--> statement-breakpoint
CREATE INDEX "idx_memory_edges_tenant_id" ON "memory_edges" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_memory_glossary_keywords_instance_keyword_node" ON "memory_glossary_keywords" USING btree ("instance_id","keyword","node_id");--> statement-breakpoint
CREATE INDEX "idx_memory_glossary_keywords_instance_id" ON "memory_glossary_keywords" USING btree ("instance_id");--> statement-breakpoint
CREATE INDEX "idx_memory_glossary_keywords_keyword" ON "memory_glossary_keywords" USING btree ("keyword");--> statement-breakpoint
CREATE INDEX "idx_memory_glossary_keywords_node_id" ON "memory_glossary_keywords" USING btree ("node_id");--> statement-breakpoint
CREATE INDEX "idx_memory_glossary_keywords_tenant_id" ON "memory_glossary_keywords" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_memory_nodes_instance_id" ON "memory_nodes" USING btree ("instance_id");--> statement-breakpoint
CREATE INDEX "idx_memory_nodes_tenant_id" ON "memory_nodes" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_memory_paths_instance_domain_path" ON "memory_paths" USING btree ("instance_id","domain","path_string");--> statement-breakpoint
CREATE INDEX "idx_memory_paths_instance_domain" ON "memory_paths" USING btree ("instance_id","domain");--> statement-breakpoint
CREATE INDEX "idx_memory_paths_node_id" ON "memory_paths" USING btree ("node_id");--> statement-breakpoint
CREATE INDEX "idx_memory_paths_tenant_id" ON "memory_paths" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_memory_sessions_instance_execution_active" ON "memory_sessions" USING btree ("memory_instance_id","execution_id") WHERE status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "uq_memory_sessions_instance_conversation_active" ON "memory_sessions" USING btree ("memory_instance_id","agent_conversation_id") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "idx_memory_sessions_execution_id" ON "memory_sessions" USING btree ("execution_id");--> statement-breakpoint
CREATE INDEX "idx_memory_sessions_agent_conversation_id" ON "memory_sessions" USING btree ("agent_conversation_id");--> statement-breakpoint
CREATE INDEX "idx_memory_sessions_instance_status" ON "memory_sessions" USING btree ("memory_instance_id","status");--> statement-breakpoint
CREATE INDEX "idx_memory_versions_node_id" ON "memory_versions" USING btree ("node_id");--> statement-breakpoint
CREATE INDEX "idx_memory_versions_tenant_id" ON "memory_versions" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_memory_versions_review_status" ON "memory_versions" USING btree ("review_status");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_provider_health_status_tenant_provider_model" ON "provider_health_status" USING btree ("tenant_id","provider_name","model_id");--> statement-breakpoint
CREATE INDEX "idx_provider_health_status_tenant_id" ON "provider_health_status" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_provider_health_status_provider_name" ON "provider_health_status" USING btree ("provider_name");--> statement-breakpoint
CREATE INDEX "idx_provider_health_status_status" ON "provider_health_status" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_router_models_tenant_model" ON "router_models" USING btree ("tenant_id","model_id");--> statement-breakpoint
CREATE INDEX "idx_router_models_tenant_id" ON "router_models" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_router_models_provider_name" ON "router_models" USING btree ("provider_name");--> statement-breakpoint
CREATE INDEX "idx_router_models_is_active" ON "router_models" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "idx_routing_benchmarks_task_category" ON "routing_benchmarks" USING btree ("task_category");--> statement-breakpoint
CREATE INDEX "idx_routing_benchmarks_model_id" ON "routing_benchmarks" USING btree ("model_id");--> statement-breakpoint
CREATE INDEX "idx_routing_benchmarks_query_embedding_id" ON "routing_benchmarks" USING btree ("query_embedding_id");--> statement-breakpoint
CREATE POLICY "agent_memory_instances_select_policy" ON "agent_memory_instances" AS PERMISSIVE FOR SELECT TO "authenticated" USING (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "agent_memory_instances_insert_policy" ON "agent_memory_instances" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "agent_memory_instances_update_policy" ON "agent_memory_instances" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (tenant_id = get_tenant_id()) WITH CHECK (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "agent_memory_instances_delete_policy" ON "agent_memory_instances" AS PERMISSIVE FOR DELETE TO "authenticated" USING (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "memory_edges_select_policy" ON "memory_edges" AS PERMISSIVE FOR SELECT TO "authenticated" USING (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "memory_edges_insert_policy" ON "memory_edges" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "memory_edges_update_policy" ON "memory_edges" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (tenant_id = get_tenant_id()) WITH CHECK (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "memory_edges_delete_policy" ON "memory_edges" AS PERMISSIVE FOR DELETE TO "authenticated" USING (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "memory_glossary_keywords_select_policy" ON "memory_glossary_keywords" AS PERMISSIVE FOR SELECT TO "authenticated" USING (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "memory_glossary_keywords_insert_policy" ON "memory_glossary_keywords" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "memory_glossary_keywords_update_policy" ON "memory_glossary_keywords" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (tenant_id = get_tenant_id()) WITH CHECK (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "memory_glossary_keywords_delete_policy" ON "memory_glossary_keywords" AS PERMISSIVE FOR DELETE TO "authenticated" USING (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "memory_nodes_select_policy" ON "memory_nodes" AS PERMISSIVE FOR SELECT TO "authenticated" USING (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "memory_nodes_insert_policy" ON "memory_nodes" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "memory_nodes_update_policy" ON "memory_nodes" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (tenant_id = get_tenant_id()) WITH CHECK (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "memory_nodes_delete_policy" ON "memory_nodes" AS PERMISSIVE FOR DELETE TO "authenticated" USING (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "memory_paths_select_policy" ON "memory_paths" AS PERMISSIVE FOR SELECT TO "authenticated" USING (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "memory_paths_insert_policy" ON "memory_paths" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "memory_paths_update_policy" ON "memory_paths" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (tenant_id = get_tenant_id()) WITH CHECK (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "memory_paths_delete_policy" ON "memory_paths" AS PERMISSIVE FOR DELETE TO "authenticated" USING (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "memory_sessions_select_policy" ON "memory_sessions" AS PERMISSIVE FOR SELECT TO "authenticated" USING (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "memory_sessions_insert_policy" ON "memory_sessions" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "memory_sessions_update_policy" ON "memory_sessions" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (tenant_id = get_tenant_id()) WITH CHECK (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "memory_sessions_delete_policy" ON "memory_sessions" AS PERMISSIVE FOR DELETE TO "authenticated" USING (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "memory_versions_select_policy" ON "memory_versions" AS PERMISSIVE FOR SELECT TO "authenticated" USING (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "memory_versions_insert_policy" ON "memory_versions" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "memory_versions_update_policy" ON "memory_versions" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (tenant_id = get_tenant_id()) WITH CHECK (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "memory_versions_delete_policy" ON "memory_versions" AS PERMISSIVE FOR DELETE TO "authenticated" USING (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "provider_health_status_select_policy" ON "provider_health_status" AS PERMISSIVE FOR SELECT TO "authenticated" USING (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "provider_health_status_insert_policy" ON "provider_health_status" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "provider_health_status_update_policy" ON "provider_health_status" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (tenant_id = get_tenant_id()) WITH CHECK (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "provider_health_status_delete_policy" ON "provider_health_status" AS PERMISSIVE FOR DELETE TO "authenticated" USING (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "router_models_select_policy" ON "router_models" AS PERMISSIVE FOR SELECT TO "authenticated" USING (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "router_models_insert_policy" ON "router_models" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "router_models_update_policy" ON "router_models" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (tenant_id = get_tenant_id()) WITH CHECK (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "router_models_delete_policy" ON "router_models" AS PERMISSIVE FOR DELETE TO "authenticated" USING (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "routing_benchmarks_select_policy" ON "routing_benchmarks" AS PERMISSIVE FOR SELECT TO "authenticated" USING (EXISTS (
    SELECT 1 FROM "router_models"
    WHERE "router_models"."id" = "routing_benchmarks"."model_id"
    AND "router_models".tenant_id = get_tenant_id()
  ));--> statement-breakpoint
CREATE POLICY "routing_benchmarks_insert_policy" ON "routing_benchmarks" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (EXISTS (
    SELECT 1 FROM "router_models"
    WHERE "router_models"."id" = "routing_benchmarks"."model_id"
    AND "router_models".tenant_id = get_tenant_id()
  ));--> statement-breakpoint
CREATE POLICY "routing_benchmarks_update_policy" ON "routing_benchmarks" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (EXISTS (
    SELECT 1 FROM "router_models"
    WHERE "router_models"."id" = "routing_benchmarks"."model_id"
    AND "router_models".tenant_id = get_tenant_id()
  )) WITH CHECK (EXISTS (
    SELECT 1 FROM "router_models"
    WHERE "router_models"."id" = "routing_benchmarks"."model_id"
    AND "router_models".tenant_id = get_tenant_id()
  ));--> statement-breakpoint
CREATE POLICY "routing_benchmarks_delete_policy" ON "routing_benchmarks" AS PERMISSIVE FOR DELETE TO "authenticated" USING (EXISTS (
    SELECT 1 FROM "router_models"
    WHERE "router_models"."id" = "routing_benchmarks"."model_id"
    AND "router_models".tenant_id = get_tenant_id()
  ));