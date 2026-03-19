CREATE TABLE "acp_conversation_sessions" (
	"session_id" text PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"agent_id" text NOT NULL,
	"session_snapshot" jsonb NOT NULL,
	"replay_entries" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "acp_conversation_sessions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "idx_acp_conversation_sessions_tenant" ON "acp_conversation_sessions" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_acp_conversation_sessions_agent" ON "acp_conversation_sessions" USING btree ("agent_id");--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "acp_conversation_sessions" TO "authenticated";--> statement-breakpoint
CREATE POLICY "acp_conversation_sessions_select_policy" ON "acp_conversation_sessions" AS PERMISSIVE FOR SELECT TO "authenticated" USING (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "acp_conversation_sessions_insert_policy" ON "acp_conversation_sessions" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "acp_conversation_sessions_update_policy" ON "acp_conversation_sessions" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (tenant_id = get_tenant_id()) WITH CHECK (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "acp_conversation_sessions_delete_policy" ON "acp_conversation_sessions" AS PERMISSIVE FOR DELETE TO "authenticated" USING (tenant_id = get_tenant_id());
