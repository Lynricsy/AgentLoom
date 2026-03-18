CREATE TYPE "public"."audit_actor_type" AS ENUM('user', 'system', 'service');--> statement-breakpoint
CREATE TABLE "audit_log_archives" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"actor_id" uuid,
	"actor_type" "audit_actor_type" NOT NULL,
	"event_type" text NOT NULL,
	"resource_type" text NOT NULL,
	"resource_id" text NOT NULL,
	"execution_id" uuid,
	"summary" text NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_log_archives" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"actor_id" uuid,
	"actor_type" "audit_actor_type" NOT NULL,
	"event_type" text NOT NULL,
	"resource_type" text NOT NULL,
	"resource_id" text NOT NULL,
	"execution_id" uuid,
	"summary" text NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "audit_log_archives" ADD CONSTRAINT "audit_log_archives_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log_archives" ADD CONSTRAINT "audit_log_archives_execution_id_workflow_executions_id_fk" FOREIGN KEY ("execution_id") REFERENCES "public"."workflow_executions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_execution_id_workflow_executions_id_fk" FOREIGN KEY ("execution_id") REFERENCES "public"."workflow_executions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_audit_log_archives_tenant_created_at" ON "audit_log_archives" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_audit_log_archives_tenant_resource_created_at" ON "audit_log_archives" USING btree ("tenant_id","resource_type","resource_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_audit_log_archives_tenant_execution_created_at" ON "audit_log_archives" USING btree ("tenant_id","execution_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_audit_logs_tenant_created_at" ON "audit_logs" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_audit_logs_tenant_resource_created_at" ON "audit_logs" USING btree ("tenant_id","resource_type","resource_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_audit_logs_tenant_execution_created_at" ON "audit_logs" USING btree ("tenant_id","execution_id","created_at");--> statement-breakpoint
CREATE POLICY "audit_log_archives_select_policy" ON "audit_log_archives" AS PERMISSIVE FOR SELECT TO "authenticated" USING (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "audit_log_archives_insert_policy" ON "audit_log_archives" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "audit_logs_select_policy" ON "audit_logs" AS PERMISSIVE FOR SELECT TO "authenticated" USING (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "audit_logs_insert_policy" ON "audit_logs" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (tenant_id = get_tenant_id());
GRANT SELECT, INSERT ON "audit_log_archives" TO "authenticated";--> statement-breakpoint
GRANT SELECT, INSERT ON "audit_logs" TO "authenticated";
