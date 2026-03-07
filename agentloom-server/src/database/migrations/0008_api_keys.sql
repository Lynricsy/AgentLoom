DO $$ BEGIN
  CREATE TYPE "api_key_status" AS ENUM('active', 'revoked', 'expired');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "llm_provider" AS ENUM('openai', 'anthropic', 'google', 'azure-openai', 'cohere', 'mistral', 'deepseek', 'groq');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE "api_keys" (
  "id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "organization_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "provider" "llm_provider" NOT NULL,
  "label" varchar(255) NOT NULL,
  "key_preview" varchar(10) NOT NULL,
  "encrypted_key" bytea,
  "encrypted_dek" bytea,
  "iv" bytea,
  "auth_tag" bytea,
  "status" "api_key_status" DEFAULT 'active' NOT NULL,
  "last_used_at" timestamp with time zone,
  "expires_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_api_keys_tenant_id" ON "api_keys" USING btree ("tenant_id");
--> statement-breakpoint
CREATE INDEX "idx_api_keys_organization_id" ON "api_keys" USING btree ("organization_id");
--> statement-breakpoint
CREATE INDEX "idx_api_keys_user_id" ON "api_keys" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX "idx_api_keys_status" ON "api_keys" USING btree ("status");
--> statement-breakpoint
CREATE INDEX "idx_api_keys_provider" ON "api_keys" USING btree ("provider");
--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE TRIGGER trg_api_keys_updated_at
  BEFORE UPDATE ON "api_keys"
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
ALTER TABLE "api_keys" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "api_keys" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "api_keys_select_policy" ON "api_keys" AS PERMISSIVE FOR SELECT TO "authenticated" USING (tenant_id = get_tenant_id());
--> statement-breakpoint
CREATE POLICY "api_keys_insert_policy" ON "api_keys" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (tenant_id = get_tenant_id());
--> statement-breakpoint
CREATE POLICY "api_keys_update_policy" ON "api_keys" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (tenant_id = get_tenant_id()) WITH CHECK (tenant_id = get_tenant_id());
--> statement-breakpoint
CREATE POLICY "api_keys_delete_policy" ON "api_keys" AS PERMISSIVE FOR DELETE TO "authenticated" USING (tenant_id = get_tenant_id());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "api_keys" TO "authenticated";
