CREATE TYPE "public"."plugin_status" AS ENUM('registered', 'active', 'disabled', 'error');

CREATE TABLE IF NOT EXISTS "plugins" (
  "id" uuid PRIMARY KEY DEFAULT uuid_generate_v7(),
  "tenant_id" uuid NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "plugin_id" varchar(255) NOT NULL,
  "name" varchar(255) NOT NULL,
  "version" varchar(50) NOT NULL,
  "author" varchar(255) NOT NULL,
  "description" text,
  "license" varchar(100),
  "status" "plugin_status" NOT NULL DEFAULT 'registered',
  "manifest" jsonb NOT NULL,
  "node_definitions" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "storage_key" varchar(500),
  "permissions" text[] NOT NULL DEFAULT '{}'::text[],
  "installed_by" uuid REFERENCES "users"("id"),
  "metadata" jsonb,
  "occ_version" integer NOT NULL DEFAULT 1,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX "plugins_org_plugin_id_idx" ON "plugins" ("org_id", "plugin_id");
CREATE INDEX "plugins_tenant_status_idx" ON "plugins" ("tenant_id", "status");
CREATE INDEX "plugins_installed_by_idx" ON "plugins" ("installed_by");

ALTER TABLE "plugins" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "plugins_select_policy" ON "plugins" AS PERMISSIVE FOR SELECT TO "authenticated" USING (tenant_id = get_tenant_id());
CREATE POLICY "plugins_insert_policy" ON "plugins" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (tenant_id = get_tenant_id());
CREATE POLICY "plugins_update_policy" ON "plugins" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (tenant_id = get_tenant_id()) WITH CHECK (tenant_id = get_tenant_id());
CREATE POLICY "plugins_delete_policy" ON "plugins" AS PERMISSIVE FOR DELETE TO "authenticated" USING (tenant_id = get_tenant_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON "plugins" TO "authenticated";
