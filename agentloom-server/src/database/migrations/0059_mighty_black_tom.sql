CREATE TABLE "user_preferences" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"user_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"title_model_config_id" uuid,
	"preferences" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_preferences" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_title_model_config_id_llm_model_configs_id_fk" FOREIGN KEY ("title_model_config_id") REFERENCES "public"."llm_model_configs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_user_preferences_user_tenant" ON "user_preferences" USING btree ("user_id","tenant_id");--> statement-breakpoint
CREATE INDEX "idx_user_preferences_tenant_id" ON "user_preferences" USING btree ("tenant_id");--> statement-breakpoint
CREATE POLICY "user_preferences_select_policy" ON "user_preferences" AS PERMISSIVE FOR SELECT TO "authenticated" USING (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "user_preferences_insert_policy" ON "user_preferences" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "user_preferences_update_policy" ON "user_preferences" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (tenant_id = get_tenant_id()) WITH CHECK (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "user_preferences_delete_policy" ON "user_preferences" AS PERMISSIVE FOR DELETE TO "authenticated" USING (tenant_id = get_tenant_id());