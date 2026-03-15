CREATE TABLE IF NOT EXISTS "routing_decisions" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"execution_step_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"routing_node_id" text NOT NULL,
	"strategy" varchar(30) NOT NULL,
	"models_evaluated" jsonb NOT NULL,
	"selected_model_id" uuid NOT NULL,
	"decision_reasoning" text NOT NULL,
	"routing_latency_ms" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "routing_decisions" ADD CONSTRAINT "routing_decisions_execution_step_id_execution_steps_id_fk" FOREIGN KEY ("execution_step_id") REFERENCES "public"."execution_steps"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "routing_decisions" ADD CONSTRAINT "routing_decisions_selected_model_id_llm_model_configs_id_fk" FOREIGN KEY ("selected_model_id") REFERENCES "public"."llm_model_configs"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_routing_decisions_execution_step_id" ON "routing_decisions" USING btree ("execution_step_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_routing_decisions_tenant_id" ON "routing_decisions" USING btree ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_routing_decisions_selected_model_id" ON "routing_decisions" USING btree ("selected_model_id");
--> statement-breakpoint
ALTER TABLE "routing_decisions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "routing_decisions_select_policy" ON "routing_decisions" AS PERMISSIVE FOR SELECT TO "authenticated" USING (tenant_id = get_tenant_id());
--> statement-breakpoint
CREATE POLICY "routing_decisions_insert_policy" ON "routing_decisions" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (tenant_id = get_tenant_id());
--> statement-breakpoint
CREATE POLICY "routing_decisions_update_policy" ON "routing_decisions" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (tenant_id = get_tenant_id()) WITH CHECK (tenant_id = get_tenant_id());
--> statement-breakpoint
CREATE POLICY "routing_decisions_delete_policy" ON "routing_decisions" AS PERMISSIVE FOR DELETE TO "authenticated" USING (tenant_id = get_tenant_id());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "routing_decisions" TO "authenticated";
