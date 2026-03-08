CREATE TABLE "llm_model_configs" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"org_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"provider" varchar(30) NOT NULL,
	"model_name" varchar(100) NOT NULL,
	"parameters" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"api_key_id" uuid,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_llm_model_configs_org_name" UNIQUE("org_id","name")
);
--> statement-breakpoint
ALTER TABLE "llm_model_configs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "llm_model_configs" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "llm_model_configs" ADD CONSTRAINT "llm_model_configs_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "llm_model_configs" ADD CONSTRAINT "llm_model_configs_api_key_id_api_keys_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."api_keys"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_llm_model_configs_org_id" ON "llm_model_configs" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "idx_llm_model_configs_tenant_id" ON "llm_model_configs" USING btree ("tenant_id");--> statement-breakpoint
CREATE POLICY "llm_model_configs_select_policy" ON "llm_model_configs" AS PERMISSIVE FOR SELECT TO "authenticated" USING (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "llm_model_configs_insert_policy" ON "llm_model_configs" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "llm_model_configs_update_policy" ON "llm_model_configs" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (tenant_id = get_tenant_id()) WITH CHECK (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "llm_model_configs_delete_policy" ON "llm_model_configs" AS PERMISSIVE FOR DELETE TO "authenticated" USING (tenant_id = get_tenant_id());--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "llm_model_configs" TO "authenticated";
