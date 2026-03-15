CREATE TABLE "intervention_policies" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"workflow_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"node_id" varchar(255),
	"allowed_roles" text[] DEFAULT '{"owner","admin"}'::text[] NOT NULL,
	"timeout_seconds" integer DEFAULT 86400 NOT NULL,
	"timeout_action" varchar(20) DEFAULT 'reject' NOT NULL,
	"escalate_to_role" varchar(50),
	"notify_channels" text[] DEFAULT '{"in_app"}'::text[] NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "intervention_policies" ADD CONSTRAINT "intervention_policies_allowed_roles_check" CHECK (cardinality("allowed_roles") > 0 AND "allowed_roles" <@ ARRAY['owner', 'admin', 'creator', 'operator', 'viewer']::text[]);--> statement-breakpoint
ALTER TABLE "intervention_policies" ADD CONSTRAINT "intervention_policies_timeout_seconds_check" CHECK ("timeout_seconds" BETWEEN 300 AND 604800);--> statement-breakpoint
ALTER TABLE "intervention_policies" ADD CONSTRAINT "intervention_policies_timeout_action_check" CHECK ("timeout_action" IN ('approve', 'reject', 'escalate'));--> statement-breakpoint
ALTER TABLE "intervention_policies" ADD CONSTRAINT "intervention_policies_escalate_to_role_check" CHECK (("escalate_to_role" IS NULL OR "escalate_to_role" IN ('owner', 'admin', 'creator', 'operator', 'viewer')) AND ("timeout_action" <> 'escalate' OR "escalate_to_role" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "intervention_policies" ADD CONSTRAINT "intervention_policies_notify_channels_check" CHECK (cardinality("notify_channels") > 0 AND "notify_channels" <@ ARRAY['in_app', 'email', 'push']::text[]);--> statement-breakpoint
ALTER TABLE "intervention_policies" ADD CONSTRAINT "intervention_policies_workflow_id_workflow_definitions_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflow_definitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intervention_policies" ADD CONSTRAINT "intervention_policies_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_intervention_policies_workflow_node" ON "intervention_policies" USING btree ("workflow_id", COALESCE("node_id", '__workflow_level__'));--> statement-breakpoint
CREATE INDEX "idx_intervention_policies_workflow" ON "intervention_policies" USING btree ("workflow_id");--> statement-breakpoint
CREATE INDEX "idx_intervention_policies_tenant" ON "intervention_policies" USING btree ("tenant_id");--> statement-breakpoint
CREATE TRIGGER trg_intervention_policies_updated_at
	BEFORE UPDATE ON "intervention_policies"
	FOR EACH ROW
	EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
ALTER TABLE "intervention_policies" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "intervention_policies" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "intervention_policies_select_policy" ON "intervention_policies" AS PERMISSIVE FOR SELECT TO "authenticated" USING (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "intervention_policies_insert_policy" ON "intervention_policies" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "intervention_policies_update_policy" ON "intervention_policies" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (tenant_id = get_tenant_id()) WITH CHECK (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "intervention_policies_delete_policy" ON "intervention_policies" AS PERMISSIVE FOR DELETE TO "authenticated" USING (tenant_id = get_tenant_id());--> statement-breakpoint
GRANT ALL ON "intervention_policies" TO "authenticated";
