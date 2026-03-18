CREATE TYPE "public"."evidence_export_job_status" AS ENUM('queued', 'running', 'completed', 'failed', 'expired');--> statement-breakpoint
CREATE TABLE "evidence_export_jobs" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"requested_by" uuid NOT NULL,
	"status" "evidence_export_job_status" DEFAULT 'queued' NOT NULL,
	"filters" jsonb NOT NULL,
	"storage_key" varchar(512),
	"artifact_format" varchar(32) NOT NULL,
	"file_name" varchar(255),
	"mime_type" varchar(255),
	"matched_execution_count" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "evidence_export_jobs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "evidence_export_jobs" ADD CONSTRAINT "evidence_export_jobs_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_evidence_export_jobs_tenant_status_requested_at" ON "evidence_export_jobs" USING btree ("tenant_id","status","requested_at");--> statement-breakpoint
CREATE INDEX "idx_evidence_export_jobs_tenant_expires_at" ON "evidence_export_jobs" USING btree ("tenant_id","expires_at");--> statement-breakpoint
CREATE INDEX "idx_evidence_export_jobs_tenant_requested_by" ON "evidence_export_jobs" USING btree ("tenant_id","requested_by","requested_at");--> statement-breakpoint
CREATE POLICY "evidence_export_jobs_select_policy" ON "evidence_export_jobs" AS PERMISSIVE FOR SELECT TO "authenticated" USING (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "evidence_export_jobs_insert_policy" ON "evidence_export_jobs" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "evidence_export_jobs_update_policy" ON "evidence_export_jobs" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (tenant_id = get_tenant_id()) WITH CHECK (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "evidence_export_jobs_delete_policy" ON "evidence_export_jobs" AS PERMISSIVE FOR DELETE TO "authenticated" USING (tenant_id = get_tenant_id());