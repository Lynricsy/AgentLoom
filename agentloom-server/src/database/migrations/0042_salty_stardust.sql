CREATE TYPE "public"."suggestion_status" AS ENUM('pending', 'applied', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."suggestion_type" AS ENUM('model_downgrade', 'timeout_adjustment', 'tool_pruning', 'autonomy_upgrade');--> statement-breakpoint
CREATE TABLE "optimization_suggestions" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"workflow_definition_id" uuid NOT NULL,
	"node_id" text NOT NULL,
	"suggestion_type" "suggestion_type" NOT NULL,
	"status" "suggestion_status" DEFAULT 'pending' NOT NULL,
	"confidence" real NOT NULL,
	"current_value" jsonb NOT NULL,
	"suggested_value" jsonb NOT NULL,
	"rationale" text NOT NULL,
	"impact_estimate" jsonb,
	"analysis_metadata" jsonb,
	"analysis_period_start" timestamp with time zone NOT NULL,
	"analysis_period_end" timestamp with time zone NOT NULL,
	"applied_at" timestamp with time zone,
	"applied_by_user_id" uuid,
	"dismissed_at" timestamp with time zone,
	"dismissed_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "optimization_suggestions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "idx_optimization_suggestions_tenant_id" ON "optimization_suggestions" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_optimization_suggestions_tenant_workflow" ON "optimization_suggestions" USING btree ("tenant_id","workflow_definition_id");--> statement-breakpoint
CREATE INDEX "idx_optimization_suggestions_tenant_workflow_node" ON "optimization_suggestions" USING btree ("tenant_id","workflow_definition_id","node_id");--> statement-breakpoint
CREATE INDEX "idx_optimization_suggestions_status" ON "optimization_suggestions" USING btree ("status");--> statement-breakpoint
CREATE POLICY "optimization_suggestions_select_policy" ON "optimization_suggestions" AS PERMISSIVE FOR SELECT TO "authenticated" USING (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "optimization_suggestions_insert_policy" ON "optimization_suggestions" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "optimization_suggestions_update_policy" ON "optimization_suggestions" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (tenant_id = get_tenant_id()) WITH CHECK (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "optimization_suggestions_delete_policy" ON "optimization_suggestions" AS PERMISSIVE FOR DELETE TO "authenticated" USING (tenant_id = get_tenant_id());--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "optimization_suggestions" TO "authenticated";
