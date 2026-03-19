CREATE TYPE "public"."execution_governance_state_enum" AS ENUM('active', 'paused');--> statement-breakpoint
CREATE TYPE "public"."governance_scope_enum" AS ENUM('tenant', 'workflow');--> statement-breakpoint
ALTER TYPE "public"."notification_type_enum" ADD VALUE 'resource_governance_execution_blocked' BEFORE 'system';--> statement-breakpoint
ALTER TYPE "public"."notification_type_enum" ADD VALUE 'resource_governance_quota_updated' BEFORE 'system';--> statement-breakpoint
ALTER TYPE "public"."notification_type_enum" ADD VALUE 'resource_governance_controls_updated' BEFORE 'system';--> statement-breakpoint
ALTER TYPE "public"."notification_type_enum" ADD VALUE 'resource_governance_execution_terminated' BEFORE 'system';--> statement-breakpoint
CREATE TABLE "execution_governance_controls" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"organization_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"scope" "governance_scope_enum" NOT NULL,
	"target_id" uuid NOT NULL,
	"status" "execution_governance_state_enum" DEFAULT 'active' NOT NULL,
	"reason" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" uuid NOT NULL,
	"updated_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "execution_governance_controls" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "tenant_quotas" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"organization_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"api_rate_limit_per_minute" integer DEFAULT 100 NOT NULL,
	"max_concurrent_executions" integer,
	"daily_execution_limit" integer,
	"daily_api_call_limit" integer,
	"storage_quota_mb" integer,
	"max_sandbox_cpu_percent" integer,
	"max_sandbox_memory_mb" integer,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" uuid NOT NULL,
	"updated_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tenant_quotas" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "execution_governance_controls" ADD CONSTRAINT "execution_governance_controls_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_governance_controls" ADD CONSTRAINT "execution_governance_controls_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_governance_controls" ADD CONSTRAINT "execution_governance_controls_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_quotas" ADD CONSTRAINT "tenant_quotas_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_quotas" ADD CONSTRAINT "tenant_quotas_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_quotas" ADD CONSTRAINT "tenant_quotas_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_execution_governance_controls_target" ON "execution_governance_controls" USING btree ("organization_id","scope","target_id");--> statement-breakpoint
CREATE INDEX "idx_execution_governance_controls_tenant" ON "execution_governance_controls" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_execution_governance_controls_scope" ON "execution_governance_controls" USING btree ("organization_id","scope");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_tenant_quotas_org" ON "tenant_quotas" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_tenant_quotas_tenant" ON "tenant_quotas" USING btree ("tenant_id");--> statement-breakpoint
CREATE POLICY "execution_governance_controls_select_policy" ON "execution_governance_controls" AS PERMISSIVE FOR SELECT TO "authenticated" USING (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "execution_governance_controls_insert_policy" ON "execution_governance_controls" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "execution_governance_controls_update_policy" ON "execution_governance_controls" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (tenant_id = get_tenant_id()) WITH CHECK (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "execution_governance_controls_delete_policy" ON "execution_governance_controls" AS PERMISSIVE FOR DELETE TO "authenticated" USING (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "tenant_quotas_select_policy" ON "tenant_quotas" AS PERMISSIVE FOR SELECT TO "authenticated" USING (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "tenant_quotas_insert_policy" ON "tenant_quotas" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "tenant_quotas_update_policy" ON "tenant_quotas" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (tenant_id = get_tenant_id()) WITH CHECK (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "tenant_quotas_delete_policy" ON "tenant_quotas" AS PERMISSIVE FOR DELETE TO "authenticated" USING (tenant_id = get_tenant_id());