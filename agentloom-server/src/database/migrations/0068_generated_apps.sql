CREATE TYPE "public"."generated_app_status" AS ENUM(
  'app_spec_ready',
  'preview_ready',
  'trial_ready',
  'publish_candidate',
  'published',
  'failed'
);--> statement-breakpoint

CREATE TABLE "generated_apps" (
  "id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "prompt" text NOT NULL,
  "app_name" varchar(255) NOT NULL,
  "description" text NOT NULL,
  "status" "generated_app_status" DEFAULT 'app_spec_ready' NOT NULL,
  "app_spec" jsonb NOT NULL,
  "generation_plan" jsonb DEFAULT NULL,
  "gate_results" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "readiness" jsonb NOT NULL,
  "preview" jsonb NOT NULL,
  "agent_definition_id" uuid,
  "workflow_definition_id" uuid,
  "plugin_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "public_share_token" text,
  "public_share_enabled" boolean DEFAULT false NOT NULL,
  "public_share_created_at" timestamp with time zone,
  "public_share_disabled_at" timestamp with time zone,
  "public_view_count" integer DEFAULT 0 NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_by" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

ALTER TABLE "generated_apps" ADD CONSTRAINT "generated_apps_agent_definition_id_agent_definitions_id_fk" FOREIGN KEY ("agent_definition_id") REFERENCES "public"."agent_definitions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generated_apps" ADD CONSTRAINT "generated_apps_workflow_definition_id_workflow_definitions_id_fk" FOREIGN KEY ("workflow_definition_id") REFERENCES "public"."workflow_definitions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generated_apps" ADD CONSTRAINT "generated_apps_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generated_apps" ADD CONSTRAINT "generated_apps_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

CREATE UNIQUE INDEX "uq_generated_apps_public_share_token" ON "generated_apps" USING btree ("public_share_token");--> statement-breakpoint
CREATE INDEX "idx_generated_apps_tenant_updated" ON "generated_apps" USING btree ("tenant_id", "updated_at");--> statement-breakpoint
CREATE INDEX "idx_generated_apps_tenant_status" ON "generated_apps" USING btree ("tenant_id", "status");--> statement-breakpoint
CREATE INDEX "idx_generated_apps_created_by" ON "generated_apps" USING btree ("created_by");--> statement-breakpoint

ALTER TABLE "generated_apps" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "generated_apps_select_policy" ON "generated_apps" AS PERMISSIVE FOR SELECT TO "authenticated" USING (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "generated_apps_insert_policy" ON "generated_apps" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "generated_apps_update_policy" ON "generated_apps" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (tenant_id = get_tenant_id()) WITH CHECK (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "generated_apps_delete_policy" ON "generated_apps" AS PERMISSIVE FOR DELETE TO "authenticated" USING (tenant_id = get_tenant_id());--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "generated_apps" TO "authenticated";
