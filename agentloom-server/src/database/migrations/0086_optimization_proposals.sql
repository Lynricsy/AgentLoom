CREATE TYPE "public"."optimization_evaluation_arm_enum" AS ENUM('baseline', 'candidate');--> statement-breakpoint
CREATE TYPE "public"."optimization_evaluation_run_status_enum" AS ENUM('running', 'completed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."optimization_evaluation_status_enum" AS ENUM('running', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."optimization_evaluation_verdict_enum" AS ENUM('improved', 'neutral', 'regressed');--> statement-breakpoint
CREATE TYPE "public"."optimization_proposal_status_enum" AS ENUM('proposed', 'evaluating', 'evaluated', 'published', 'rolled_back', 'dismissed', 'superseded');--> statement-breakpoint
CREATE TYPE "public"."optimization_proposal_type_enum" AS ENUM('team_budget_tokens', 'team_budget_messages', 'team_deadline', 'routing_fallback_model');--> statement-breakpoint
CREATE TABLE "optimization_evaluation_runs" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"evaluation_id" uuid NOT NULL,
	"arm" "optimization_evaluation_arm_enum" NOT NULL,
	"case_index" integer NOT NULL,
	"execution_id" uuid,
	"status" "optimization_evaluation_run_status_enum" DEFAULT 'running' NOT NULL,
	"metrics" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "optimization_evaluation_runs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "optimization_evaluations" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"proposal_id" uuid NOT NULL,
	"status" "optimization_evaluation_status_enum" DEFAULT 'running' NOT NULL,
	"base_version_id" uuid NOT NULL,
	"candidate_version_id" uuid NOT NULL,
	"cases" jsonb NOT NULL,
	"summary" jsonb,
	"failure_reason" varchar(40),
	"deadline_at" timestamp with time zone NOT NULL,
	"started_by_user_id" uuid NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "optimization_evaluations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "optimization_proposals" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"workflow_definition_id" uuid NOT NULL,
	"node_id" text NOT NULL,
	"node_type" varchar(40) NOT NULL,
	"proposal_type" "optimization_proposal_type_enum" NOT NULL,
	"status" "optimization_proposal_status_enum" DEFAULT 'proposed' NOT NULL,
	"config_path" text NOT NULL,
	"current_value" jsonb,
	"proposed_value" jsonb NOT NULL,
	"rationale" text NOT NULL,
	"evidence" jsonb NOT NULL,
	"base_version_id" uuid NOT NULL,
	"candidate_version_id" uuid,
	"published_version_id" uuid,
	"current_evaluation_id" uuid,
	"verdict" "optimization_evaluation_verdict_enum",
	"publish_report" jsonb,
	"evaluated_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"published_by_user_id" uuid,
	"rolled_back_at" timestamp with time zone,
	"rolled_back_by_user_id" uuid,
	"dismissed_at" timestamp with time zone,
	"dismissed_by_user_id" uuid,
	"superseded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "optimization_proposals" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY "optimization_suggestions_select_policy" ON "optimization_suggestions" CASCADE;--> statement-breakpoint
DROP POLICY "optimization_suggestions_insert_policy" ON "optimization_suggestions" CASCADE;--> statement-breakpoint
DROP POLICY "optimization_suggestions_update_policy" ON "optimization_suggestions" CASCADE;--> statement-breakpoint
DROP POLICY "optimization_suggestions_delete_policy" ON "optimization_suggestions" CASCADE;--> statement-breakpoint
DROP TABLE "optimization_suggestions" CASCADE;--> statement-breakpoint
ALTER TABLE "optimization_evaluation_runs" ADD CONSTRAINT "optimization_evaluation_runs_evaluation_id_optimization_evaluations_id_fk" FOREIGN KEY ("evaluation_id") REFERENCES "public"."optimization_evaluations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "optimization_evaluation_runs" ADD CONSTRAINT "optimization_evaluation_runs_execution_id_workflow_executions_id_fk" FOREIGN KEY ("execution_id") REFERENCES "public"."workflow_executions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "optimization_evaluations" ADD CONSTRAINT "optimization_evaluations_proposal_id_optimization_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."optimization_proposals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "optimization_proposals" ADD CONSTRAINT "optimization_proposals_workflow_definition_id_workflow_definitions_id_fk" FOREIGN KEY ("workflow_definition_id") REFERENCES "public"."workflow_definitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "optimization_proposals" ADD CONSTRAINT "optimization_proposals_base_version_id_workflow_versions_id_fk" FOREIGN KEY ("base_version_id") REFERENCES "public"."workflow_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "optimization_proposals" ADD CONSTRAINT "optimization_proposals_candidate_version_id_workflow_versions_id_fk" FOREIGN KEY ("candidate_version_id") REFERENCES "public"."workflow_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_optimization_evaluation_runs_case" ON "optimization_evaluation_runs" USING btree ("evaluation_id","arm","case_index");--> statement-breakpoint
CREATE INDEX "idx_optimization_evaluation_runs_execution_id" ON "optimization_evaluation_runs" USING btree ("execution_id");--> statement-breakpoint
CREATE INDEX "idx_optimization_evaluation_runs_tenant_status" ON "optimization_evaluation_runs" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "idx_optimization_evaluations_tenant_status" ON "optimization_evaluations" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "idx_optimization_evaluations_proposal_id" ON "optimization_evaluations" USING btree ("proposal_id");--> statement-breakpoint
CREATE INDEX "idx_optimization_proposals_tenant_status" ON "optimization_proposals" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "idx_optimization_proposals_workflow_node" ON "optimization_proposals" USING btree ("workflow_definition_id","node_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_optimization_proposals_active" ON "optimization_proposals" USING btree ("workflow_definition_id","node_id","proposal_type") WHERE "optimization_proposals"."status" IN ('proposed', 'evaluating', 'evaluated');--> statement-breakpoint
CREATE POLICY "optimization_evaluation_runs_select_policy" ON "optimization_evaluation_runs" AS PERMISSIVE FOR SELECT TO "authenticated" USING (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "optimization_evaluation_runs_insert_policy" ON "optimization_evaluation_runs" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "optimization_evaluation_runs_update_policy" ON "optimization_evaluation_runs" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (tenant_id = get_tenant_id()) WITH CHECK (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "optimization_evaluation_runs_delete_policy" ON "optimization_evaluation_runs" AS PERMISSIVE FOR DELETE TO "authenticated" USING (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "optimization_evaluations_select_policy" ON "optimization_evaluations" AS PERMISSIVE FOR SELECT TO "authenticated" USING (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "optimization_evaluations_insert_policy" ON "optimization_evaluations" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "optimization_evaluations_update_policy" ON "optimization_evaluations" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (tenant_id = get_tenant_id()) WITH CHECK (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "optimization_evaluations_delete_policy" ON "optimization_evaluations" AS PERMISSIVE FOR DELETE TO "authenticated" USING (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "optimization_proposals_select_policy" ON "optimization_proposals" AS PERMISSIVE FOR SELECT TO "authenticated" USING (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "optimization_proposals_insert_policy" ON "optimization_proposals" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "optimization_proposals_update_policy" ON "optimization_proposals" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (tenant_id = get_tenant_id()) WITH CHECK (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "optimization_proposals_delete_policy" ON "optimization_proposals" AS PERMISSIVE FOR DELETE TO "authenticated" USING (tenant_id = get_tenant_id());--> statement-breakpoint
DROP TYPE "public"."suggestion_status";--> statement-breakpoint
DROP TYPE "public"."suggestion_type";--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "optimization_proposals" TO "authenticated";--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "optimization_evaluations" TO "authenticated";--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "optimization_evaluation_runs" TO "authenticated";