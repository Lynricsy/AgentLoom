CREATE TYPE "public"."generated_app_generation_run_status" AS ENUM(
  'queued',
  'running',
  'repairing',
  'passed',
  'failed',
  'cancelled'
);--> statement-breakpoint

CREATE TYPE "public"."generated_app_generation_run_trigger" AS ENUM(
  'initial',
  'manual',
  'retry',
  'system'
);--> statement-breakpoint

CREATE TYPE "public"."generated_app_repair_attempt_status" AS ENUM(
  'planned',
  'running',
  'completed',
  'failed',
  'skipped'
);--> statement-breakpoint

CREATE TABLE "generated_app_generation_runs" (
  "id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "generated_app_id" uuid NOT NULL,
  "run_number" integer DEFAULT 1 NOT NULL,
  "status" "generated_app_generation_run_status" DEFAULT 'running' NOT NULL,
  "trigger_source" "generated_app_generation_run_trigger" DEFAULT 'manual' NOT NULL,
  "max_repair_attempts" integer DEFAULT 3 NOT NULL,
  "max_runtime_seconds" integer DEFAULT 1800 NOT NULL,
  "summary" text NOT NULL,
  "failure_reason" text,
  "started_at" timestamp with time zone DEFAULT now() NOT NULL,
  "completed_at" timestamp with time zone,
  "created_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE TABLE "generated_app_repair_attempts" (
  "id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "generated_app_id" uuid NOT NULL,
  "generation_run_id" uuid NOT NULL,
  "attempt_number" integer DEFAULT 1 NOT NULL,
  "target_gate_id" varchar(64) NOT NULL,
  "status" "generated_app_repair_attempt_status" DEFAULT 'running' NOT NULL,
  "failure_summary" text NOT NULL,
  "change_summary" text,
  "verification_summary" text,
  "started_at" timestamp with time zone DEFAULT now() NOT NULL,
  "completed_at" timestamp with time zone,
  "created_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

ALTER TABLE "generated_app_generation_runs" ADD CONSTRAINT "generated_app_generation_runs_generated_app_id_generated_apps_id_fk" FOREIGN KEY ("generated_app_id") REFERENCES "public"."generated_apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generated_app_generation_runs" ADD CONSTRAINT "generated_app_generation_runs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generated_app_repair_attempts" ADD CONSTRAINT "generated_app_repair_attempts_generated_app_id_generated_apps_id_fk" FOREIGN KEY ("generated_app_id") REFERENCES "public"."generated_apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generated_app_repair_attempts" ADD CONSTRAINT "generated_app_repair_attempts_generation_run_id_generation_runs_id_fk" FOREIGN KEY ("generation_run_id") REFERENCES "public"."generated_app_generation_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generated_app_repair_attempts" ADD CONSTRAINT "generated_app_repair_attempts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "generated_app_gate_runs" ADD COLUMN "generation_run_id" uuid;--> statement-breakpoint
ALTER TABLE "generated_app_gate_runs" ADD COLUMN "repair_attempt_id" uuid;--> statement-breakpoint
ALTER TABLE "generated_app_gate_runs" ADD CONSTRAINT "generated_app_gate_runs_generation_run_id_generation_runs_id_fk" FOREIGN KEY ("generation_run_id") REFERENCES "public"."generated_app_generation_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generated_app_gate_runs" ADD CONSTRAINT "generated_app_gate_runs_repair_attempt_id_repair_attempts_id_fk" FOREIGN KEY ("repair_attempt_id") REFERENCES "public"."generated_app_repair_attempts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint

CREATE INDEX "idx_generated_app_generation_runs_tenant_app_created" ON "generated_app_generation_runs" USING btree ("tenant_id", "generated_app_id", "created_at");--> statement-breakpoint
CREATE INDEX "idx_generated_app_generation_runs_tenant_app_status" ON "generated_app_generation_runs" USING btree ("tenant_id", "generated_app_id", "status");--> statement-breakpoint
CREATE INDEX "idx_generated_app_generation_runs_tenant_app_run_number" ON "generated_app_generation_runs" USING btree ("tenant_id", "generated_app_id", "run_number");--> statement-breakpoint
CREATE INDEX "idx_generated_app_repair_attempts_tenant_app_run" ON "generated_app_repair_attempts" USING btree ("tenant_id", "generated_app_id", "generation_run_id");--> statement-breakpoint
CREATE INDEX "idx_generated_app_repair_attempts_tenant_app_gate" ON "generated_app_repair_attempts" USING btree ("tenant_id", "generated_app_id", "target_gate_id");--> statement-breakpoint
CREATE INDEX "idx_generated_app_repair_attempts_tenant_app_status" ON "generated_app_repair_attempts" USING btree ("tenant_id", "generated_app_id", "status");--> statement-breakpoint
CREATE INDEX "idx_generated_app_gate_runs_generation_run" ON "generated_app_gate_runs" USING btree ("tenant_id", "generation_run_id");--> statement-breakpoint
CREATE INDEX "idx_generated_app_gate_runs_repair_attempt" ON "generated_app_gate_runs" USING btree ("tenant_id", "repair_attempt_id");--> statement-breakpoint

ALTER TABLE "generated_app_generation_runs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "generated_app_generation_runs_select_policy" ON "generated_app_generation_runs" AS PERMISSIVE FOR SELECT TO "authenticated" USING (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "generated_app_generation_runs_insert_policy" ON "generated_app_generation_runs" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "generated_app_generation_runs_update_policy" ON "generated_app_generation_runs" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (tenant_id = get_tenant_id()) WITH CHECK (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "generated_app_generation_runs_delete_policy" ON "generated_app_generation_runs" AS PERMISSIVE FOR DELETE TO "authenticated" USING (tenant_id = get_tenant_id());--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "generated_app_generation_runs" TO "authenticated";--> statement-breakpoint

ALTER TABLE "generated_app_repair_attempts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "generated_app_repair_attempts_select_policy" ON "generated_app_repair_attempts" AS PERMISSIVE FOR SELECT TO "authenticated" USING (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "generated_app_repair_attempts_insert_policy" ON "generated_app_repair_attempts" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "generated_app_repair_attempts_update_policy" ON "generated_app_repair_attempts" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (tenant_id = get_tenant_id()) WITH CHECK (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "generated_app_repair_attempts_delete_policy" ON "generated_app_repair_attempts" AS PERMISSIVE FOR DELETE TO "authenticated" USING (tenant_id = get_tenant_id());--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "generated_app_repair_attempts" TO "authenticated";
