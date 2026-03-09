CREATE TYPE "public"."sandbox_session_status_enum" AS ENUM('creating', 'ready', 'busy', 'stopping', 'stopped', 'failed');--> statement-breakpoint
CREATE TABLE "sandbox_logs" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"session_id" uuid NOT NULL,
	"level" varchar(16) NOT NULL,
	"message" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sandbox_logs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "sandbox_sessions" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"execution_id" uuid NOT NULL,
	"sandbox_node_id" varchar(64) NOT NULL,
	"tenant_id" uuid NOT NULL,
	"container_id" varchar(128),
	"status" "sandbox_session_status_enum" DEFAULT 'creating' NOT NULL,
	"config" jsonb NOT NULL,
	"workspace_path" varchar(256),
	"started_at" timestamp with time zone,
	"stopped_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sandbox_sessions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "execution_steps" ALTER COLUMN "node_id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "execution_steps" ADD COLUMN "input" jsonb;--> statement-breakpoint
ALTER TABLE "sandbox_logs" ADD CONSTRAINT "sandbox_logs_session_id_sandbox_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sandbox_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sandbox_sessions" ADD CONSTRAINT "sandbox_sessions_execution_id_workflow_executions_id_fk" FOREIGN KEY ("execution_id") REFERENCES "public"."workflow_executions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_sandbox_sessions_execution_id" ON "sandbox_sessions" USING btree ("execution_id");--> statement-breakpoint
CREATE INDEX "idx_sandbox_sessions_tenant_status" ON "sandbox_sessions" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE POLICY "sandbox_logs_select_policy" ON "sandbox_logs" AS PERMISSIVE FOR SELECT TO "authenticated" USING (EXISTS (
    SELECT 1 FROM "sandbox_sessions"
    WHERE "sandbox_sessions"."id" = "sandbox_logs"."session_id"
    AND "sandbox_sessions".tenant_id = get_tenant_id()
  ));--> statement-breakpoint
CREATE POLICY "sandbox_logs_insert_policy" ON "sandbox_logs" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (EXISTS (
    SELECT 1 FROM "sandbox_sessions"
    WHERE "sandbox_sessions"."id" = "sandbox_logs"."session_id"
    AND "sandbox_sessions".tenant_id = get_tenant_id()
  ));--> statement-breakpoint
CREATE POLICY "sandbox_logs_update_policy" ON "sandbox_logs" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (EXISTS (
    SELECT 1 FROM "sandbox_sessions"
    WHERE "sandbox_sessions"."id" = "sandbox_logs"."session_id"
    AND "sandbox_sessions".tenant_id = get_tenant_id()
  )) WITH CHECK (EXISTS (
    SELECT 1 FROM "sandbox_sessions"
    WHERE "sandbox_sessions"."id" = "sandbox_logs"."session_id"
    AND "sandbox_sessions".tenant_id = get_tenant_id()
  ));--> statement-breakpoint
CREATE POLICY "sandbox_logs_delete_policy" ON "sandbox_logs" AS PERMISSIVE FOR DELETE TO "authenticated" USING (EXISTS (
    SELECT 1 FROM "sandbox_sessions"
    WHERE "sandbox_sessions"."id" = "sandbox_logs"."session_id"
    AND "sandbox_sessions".tenant_id = get_tenant_id()
  ));--> statement-breakpoint
CREATE POLICY "sandbox_sessions_select_policy" ON "sandbox_sessions" AS PERMISSIVE FOR SELECT TO "authenticated" USING (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "sandbox_sessions_insert_policy" ON "sandbox_sessions" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "sandbox_sessions_update_policy" ON "sandbox_sessions" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (tenant_id = get_tenant_id()) WITH CHECK (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "sandbox_sessions_delete_policy" ON "sandbox_sessions" AS PERMISSIVE FOR DELETE TO "authenticated" USING (tenant_id = get_tenant_id());