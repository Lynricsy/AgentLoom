CREATE TYPE "public"."marketplace_listing_type" AS ENUM('workflow', 'plugin');--> statement-breakpoint
CREATE TYPE "public"."marketplace_pricing_model" AS ENUM('free', 'per_execution');--> statement-breakpoint
CREATE TYPE "public"."payout_status" AS ENUM('pending', 'processing', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."plugin_developer_key_status" AS ENUM('active', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."plugin_status" AS ENUM('registered', 'active', 'disabled', 'error');--> statement-breakpoint
CREATE TYPE "public"."record_type" AS ENUM('step_telemetry', 'execution_summary');--> statement-breakpoint
CREATE TABLE "agent_execution_records" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"execution_id" uuid NOT NULL,
	"step_id" uuid,
	"node_id" text,
	"record_type" "record_type" NOT NULL,
	"data" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_execution_records" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "plugin_developer_keys" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"public_key" text NOT NULL,
	"key_fingerprint" varchar(64) NOT NULL,
	"label" varchar(255),
	"status" "plugin_developer_key_status" DEFAULT 'active' NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "plugin_developer_keys" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "plugin_earnings" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"plugin_db_id" uuid NOT NULL,
	"plugin_id" varchar(255) NOT NULL,
	"org_id" uuid NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"total_executions" integer DEFAULT 0 NOT NULL,
	"total_revenue" numeric(18, 8) DEFAULT '0' NOT NULL,
	"developer_share" numeric(18, 8) DEFAULT '0' NOT NULL,
	"platform_share" numeric(18, 8) DEFAULT '0' NOT NULL,
	"listing_commission" numeric(18, 8) DEFAULT '0' NOT NULL,
	"currency" varchar(10) DEFAULT 'USD' NOT NULL,
	"payout_status" "payout_status" DEFAULT 'pending' NOT NULL,
	"payout_reference" varchar(255),
	"payout_at" timestamp with time zone,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plugin_earnings_total_executions_non_negative" CHECK ("plugin_earnings"."total_executions" >= 0),
	CONSTRAINT "plugin_earnings_total_revenue_non_negative" CHECK ("plugin_earnings"."total_revenue" >= 0),
	CONSTRAINT "plugin_earnings_developer_share_non_negative" CHECK ("plugin_earnings"."developer_share" >= 0),
	CONSTRAINT "plugin_earnings_platform_share_non_negative" CHECK ("plugin_earnings"."platform_share" >= 0)
);
--> statement-breakpoint
ALTER TABLE "plugin_earnings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "plugin_usage_records" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"plugin_db_id" uuid NOT NULL,
	"plugin_id" varchar(255) NOT NULL,
	"execution_id" uuid NOT NULL,
	"step_id" uuid,
	"executed_by" uuid,
	"billing_amount" numeric(18, 8),
	"currency" varchar(10) DEFAULT 'USD',
	"execution_duration_ms" numeric(12, 0),
	"input_tokens" numeric(12, 0),
	"output_tokens" numeric(12, 0),
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "plugin_usage_records" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "plugins" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"plugin_id" varchar(255) NOT NULL,
	"name" varchar(255) NOT NULL,
	"version" varchar(50) NOT NULL,
	"author" varchar(255) NOT NULL,
	"description" text,
	"license" varchar(100),
	"status" "plugin_status" DEFAULT 'registered' NOT NULL,
	"manifest" jsonb NOT NULL,
	"node_definitions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"storage_key" varchar(500),
	"signature" text,
	"content_hash" varchar(64),
	"wasm_bundle_url" varchar(512),
	"permissions" text[] DEFAULT '{}'::text[] NOT NULL,
	"installed_by" uuid,
	"metadata" jsonb,
	"occ_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "plugins" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "routing_decisions" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"execution_step_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"routing_node_id" text NOT NULL,
	"strategy" varchar(30) NOT NULL,
	"models_evaluated" jsonb NOT NULL,
	"selected_model_id" uuid,
	"decision_reasoning" text NOT NULL,
	"routing_latency_ms" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "routing_decisions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tenant_encryption_keys" DROP CONSTRAINT "uq_tenant_encryption_keys_org_id";--> statement-breakpoint
DROP INDEX "uq_marketplace_listings_workflow_version_id";--> statement-breakpoint
ALTER TABLE "marketplace_listings" ALTER COLUMN "workflow_version_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "llm_model_configs" ADD COLUMN "endpoint_url" varchar(2048);--> statement-breakpoint
ALTER TABLE "llm_model_configs" ADD COLUMN "auth_method" varchar(20);--> statement-breakpoint
ALTER TABLE "llm_model_configs" ADD COLUMN "auth_config" jsonb;--> statement-breakpoint
ALTER TABLE "llm_model_configs" ADD COLUMN "timeout_ms" integer;--> statement-breakpoint
ALTER TABLE "marketplace_listings" ADD COLUMN "plugin_db_id" uuid;--> statement-breakpoint
ALTER TABLE "marketplace_listings" ADD COLUMN "listing_type" "marketplace_listing_type" DEFAULT 'workflow' NOT NULL;--> statement-breakpoint
ALTER TABLE "marketplace_listings" ADD COLUMN "pricing_model" "marketplace_pricing_model" DEFAULT 'free' NOT NULL;--> statement-breakpoint
ALTER TABLE "marketplace_listings" ADD COLUMN "price_per_execution" numeric(18, 8);--> statement-breakpoint
ALTER TABLE "agent_execution_records" ADD CONSTRAINT "agent_execution_records_execution_id_workflow_executions_id_fk" FOREIGN KEY ("execution_id") REFERENCES "public"."workflow_executions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_execution_records" ADD CONSTRAINT "agent_execution_records_step_id_execution_steps_id_fk" FOREIGN KEY ("step_id") REFERENCES "public"."execution_steps"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plugin_developer_keys" ADD CONSTRAINT "plugin_developer_keys_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plugin_developer_keys" ADD CONSTRAINT "plugin_developer_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plugin_earnings" ADD CONSTRAINT "plugin_earnings_plugin_db_id_plugins_id_fk" FOREIGN KEY ("plugin_db_id") REFERENCES "public"."plugins"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plugin_earnings" ADD CONSTRAINT "plugin_earnings_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plugin_usage_records" ADD CONSTRAINT "plugin_usage_records_plugin_db_id_plugins_id_fk" FOREIGN KEY ("plugin_db_id") REFERENCES "public"."plugins"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plugin_usage_records" ADD CONSTRAINT "plugin_usage_records_executed_by_users_id_fk" FOREIGN KEY ("executed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plugins" ADD CONSTRAINT "plugins_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plugins" ADD CONSTRAINT "plugins_installed_by_users_id_fk" FOREIGN KEY ("installed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routing_decisions" ADD CONSTRAINT "routing_decisions_execution_step_id_execution_steps_id_fk" FOREIGN KEY ("execution_step_id") REFERENCES "public"."execution_steps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routing_decisions" ADD CONSTRAINT "routing_decisions_selected_model_id_llm_model_configs_id_fk" FOREIGN KEY ("selected_model_id") REFERENCES "public"."llm_model_configs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_execution_records_execution_id" ON "agent_execution_records" USING btree ("execution_id");--> statement-breakpoint
CREATE INDEX "idx_execution_records_step_id" ON "agent_execution_records" USING btree ("step_id");--> statement-breakpoint
CREATE INDEX "idx_execution_records_record_type" ON "agent_execution_records" USING btree ("record_type");--> statement-breakpoint
CREATE INDEX "idx_execution_records_created_at" ON "agent_execution_records" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_plugin_developer_keys_org_fingerprint" ON "plugin_developer_keys" USING btree ("org_id","key_fingerprint");--> statement-breakpoint
CREATE INDEX "idx_plugin_developer_keys_tenant_id" ON "plugin_developer_keys" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_plugin_developer_keys_user_id" ON "plugin_developer_keys" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_plugin_developer_keys_status" ON "plugin_developer_keys" USING btree ("status");--> statement-breakpoint
CREATE INDEX "plugin_earnings_tenant_plugin_idx" ON "plugin_earnings" USING btree ("tenant_id","plugin_db_id");--> statement-breakpoint
CREATE INDEX "plugin_earnings_org_idx" ON "plugin_earnings" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "plugin_earnings_period_idx" ON "plugin_earnings" USING btree ("period_start","period_end");--> statement-breakpoint
CREATE INDEX "plugin_earnings_payout_status_idx" ON "plugin_earnings" USING btree ("payout_status");--> statement-breakpoint
CREATE INDEX "plugin_usage_records_tenant_plugin_idx" ON "plugin_usage_records" USING btree ("tenant_id","plugin_db_id");--> statement-breakpoint
CREATE INDEX "plugin_usage_records_execution_idx" ON "plugin_usage_records" USING btree ("execution_id");--> statement-breakpoint
CREATE INDEX "plugin_usage_records_created_at_idx" ON "plugin_usage_records" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "plugin_usage_records_plugin_id_idx" ON "plugin_usage_records" USING btree ("plugin_id");--> statement-breakpoint
CREATE UNIQUE INDEX "plugins_org_plugin_id_idx" ON "plugins" USING btree ("org_id","plugin_id");--> statement-breakpoint
CREATE INDEX "plugins_tenant_status_idx" ON "plugins" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "plugins_installed_by_idx" ON "plugins" USING btree ("installed_by");--> statement-breakpoint
CREATE INDEX "idx_routing_decisions_execution_step_id" ON "routing_decisions" USING btree ("execution_step_id");--> statement-breakpoint
CREATE INDEX "idx_routing_decisions_tenant_id" ON "routing_decisions" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_routing_decisions_selected_model_id" ON "routing_decisions" USING btree ("selected_model_id");--> statement-breakpoint
ALTER TABLE "marketplace_listings" ADD CONSTRAINT "marketplace_listings_plugin_db_id_plugins_id_fk" FOREIGN KEY ("plugin_db_id") REFERENCES "public"."plugins"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_marketplace_listings_plugin_db_id" ON "marketplace_listings" USING btree ("plugin_db_id") WHERE plugin_db_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_marketplace_listings_listing_type" ON "marketplace_listings" USING btree ("listing_type");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_tenant_encryption_keys_org_fingerprint" ON "tenant_encryption_keys" USING btree ("organization_id","key_fingerprint");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_tenant_encryption_keys_org_active" ON "tenant_encryption_keys" USING btree ("organization_id") WHERE "tenant_encryption_keys"."status" = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "uq_marketplace_listings_workflow_version_id" ON "marketplace_listings" USING btree ("workflow_version_id") WHERE workflow_version_id IS NOT NULL;--> statement-breakpoint
ALTER TABLE "marketplace_listings" ADD CONSTRAINT "marketplace_listings_price_per_execution_non_negative" CHECK ("marketplace_listings"."price_per_execution" IS NULL OR "marketplace_listings"."price_per_execution" >= 0);--> statement-breakpoint
CREATE POLICY "agent_execution_records_select_policy" ON "agent_execution_records" AS PERMISSIVE FOR SELECT TO "authenticated" USING (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "agent_execution_records_insert_policy" ON "agent_execution_records" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "agent_execution_records_update_policy" ON "agent_execution_records" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (tenant_id = get_tenant_id()) WITH CHECK (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "agent_execution_records_delete_policy" ON "agent_execution_records" AS PERMISSIVE FOR DELETE TO "authenticated" USING (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "plugin_developer_keys_select_policy" ON "plugin_developer_keys" AS PERMISSIVE FOR SELECT TO "authenticated" USING (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "plugin_developer_keys_insert_policy" ON "plugin_developer_keys" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "plugin_developer_keys_update_policy" ON "plugin_developer_keys" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (tenant_id = get_tenant_id()) WITH CHECK (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "plugin_developer_keys_delete_policy" ON "plugin_developer_keys" AS PERMISSIVE FOR DELETE TO "authenticated" USING (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "plugin_earnings_select_policy" ON "plugin_earnings" AS PERMISSIVE FOR SELECT TO "authenticated" USING (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "plugin_earnings_insert_policy" ON "plugin_earnings" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "plugin_earnings_update_policy" ON "plugin_earnings" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (tenant_id = get_tenant_id()) WITH CHECK (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "plugin_earnings_delete_policy" ON "plugin_earnings" AS PERMISSIVE FOR DELETE TO "authenticated" USING (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "plugin_usage_records_select_policy" ON "plugin_usage_records" AS PERMISSIVE FOR SELECT TO "authenticated" USING (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "plugin_usage_records_insert_policy" ON "plugin_usage_records" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "plugin_usage_records_update_policy" ON "plugin_usage_records" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (tenant_id = get_tenant_id()) WITH CHECK (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "plugin_usage_records_delete_policy" ON "plugin_usage_records" AS PERMISSIVE FOR DELETE TO "authenticated" USING (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "plugins_select_policy" ON "plugins" AS PERMISSIVE FOR SELECT TO "authenticated" USING (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "plugins_insert_policy" ON "plugins" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "plugins_update_policy" ON "plugins" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (tenant_id = get_tenant_id()) WITH CHECK (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "plugins_delete_policy" ON "plugins" AS PERMISSIVE FOR DELETE TO "authenticated" USING (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "routing_decisions_select_policy" ON "routing_decisions" AS PERMISSIVE FOR SELECT TO "authenticated" USING (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "routing_decisions_insert_policy" ON "routing_decisions" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "routing_decisions_update_policy" ON "routing_decisions" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (tenant_id = get_tenant_id()) WITH CHECK (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "routing_decisions_delete_policy" ON "routing_decisions" AS PERMISSIVE FOR DELETE TO "authenticated" USING (tenant_id = get_tenant_id());