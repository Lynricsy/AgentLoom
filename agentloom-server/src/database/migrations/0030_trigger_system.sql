DO $$ BEGIN
  CREATE TYPE "public"."trigger_type_enum" AS ENUM('cron', 'webhook', 'api_event');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."trigger_history_status_enum" AS ENUM('success', 'failed', 'skipped');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE "workflow_triggers" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"workflow_definition_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"type" "trigger_type_enum" NOT NULL,
	"config" jsonb NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"last_triggered_at" timestamp with time zone,
	"next_fire_at" timestamp with time zone,
	"trigger_count" integer DEFAULT 0 NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_trigger_history" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"trigger_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"status" "trigger_history_status_enum" NOT NULL,
	"execution_id" uuid,
	"error_message" text,
	"payload" jsonb,
	"triggered_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workflow_triggers" ADD CONSTRAINT "workflow_triggers_workflow_definition_id_workflow_definitions_id_fk" FOREIGN KEY ("workflow_definition_id") REFERENCES "public"."workflow_definitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_triggers" ADD CONSTRAINT "workflow_triggers_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_trigger_history" ADD CONSTRAINT "workflow_trigger_history_trigger_id_workflow_triggers_id_fk" FOREIGN KEY ("trigger_id") REFERENCES "public"."workflow_triggers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_workflow_triggers_workflow_id" ON "workflow_triggers" USING btree ("workflow_definition_id");--> statement-breakpoint
CREATE INDEX "idx_workflow_triggers_tenant_id" ON "workflow_triggers" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_workflow_triggers_type" ON "workflow_triggers" USING btree ("tenant_id", "type");--> statement-breakpoint
CREATE INDEX "idx_workflow_triggers_enabled" ON "workflow_triggers" USING btree ("tenant_id", "is_enabled");--> statement-breakpoint
CREATE INDEX "idx_trigger_history_trigger_id" ON "workflow_trigger_history" USING btree ("trigger_id");--> statement-breakpoint
CREATE INDEX "idx_trigger_history_tenant_id" ON "workflow_trigger_history" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_trigger_history_triggered_at" ON "workflow_trigger_history" USING btree ("trigger_id", "triggered_at");--> statement-breakpoint
CREATE TRIGGER trg_workflow_triggers_updated_at
	BEFORE UPDATE ON "workflow_triggers"
	FOR EACH ROW
	EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
ALTER TABLE "workflow_triggers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "workflow_triggers" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "workflow_triggers_select_policy" ON "workflow_triggers" AS PERMISSIVE FOR SELECT TO "authenticated" USING (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "workflow_triggers_insert_policy" ON "workflow_triggers" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "workflow_triggers_update_policy" ON "workflow_triggers" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (tenant_id = get_tenant_id()) WITH CHECK (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "workflow_triggers_delete_policy" ON "workflow_triggers" AS PERMISSIVE FOR DELETE TO "authenticated" USING (tenant_id = get_tenant_id());--> statement-breakpoint
GRANT ALL ON "workflow_triggers" TO "authenticated";--> statement-breakpoint
ALTER TABLE "workflow_trigger_history" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "workflow_trigger_history" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "workflow_trigger_history_select_policy" ON "workflow_trigger_history" AS PERMISSIVE FOR SELECT TO "authenticated" USING (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "workflow_trigger_history_insert_policy" ON "workflow_trigger_history" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "workflow_trigger_history_update_policy" ON "workflow_trigger_history" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (tenant_id = get_tenant_id()) WITH CHECK (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "workflow_trigger_history_delete_policy" ON "workflow_trigger_history" AS PERMISSIVE FOR DELETE TO "authenticated" USING (tenant_id = get_tenant_id());--> statement-breakpoint
GRANT ALL ON "workflow_trigger_history" TO "authenticated";
