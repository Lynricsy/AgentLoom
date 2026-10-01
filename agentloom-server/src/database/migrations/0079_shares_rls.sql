ALTER TABLE "agent_shares" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "workflow_shares" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "agent_shares_select_policy" ON "agent_shares" AS PERMISSIVE FOR SELECT TO "authenticated" USING (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "agent_shares_insert_policy" ON "agent_shares" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "agent_shares_update_policy" ON "agent_shares" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (tenant_id = get_tenant_id()) WITH CHECK (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "agent_shares_delete_policy" ON "agent_shares" AS PERMISSIVE FOR DELETE TO "authenticated" USING (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "workflow_shares_select_policy" ON "workflow_shares" AS PERMISSIVE FOR SELECT TO "authenticated" USING (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "workflow_shares_insert_policy" ON "workflow_shares" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "workflow_shares_update_policy" ON "workflow_shares" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (tenant_id = get_tenant_id()) WITH CHECK (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "workflow_shares_delete_policy" ON "workflow_shares" AS PERMISSIVE FOR DELETE TO "authenticated" USING (tenant_id = get_tenant_id());--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "agent_shares" TO "authenticated";--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "workflow_shares" TO "authenticated";