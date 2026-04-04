CREATE TYPE "public"."resource_source_kind" AS ENUM('manual', 'share_imported');--> statement-breakpoint
CREATE TYPE "public"."resource_source_resource_type" AS ENUM('workflow_definition', 'agent_definition', 'knowledge_base', 'memory_instance', 'mcp_server_config', 'skill');--> statement-breakpoint
CREATE TYPE "public"."resource_source_share_type" AS ENUM('workflow', 'agent');--> statement-breakpoint

CREATE TABLE "agent_shares" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"agent_definition_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"share_token" text NOT NULL,
	"share_type" "share_type" DEFAULT 'read_only' NOT NULL,
	"created_by" uuid NOT NULL,
	"expires_at" timestamp with time zone,
	"is_revoked" boolean DEFAULT false NOT NULL,
	"view_count" integer DEFAULT 0 NOT NULL,
	"copy_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_shares_view_count_non_negative" CHECK ("agent_shares"."view_count" >= 0),
	CONSTRAINT "agent_shares_copy_count_non_negative" CHECK ("agent_shares"."copy_count" >= 0)
);--> statement-breakpoint

CREATE TABLE "resource_source_records" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"resource_type" "resource_source_resource_type" NOT NULL,
	"resource_id" uuid NOT NULL,
	"origin_kind" "resource_source_kind" NOT NULL,
	"current_kind" "resource_source_kind" NOT NULL,
	"source_share_type" "resource_source_share_type",
	"source_share_id" uuid,
	"source_share_token" text,
	"source_resource_type" "resource_source_resource_type",
	"source_resource_id" uuid,
	"source_resource_title" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

ALTER TABLE "agent_shares" ADD CONSTRAINT "agent_shares_agent_definition_id_agent_definitions_id_fk" FOREIGN KEY ("agent_definition_id") REFERENCES "public"."agent_definitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_shares" ADD CONSTRAINT "agent_shares_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_source_records" ADD CONSTRAINT "resource_source_records_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

CREATE UNIQUE INDEX "uq_agent_shares_token" ON "agent_shares" USING btree ("share_token");--> statement-breakpoint
CREATE INDEX "idx_agent_shares_agent_definition" ON "agent_shares" USING btree ("agent_definition_id");--> statement-breakpoint
CREATE INDEX "idx_agent_shares_tenant_id" ON "agent_shares" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_agent_shares_created_by" ON "agent_shares" USING btree ("created_by");--> statement-breakpoint

CREATE UNIQUE INDEX "uq_resource_source_records_resource" ON "resource_source_records" USING btree ("tenant_id", "resource_type", "resource_id");--> statement-breakpoint
CREATE INDEX "idx_resource_source_records_kind" ON "resource_source_records" USING btree ("tenant_id", "resource_type", "current_kind");--> statement-breakpoint
CREATE INDEX "idx_resource_source_records_source_share" ON "resource_source_records" USING btree ("tenant_id", "source_share_type", "source_share_id");--> statement-breakpoint

ALTER TABLE "resource_source_records" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "resource_source_records_select_policy" ON "resource_source_records" AS PERMISSIVE FOR SELECT TO "authenticated" USING (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "resource_source_records_insert_policy" ON "resource_source_records" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "resource_source_records_update_policy" ON "resource_source_records" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (tenant_id = get_tenant_id()) WITH CHECK (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "resource_source_records_delete_policy" ON "resource_source_records" AS PERMISSIVE FOR DELETE TO "authenticated" USING (tenant_id = get_tenant_id());--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "resource_source_records" TO "authenticated";
