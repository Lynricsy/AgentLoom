CREATE TYPE "public"."execution_status_enum" AS ENUM('pending', 'running', 'paused', 'completed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."step_status_enum" AS ENUM('pending', 'queued', 'running', 'waiting_intervention', 'completed', 'failed', 'skipped', 'cancelled');--> statement-breakpoint
CREATE TABLE "execution_steps" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"execution_id" uuid NOT NULL,
	"node_id" uuid NOT NULL,
	"step_order" integer NOT NULL,
	"status" "step_status_enum" DEFAULT 'pending' NOT NULL,
	"node_type" jsonb,
	"node_data" jsonb,
	"result" jsonb,
	"error_message" jsonb,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "execution_steps" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "workflow_executions" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"workflow_definition_id" uuid NOT NULL,
	"workflow_version_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"status" "execution_status_enum" DEFAULT 'pending' NOT NULL,
	"definition_snapshot" jsonb NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"error_message" jsonb,
	"total_steps" integer DEFAULT 0 NOT NULL,
	"completed_steps" integer DEFAULT 0 NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workflow_executions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "execution_steps" ADD CONSTRAINT "execution_steps_execution_id_workflow_executions_id_fk" FOREIGN KEY ("execution_id") REFERENCES "public"."workflow_executions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_executions" ADD CONSTRAINT "workflow_executions_workflow_definition_id_workflow_definitions_id_fk" FOREIGN KEY ("workflow_definition_id") REFERENCES "public"."workflow_definitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_executions" ADD CONSTRAINT "workflow_executions_workflow_version_id_workflow_versions_id_fk" FOREIGN KEY ("workflow_version_id") REFERENCES "public"."workflow_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_executions" ADD CONSTRAINT "workflow_executions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_execution_steps_execution_id" ON "execution_steps" USING btree ("execution_id");--> statement-breakpoint
CREATE INDEX "idx_execution_steps_status" ON "execution_steps" USING btree ("execution_id","status");--> statement-breakpoint
CREATE INDEX "idx_workflow_executions_tenant_id" ON "workflow_executions" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_workflow_executions_workflow_definition" ON "workflow_executions" USING btree ("workflow_definition_id");--> statement-breakpoint
CREATE INDEX "idx_workflow_executions_status" ON "workflow_executions" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "idx_workflow_executions_created_at" ON "workflow_executions" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE POLICY "execution_steps_select_policy" ON "execution_steps" AS PERMISSIVE FOR SELECT TO "authenticated" USING (EXISTS (
    SELECT 1 FROM "workflow_executions"
    WHERE "workflow_executions"."id" = "execution_steps"."execution_id"
    AND "workflow_executions".tenant_id = get_tenant_id()
  ));--> statement-breakpoint
CREATE POLICY "execution_steps_insert_policy" ON "execution_steps" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (EXISTS (
    SELECT 1 FROM "workflow_executions"
    WHERE "workflow_executions"."id" = "execution_steps"."execution_id"
    AND "workflow_executions".tenant_id = get_tenant_id()
  ));--> statement-breakpoint
CREATE POLICY "execution_steps_update_policy" ON "execution_steps" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (EXISTS (
    SELECT 1 FROM "workflow_executions"
    WHERE "workflow_executions"."id" = "execution_steps"."execution_id"
    AND "workflow_executions".tenant_id = get_tenant_id()
  )) WITH CHECK (EXISTS (
    SELECT 1 FROM "workflow_executions"
    WHERE "workflow_executions"."id" = "execution_steps"."execution_id"
    AND "workflow_executions".tenant_id = get_tenant_id()
  ));--> statement-breakpoint
CREATE POLICY "execution_steps_delete_policy" ON "execution_steps" AS PERMISSIVE FOR DELETE TO "authenticated" USING (EXISTS (
    SELECT 1 FROM "workflow_executions"
    WHERE "workflow_executions"."id" = "execution_steps"."execution_id"
    AND "workflow_executions".tenant_id = get_tenant_id()
  ));--> statement-breakpoint
CREATE POLICY "workflow_executions_select_policy" ON "workflow_executions" AS PERMISSIVE FOR SELECT TO "authenticated" USING (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "workflow_executions_insert_policy" ON "workflow_executions" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "workflow_executions_update_policy" ON "workflow_executions" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (tenant_id = get_tenant_id()) WITH CHECK (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "workflow_executions_delete_policy" ON "workflow_executions" AS PERMISSIVE FOR DELETE TO "authenticated" USING (tenant_id = get_tenant_id());