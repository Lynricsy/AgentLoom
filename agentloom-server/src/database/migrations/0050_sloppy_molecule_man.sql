CREATE TYPE "public"."agent_status_enum" AS ENUM('draft', 'published', 'archived');--> statement-breakpoint
CREATE TYPE "public"."conversation_status_enum" AS ENUM('active', 'paused', 'ended', 'failed');--> statement-breakpoint
CREATE TYPE "public"."message_content_type_enum" AS ENUM('text', 'image', 'file', 'tool_call', 'tool_result', 'system');--> statement-breakpoint
CREATE TYPE "public"."message_role_enum" AS ENUM('user', 'assistant', 'system', 'tool');--> statement-breakpoint
CREATE TYPE "public"."workspace_snapshot_status_enum" AS ENUM('creating', 'ready', 'archived', 'deleted');--> statement-breakpoint
CREATE TABLE "agent_conversations" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"agent_definition_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"title" varchar(255),
	"status" "conversation_status_enum" DEFAULT 'active' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_conversations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "agent_definitions" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"slug" varchar(255) NOT NULL,
	"description" text,
	"system_prompt" text,
	"nodes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"edges" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"viewport" jsonb,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"sandbox_config" jsonb DEFAULT 'null'::jsonb,
	"workspace_snapshot_id" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"status" "agent_status_enum" DEFAULT 'draft' NOT NULL,
	"published_version_id" uuid,
	"created_by" uuid NOT NULL,
	"updated_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_definitions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "agent_messages" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"role" "message_role_enum" NOT NULL,
	"content_type" "message_content_type_enum" DEFAULT 'text' NOT NULL,
	"content" text NOT NULL,
	"tool_calls" jsonb DEFAULT 'null'::jsonb,
	"tool_results" jsonb DEFAULT 'null'::jsonb,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"parent_message_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_messages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "agent_versions" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"agent_definition_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"label" varchar(255),
	"snapshot" jsonb NOT NULL,
	"published_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_versions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "workspace_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"organization_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"storage_key" varchar(512) NOT NULL,
	"size_bytes" bigint,
	"status" "workspace_snapshot_status_enum" DEFAULT 'creating' NOT NULL,
	"config" jsonb DEFAULT 'null'::jsonb,
	"created_by_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workspace_snapshots" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sandbox_sessions" ALTER COLUMN "execution_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "sandbox_sessions" ALTER COLUMN "sandbox_node_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "sandbox_sessions" ADD COLUMN "agent_conversation_id" uuid;--> statement-breakpoint
