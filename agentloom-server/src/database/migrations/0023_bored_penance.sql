CREATE TYPE "public"."evidence_source_type" AS ENUM('rag_retrieval', 'agent_decision', 'tool_output', 'user_input', 'intervention');--> statement-breakpoint
CREATE TABLE "evidence_records" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"execution_id" uuid NOT NULL,
	"step_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"source_type" "evidence_source_type" NOT NULL,
	"packet" jsonb NOT NULL,
	"content_hash" varchar(64) NOT NULL,
	"parent_evidence_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "evidence_records" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "evidence_records" ADD CONSTRAINT "evidence_records_execution_id_workflow_executions_id_fk" FOREIGN KEY ("execution_id") REFERENCES "public"."workflow_executions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_records" ADD CONSTRAINT "evidence_records_step_id_execution_steps_id_fk" FOREIGN KEY ("step_id") REFERENCES "public"."execution_steps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_records" ADD CONSTRAINT "evidence_records_parent_evidence_id_fkey" FOREIGN KEY ("parent_evidence_id") REFERENCES "public"."evidence_records"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_evidence_execution_step" ON "evidence_records" USING btree ("execution_id","step_id");--> statement-breakpoint
CREATE INDEX "idx_evidence_packet_gin" ON "evidence_records" USING gin ("packet");--> statement-breakpoint
CREATE INDEX "idx_evidence_parent" ON "evidence_records" USING btree ("parent_evidence_id");--> statement-breakpoint
CREATE POLICY "evidence_records_select_policy" ON "evidence_records" AS PERMISSIVE FOR SELECT TO "authenticated" USING (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "evidence_records_insert_policy" ON "evidence_records" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "evidence_records_update_policy" ON "evidence_records" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (tenant_id = get_tenant_id()) WITH CHECK (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "evidence_records_delete_policy" ON "evidence_records" AS PERMISSIVE FOR DELETE TO "authenticated" USING (tenant_id = get_tenant_id());