CREATE TYPE "public"."generated_app_gate_run_status" AS ENUM(
  'running',
  'passed',
  'failed',
  'warning',
  'skipped'
);--> statement-breakpoint

CREATE TABLE "generated_app_gate_runs" (
  "id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "generated_app_id" uuid NOT NULL,
  "gate_id" varchar(64) NOT NULL,
  "gate_order" integer NOT NULL,
  "gate_name" varchar(255) NOT NULL,
  "blocking" boolean NOT NULL,
  "attempt_number" integer DEFAULT 1 NOT NULL,
  "status" "generated_app_gate_run_status" NOT NULL,
  "summary" text NOT NULL,
  "evidence" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "failure" jsonb,
  "repair_instructions" text,
  "started_at" timestamp with time zone DEFAULT now() NOT NULL,
  "completed_at" timestamp with time zone,
  "created_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

ALTER TABLE "generated_app_gate_runs" ADD CONSTRAINT "generated_app_gate_runs_generated_app_id_generated_apps_id_fk" FOREIGN KEY ("generated_app_id") REFERENCES "public"."generated_apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generated_app_gate_runs" ADD CONSTRAINT "generated_app_gate_runs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint

CREATE INDEX "idx_generated_app_gate_runs_tenant_app_created" ON "generated_app_gate_runs" USING btree ("tenant_id", "generated_app_id", "created_at");--> statement-breakpoint
CREATE INDEX "idx_generated_app_gate_runs_tenant_app_gate" ON "generated_app_gate_runs" USING btree ("tenant_id", "generated_app_id", "gate_id");--> statement-breakpoint
CREATE INDEX "idx_generated_app_gate_runs_tenant_app_status" ON "generated_app_gate_runs" USING btree ("tenant_id", "generated_app_id", "status");--> statement-breakpoint

ALTER TABLE "generated_app_gate_runs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "generated_app_gate_runs_select_policy" ON "generated_app_gate_runs" AS PERMISSIVE FOR SELECT TO "authenticated" USING (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "generated_app_gate_runs_insert_policy" ON "generated_app_gate_runs" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "generated_app_gate_runs_update_policy" ON "generated_app_gate_runs" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (tenant_id = get_tenant_id()) WITH CHECK (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "generated_app_gate_runs_delete_policy" ON "generated_app_gate_runs" AS PERMISSIVE FOR DELETE TO "authenticated" USING (tenant_id = get_tenant_id());--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "generated_app_gate_runs" TO "authenticated";
