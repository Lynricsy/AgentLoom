ALTER TYPE "public"."suggestion_status" ADD VALUE 'blocked';--> statement-breakpoint
CREATE TABLE "organization_autonomy_policies" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"organization_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"autonomy_cap" varchar(32) DEFAULT 'LLM_SUGGEST' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" uuid NOT NULL,
	"updated_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organization_autonomy_policies" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "organization_autonomy_policies" ADD CONSTRAINT "organization_autonomy_policies_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_autonomy_policies" ADD CONSTRAINT "organization_autonomy_policies_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_autonomy_policies" ADD CONSTRAINT "organization_autonomy_policies_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_organization_autonomy_policies_org" ON "organization_autonomy_policies" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_organization_autonomy_policies_tenant" ON "organization_autonomy_policies" USING btree ("tenant_id");--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "organization_autonomy_policies" TO "authenticated";--> statement-breakpoint
CREATE POLICY "organization_autonomy_policies_select_policy" ON "organization_autonomy_policies" AS PERMISSIVE FOR SELECT TO "authenticated" USING (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "organization_autonomy_policies_insert_policy" ON "organization_autonomy_policies" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "organization_autonomy_policies_update_policy" ON "organization_autonomy_policies" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (tenant_id = get_tenant_id()) WITH CHECK (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "organization_autonomy_policies_delete_policy" ON "organization_autonomy_policies" AS PERMISSIVE FOR DELETE TO "authenticated" USING (tenant_id = get_tenant_id());
