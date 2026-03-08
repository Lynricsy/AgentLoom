CREATE TYPE "public"."mcp_server_status" AS ENUM('active', 'inactive', 'error');--> statement-breakpoint
CREATE TYPE "public"."mcp_transport_type" AS ENUM('stdio', 'sse', 'streamable_http');--> statement-breakpoint
CREATE TYPE "public"."tool_source" AS ENUM('mcp', 'builtin', 'custom');--> statement-breakpoint
CREATE TABLE "mcp_server_configs" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"transport_type" "mcp_transport_type" NOT NULL,
	"command" text,
	"args" jsonb,
	"url" text,
	"encrypted_data" "bytea",
	"encrypted_dek" "bytea",
	"iv" "bytea",
	"auth_tag" "bytea",
	"status" "mcp_server_status" DEFAULT 'active' NOT NULL,
	"last_tested_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mcp_server_configs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "tool_definitions" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"mcp_server_config_id" uuid,
	"source" "tool_source" DEFAULT 'mcp' NOT NULL,
	"name" text NOT NULL,
	"title" text,
	"description" text,
	"input_schema" jsonb,
	"output_schema" jsonb,
	"port_mapping_metadata" jsonb,
	"annotations" jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"imported_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tool_definitions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "mcp_server_configs" ADD CONSTRAINT "mcp_server_configs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_server_configs" ADD CONSTRAINT "mcp_server_configs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool_definitions" ADD CONSTRAINT "tool_definitions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool_definitions" ADD CONSTRAINT "tool_definitions_mcp_server_config_id_mcp_server_configs_id_fk" FOREIGN KEY ("mcp_server_config_id") REFERENCES "public"."mcp_server_configs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_mcp_server_configs_tenant_id" ON "mcp_server_configs" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_mcp_server_configs_org_id" ON "mcp_server_configs" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_mcp_server_configs_created_by" ON "mcp_server_configs" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "idx_tool_definitions_tenant_id" ON "tool_definitions" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_tool_definitions_org_id" ON "tool_definitions" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_tool_definitions_mcp_server_config_id" ON "tool_definitions" USING btree ("mcp_server_config_id");--> statement-breakpoint
CREATE INDEX "idx_tool_definitions_source" ON "tool_definitions" USING btree ("source");--> statement-breakpoint
CREATE POLICY "mcp_server_configs_select_policy" ON "mcp_server_configs" AS PERMISSIVE FOR SELECT TO "authenticated" USING (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "mcp_server_configs_insert_policy" ON "mcp_server_configs" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "mcp_server_configs_update_policy" ON "mcp_server_configs" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (tenant_id = get_tenant_id()) WITH CHECK (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "mcp_server_configs_delete_policy" ON "mcp_server_configs" AS PERMISSIVE FOR DELETE TO "authenticated" USING (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "tool_definitions_select_policy" ON "tool_definitions" AS PERMISSIVE FOR SELECT TO "authenticated" USING (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "tool_definitions_insert_policy" ON "tool_definitions" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "tool_definitions_update_policy" ON "tool_definitions" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (tenant_id = get_tenant_id()) WITH CHECK (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "tool_definitions_delete_policy" ON "tool_definitions" AS PERMISSIVE FOR DELETE TO "authenticated" USING (tenant_id = get_tenant_id());