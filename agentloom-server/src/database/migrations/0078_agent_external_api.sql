CREATE TYPE "public"."agent_api_run_status_enum" AS ENUM('queued', 'running', 'completed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."conversation_source_enum" AS ENUM('studio', 'api');--> statement-breakpoint
CREATE TABLE "agent_api_keys" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"agent_definition_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"key_hash" varchar(64) NOT NULL,
	"key_prefix" varchar(16) NOT NULL,
	"rate_limit_per_minute" integer,
	"max_concurrent_runs" integer DEFAULT 5 NOT NULL,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"last_used_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_api_keys" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "agent_api_runs" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"api_key_id" uuid NOT NULL,
	"user_message_id" uuid NOT NULL,
	"assistant_message_id" uuid,
	"agent_version_id" uuid,
	"status" "agent_api_run_status_enum" DEFAULT 'queued' NOT NULL,
	"stop_reason" varchar(32),
	"error" jsonb DEFAULT 'null'::jsonb,
	"idempotency_key" varchar(255),
	"request_hash" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "agent_api_runs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "agent_conversations" ALTER COLUMN "created_by" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_conversations" ADD COLUMN "source" "conversation_source_enum" DEFAULT 'studio' NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_conversations" ADD COLUMN "api_key_id" uuid;--> statement-breakpoint
ALTER TABLE "agent_conversations" ADD COLUMN "external_user_id" varchar(255);--> statement-breakpoint
ALTER TABLE "agent_api_keys" ADD CONSTRAINT "agent_api_keys_agent_definition_id_agent_definitions_id_fk" FOREIGN KEY ("agent_definition_id") REFERENCES "public"."agent_definitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_api_keys" ADD CONSTRAINT "agent_api_keys_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_api_runs" ADD CONSTRAINT "agent_api_runs_conversation_id_agent_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."agent_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_api_runs" ADD CONSTRAINT "agent_api_runs_api_key_id_agent_api_keys_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."agent_api_keys"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_api_runs" ADD CONSTRAINT "agent_api_runs_user_message_id_agent_messages_id_fk" FOREIGN KEY ("user_message_id") REFERENCES "public"."agent_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_api_runs" ADD CONSTRAINT "agent_api_runs_assistant_message_id_agent_messages_id_fk" FOREIGN KEY ("assistant_message_id") REFERENCES "public"."agent_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_agent_api_keys_hash" ON "agent_api_keys" USING btree ("key_hash");--> statement-breakpoint
CREATE INDEX "idx_agent_api_keys_agent_revoked" ON "agent_api_keys" USING btree ("agent_definition_id","revoked_at");--> statement-breakpoint
CREATE INDEX "idx_agent_api_keys_prefix" ON "agent_api_keys" USING btree ("key_prefix");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_agent_api_runs_user_message" ON "agent_api_runs" USING btree ("user_message_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_agent_api_runs_active_conversation" ON "agent_api_runs" USING btree ("conversation_id") WHERE "agent_api_runs"."status" in ('queued', 'running');--> statement-breakpoint
CREATE UNIQUE INDEX "uq_agent_api_runs_idempotency" ON "agent_api_runs" USING btree ("api_key_id","idempotency_key") WHERE "agent_api_runs"."idempotency_key" is not null;--> statement-breakpoint
CREATE INDEX "idx_agent_api_runs_key_status" ON "agent_api_runs" USING btree ("api_key_id","status");--> statement-breakpoint
CREATE INDEX "idx_agent_api_runs_conversation_created" ON "agent_api_runs" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_agent_api_runs_status_created" ON "agent_api_runs" USING btree ("status","created_at");--> statement-breakpoint
ALTER TABLE "agent_conversations" ADD CONSTRAINT "agent_conversations_api_key_id_agent_api_keys_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."agent_api_keys"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_agent_conversations_api_key_user_created" ON "agent_conversations" USING btree ("api_key_id","external_user_id","created_at");--> statement-breakpoint
ALTER TABLE "agent_conversations" ADD CONSTRAINT "chk_agent_conversations_source_actor" CHECK (("agent_conversations"."source" = 'studio' AND "agent_conversations"."created_by" IS NOT NULL) OR ("agent_conversations"."source" = 'api' AND "agent_conversations"."api_key_id" IS NOT NULL));--> statement-breakpoint
CREATE POLICY "agent_api_keys_select_policy" ON "agent_api_keys" AS PERMISSIVE FOR SELECT TO "authenticated" USING (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "agent_api_keys_insert_policy" ON "agent_api_keys" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "agent_api_keys_update_policy" ON "agent_api_keys" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (tenant_id = get_tenant_id()) WITH CHECK (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "agent_api_keys_delete_policy" ON "agent_api_keys" AS PERMISSIVE FOR DELETE TO "authenticated" USING (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "agent_api_runs_select_policy" ON "agent_api_runs" AS PERMISSIVE FOR SELECT TO "authenticated" USING (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "agent_api_runs_insert_policy" ON "agent_api_runs" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "agent_api_runs_update_policy" ON "agent_api_runs" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (tenant_id = get_tenant_id()) WITH CHECK (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "agent_api_runs_delete_policy" ON "agent_api_runs" AS PERMISSIVE FOR DELETE TO "authenticated" USING (tenant_id = get_tenant_id());--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "agent_api_keys" TO "authenticated";--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "agent_api_runs" TO "authenticated";