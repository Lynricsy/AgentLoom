CREATE TYPE "public"."team_member_status_enum" AS ENUM('idle', 'running', 'ended', 'failed');--> statement-breakpoint
CREATE TYPE "public"."team_message_delivery_status_enum" AS ENUM('pending', 'delivered', 'consumed', 'suppressed', 'expired');--> statement-breakpoint
CREATE TYPE "public"."team_message_kind_enum" AS ENUM('observation', 'request', 'reply', 'artifact', 'system');--> statement-breakpoint
CREATE TYPE "public"."team_run_status_enum" AS ENUM('running', 'completed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TABLE "decision_records" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"kind" varchar(64) NOT NULL,
	"subject_type" varchar(32) NOT NULL,
	"subject_id" uuid NOT NULL,
	"provider" varchar(16) NOT NULL,
	"model" varchar(64),
	"mode" varchar(16) NOT NULL,
	"definition_version" integer NOT NULL,
	"input_digest" char(64) NOT NULL,
	"outcome" jsonb,
	"confidence" real,
	"latency_ms" integer NOT NULL,
	"input_tokens" integer,
	"output_tokens" integer,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "decision_records" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "team_members" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"team_run_id" uuid NOT NULL,
	"role" varchar(64) NOT NULL,
	"agent_definition_id" uuid NOT NULL,
	"agent_version_id" uuid,
	"conversation_id" uuid NOT NULL,
	"is_lead" boolean DEFAULT false NOT NULL,
	"can_message" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"instructions" text,
	"status" "team_member_status_enum" DEFAULT 'idle' NOT NULL,
	"used_input_tokens" bigint DEFAULT 0 NOT NULL,
	"used_output_tokens" bigint DEFAULT 0 NOT NULL,
	"used_cost_usd" numeric(14, 6) DEFAULT 0 NOT NULL,
	"turn_count" integer DEFAULT 0 NOT NULL,
	"last_turn_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "team_members" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "team_messages" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"team_run_id" uuid NOT NULL,
	"sender_member_id" uuid,
	"recipient_member_id" uuid NOT NULL,
	"kind" "team_message_kind_enum" NOT NULL,
	"content" text NOT NULL,
	"refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"reply_to_message_id" uuid,
	"delivery_status" "team_message_delivery_status_enum" DEFAULT 'pending' NOT NULL,
	"agent_message_id" uuid,
	"decision_record_id" uuid,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"delivered_at" timestamp with time zone,
	"consumed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "team_messages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "team_runs" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"execution_id" uuid NOT NULL,
	"step_id" uuid NOT NULL,
	"node_id" text NOT NULL,
	"status" "team_run_status_enum" DEFAULT 'running' NOT NULL,
	"config" jsonb NOT NULL,
	"task_text" text NOT NULL,
	"context" jsonb,
	"budget_max_total_tokens" integer NOT NULL,
	"budget_max_messages" integer NOT NULL,
	"deadline_at" timestamp with time zone NOT NULL,
	"used_input_tokens" bigint DEFAULT 0 NOT NULL,
	"used_output_tokens" bigint DEFAULT 0 NOT NULL,
	"used_cost_usd" numeric(14, 6) DEFAULT 0 NOT NULL,
	"message_count" integer DEFAULT 0 NOT NULL,
	"nudge_count" integer DEFAULT 0 NOT NULL,
	"schema_invalid_count" integer DEFAULT 0 NOT NULL,
	"result" jsonb,
	"failure_reason" varchar(40),
	"failure_detail" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "team_runs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "agent_conversations" DROP CONSTRAINT "chk_agent_conversations_source_actor";--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_team_run_id_team_runs_id_fk" FOREIGN KEY ("team_run_id") REFERENCES "public"."team_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_agent_definition_id_agent_definitions_id_fk" FOREIGN KEY ("agent_definition_id") REFERENCES "public"."agent_definitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_conversation_id_agent_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."agent_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_messages" ADD CONSTRAINT "team_messages_team_run_id_team_runs_id_fk" FOREIGN KEY ("team_run_id") REFERENCES "public"."team_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_messages" ADD CONSTRAINT "team_messages_sender_member_id_team_members_id_fk" FOREIGN KEY ("sender_member_id") REFERENCES "public"."team_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_messages" ADD CONSTRAINT "team_messages_recipient_member_id_team_members_id_fk" FOREIGN KEY ("recipient_member_id") REFERENCES "public"."team_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_messages" ADD CONSTRAINT "team_messages_agent_message_id_agent_messages_id_fk" FOREIGN KEY ("agent_message_id") REFERENCES "public"."agent_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_runs" ADD CONSTRAINT "team_runs_execution_id_workflow_executions_id_fk" FOREIGN KEY ("execution_id") REFERENCES "public"."workflow_executions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_runs" ADD CONSTRAINT "team_runs_step_id_execution_steps_id_fk" FOREIGN KEY ("step_id") REFERENCES "public"."execution_steps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_decision_records_tenant_kind_created" ON "decision_records" USING btree ("tenant_id","kind","created_at");--> statement-breakpoint
CREATE INDEX "idx_decision_records_subject" ON "decision_records" USING btree ("subject_type","subject_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_team_members_conversation" ON "team_members" USING btree ("conversation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_team_members_run_role" ON "team_members" USING btree ("team_run_id","role");--> statement-breakpoint
CREATE INDEX "idx_team_members_agent_definition_id" ON "team_members" USING btree ("agent_definition_id");--> statement-breakpoint
CREATE INDEX "idx_team_messages_run_created" ON "team_messages" USING btree ("team_run_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_team_messages_recipient_status" ON "team_messages" USING btree ("recipient_member_id","delivery_status");--> statement-breakpoint
CREATE INDEX "idx_team_messages_pending" ON "team_messages" USING btree ("created_at") WHERE "team_messages"."delivery_status" = 'pending';--> statement-breakpoint
CREATE UNIQUE INDEX "uq_team_messages_agent_message" ON "team_messages" USING btree ("agent_message_id");--> statement-breakpoint
CREATE INDEX "idx_team_runs_execution_id" ON "team_runs" USING btree ("execution_id");--> statement-breakpoint
CREATE INDEX "idx_team_runs_tenant_status" ON "team_runs" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_team_runs_running_step" ON "team_runs" USING btree ("step_id") WHERE "team_runs"."status" = 'running';--> statement-breakpoint
ALTER TABLE "agent_conversations" ADD CONSTRAINT "chk_agent_conversations_source_actor" CHECK (("agent_conversations"."source" = 'studio' AND "agent_conversations"."created_by" IS NOT NULL) OR ("agent_conversations"."source" = 'api' AND "agent_conversations"."api_key_id" IS NOT NULL) OR ("agent_conversations"."source"::text = 'team'));--> statement-breakpoint
CREATE POLICY "decision_records_select_policy" ON "decision_records" AS PERMISSIVE FOR SELECT TO "authenticated" USING (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "decision_records_insert_policy" ON "decision_records" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "team_members_select_policy" ON "team_members" AS PERMISSIVE FOR SELECT TO "authenticated" USING (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "team_members_insert_policy" ON "team_members" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "team_members_update_policy" ON "team_members" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (tenant_id = get_tenant_id()) WITH CHECK (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "team_members_delete_policy" ON "team_members" AS PERMISSIVE FOR DELETE TO "authenticated" USING (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "team_messages_select_policy" ON "team_messages" AS PERMISSIVE FOR SELECT TO "authenticated" USING (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "team_messages_insert_policy" ON "team_messages" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "team_messages_update_policy" ON "team_messages" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (tenant_id = get_tenant_id()) WITH CHECK (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "team_messages_delete_policy" ON "team_messages" AS PERMISSIVE FOR DELETE TO "authenticated" USING (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "team_runs_select_policy" ON "team_runs" AS PERMISSIVE FOR SELECT TO "authenticated" USING (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "team_runs_insert_policy" ON "team_runs" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "team_runs_update_policy" ON "team_runs" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (tenant_id = get_tenant_id()) WITH CHECK (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "team_runs_delete_policy" ON "team_runs" AS PERMISSIVE FOR DELETE TO "authenticated" USING (tenant_id = get_tenant_id());--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "team_runs" TO "authenticated";--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "team_members" TO "authenticated";--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "team_messages" TO "authenticated";--> statement-breakpoint
GRANT SELECT, INSERT ON "decision_records" TO "authenticated";
