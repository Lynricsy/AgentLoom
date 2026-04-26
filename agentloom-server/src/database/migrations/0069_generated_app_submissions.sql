CREATE TYPE "public"."generated_app_submission_status" AS ENUM(
  'received',
  'running',
  'completed',
  'failed'
);--> statement-breakpoint

CREATE TABLE "generated_app_submissions" (
  "id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "generated_app_id" uuid NOT NULL,
  "app_spec_version" integer NOT NULL,
  "public_share_token" text NOT NULL,
  "anonymous_session_id" varchar(128) NOT NULL,
  "status" "generated_app_submission_status" DEFAULT 'received' NOT NULL,
  "input" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "result" jsonb,
  "report" jsonb,
  "error_message" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone
);--> statement-breakpoint

ALTER TABLE "generated_app_submissions" ADD CONSTRAINT "generated_app_submissions_generated_app_id_generated_apps_id_fk" FOREIGN KEY ("generated_app_id") REFERENCES "public"."generated_apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

CREATE INDEX "idx_generated_app_submissions_tenant_app_created" ON "generated_app_submissions" USING btree ("tenant_id", "generated_app_id", "created_at");--> statement-breakpoint
CREATE INDEX "idx_generated_app_submissions_app_deleted" ON "generated_app_submissions" USING btree ("generated_app_id", "deleted_at");--> statement-breakpoint
CREATE INDEX "idx_generated_app_submissions_anonymous_session" ON "generated_app_submissions" USING btree ("anonymous_session_id");--> statement-breakpoint

ALTER TABLE "generated_app_submissions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "generated_app_submissions_select_policy" ON "generated_app_submissions" AS PERMISSIVE FOR SELECT TO "authenticated" USING (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "generated_app_submissions_insert_policy" ON "generated_app_submissions" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "generated_app_submissions_update_policy" ON "generated_app_submissions" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (tenant_id = get_tenant_id()) WITH CHECK (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "generated_app_submissions_delete_policy" ON "generated_app_submissions" AS PERMISSIVE FOR DELETE TO "authenticated" USING (tenant_id = get_tenant_id());--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "generated_app_submissions" TO "authenticated";