ALTER TABLE "agent_conversations" ADD CONSTRAINT "agent_conversations_agent_definition_id_agent_definitions_id_fk" FOREIGN KEY ("agent_definition_id") REFERENCES "public"."agent_definitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_conversations" ADD CONSTRAINT "agent_conversations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_definitions" ADD CONSTRAINT "agent_definitions_workspace_snapshot_id_workspace_snapshots_id_fk" FOREIGN KEY ("workspace_snapshot_id") REFERENCES "public"."workspace_snapshots"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_definitions" ADD CONSTRAINT "agent_definitions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_definitions" ADD CONSTRAINT "agent_definitions_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_messages" ADD CONSTRAINT "agent_messages_conversation_id_agent_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."agent_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_messages" ADD CONSTRAINT "agent_messages_parent_message_id_agent_messages_id_fk" FOREIGN KEY ("parent_message_id") REFERENCES "public"."agent_messages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_versions" ADD CONSTRAINT "agent_versions_agent_definition_id_agent_definitions_id_fk" FOREIGN KEY ("agent_definition_id") REFERENCES "public"."agent_definitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_versions" ADD CONSTRAINT "agent_versions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_snapshots" ADD CONSTRAINT "workspace_snapshots_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_snapshots" ADD CONSTRAINT "workspace_snapshots_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_agent_conversations_agent_id" ON "agent_conversations" USING btree ("agent_definition_id");--> statement-breakpoint
CREATE INDEX "idx_agent_conversations_tenant_updated" ON "agent_conversations" USING btree ("tenant_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_agent_conversations_tenant_status" ON "agent_conversations" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_agent_definitions_tenant_slug" ON "agent_definitions" USING btree ("tenant_id","slug");--> statement-breakpoint
CREATE INDEX "idx_agent_definitions_tenant_updated" ON "agent_definitions" USING btree ("tenant_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_agent_definitions_tenant_status" ON "agent_definitions" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "idx_agent_definitions_tenant_id" ON "agent_definitions" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_agent_messages_conversation_id" ON "agent_messages" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "idx_agent_messages_tenant_created" ON "agent_messages" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_agent_versions_agent_version" ON "agent_versions" USING btree ("agent_definition_id","version_number");--> statement-breakpoint
CREATE INDEX "idx_agent_versions_tenant_published" ON "agent_versions" USING btree ("tenant_id","published_at");--> statement-breakpoint
CREATE INDEX "idx_agent_versions_tenant_id" ON "agent_versions" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_workspace_snapshots_org_id" ON "workspace_snapshots" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_workspace_snapshots_tenant_status" ON "workspace_snapshots" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "idx_workspace_snapshots_tenant_id" ON "workspace_snapshots" USING btree ("tenant_id");--> statement-breakpoint
ALTER TABLE "sandbox_sessions" ADD CONSTRAINT "sandbox_sessions_agent_conversation_id_agent_conversations_id_fk" FOREIGN KEY ("agent_conversation_id") REFERENCES "public"."agent_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_sandbox_sessions_agent_conversation_id" ON "sandbox_sessions" USING btree ("agent_conversation_id");--> statement-breakpoint
ALTER TABLE "sandbox_sessions" ADD CONSTRAINT "chk_sandbox_sessions_fk" CHECK (execution_id IS NOT NULL OR agent_conversation_id IS NOT NULL);--> statement-breakpoint
CREATE POLICY "agent_conversations_select_policy" ON "agent_conversations" AS PERMISSIVE FOR SELECT TO "authenticated" USING (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "agent_conversations_insert_policy" ON "agent_conversations" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "agent_conversations_update_policy" ON "agent_conversations" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (tenant_id = get_tenant_id()) WITH CHECK (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "agent_conversations_delete_policy" ON "agent_conversations" AS PERMISSIVE FOR DELETE TO "authenticated" USING (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "agent_definitions_select_policy" ON "agent_definitions" AS PERMISSIVE FOR SELECT TO "authenticated" USING (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "agent_definitions_insert_policy" ON "agent_definitions" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "agent_definitions_update_policy" ON "agent_definitions" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (tenant_id = get_tenant_id()) WITH CHECK (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "agent_definitions_delete_policy" ON "agent_definitions" AS PERMISSIVE FOR DELETE TO "authenticated" USING (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "agent_messages_select_policy" ON "agent_messages" AS PERMISSIVE FOR SELECT TO "authenticated" USING (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "agent_messages_insert_policy" ON "agent_messages" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "agent_messages_update_policy" ON "agent_messages" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (tenant_id = get_tenant_id()) WITH CHECK (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "agent_messages_delete_policy" ON "agent_messages" AS PERMISSIVE FOR DELETE TO "authenticated" USING (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "agent_versions_select_policy" ON "agent_versions" AS PERMISSIVE FOR SELECT TO "authenticated" USING (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "agent_versions_insert_policy" ON "agent_versions" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "agent_versions_update_policy" ON "agent_versions" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (tenant_id = get_tenant_id()) WITH CHECK (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "agent_versions_delete_policy" ON "agent_versions" AS PERMISSIVE FOR DELETE TO "authenticated" USING (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "workspace_snapshots_select_policy" ON "workspace_snapshots" AS PERMISSIVE FOR SELECT TO "authenticated" USING (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "workspace_snapshots_insert_policy" ON "workspace_snapshots" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "workspace_snapshots_update_policy" ON "workspace_snapshots" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (tenant_id = get_tenant_id()) WITH CHECK (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "workspace_snapshots_delete_policy" ON "workspace_snapshots" AS PERMISSIVE FOR DELETE TO "authenticated" USING (tenant_id = get_tenant_id());