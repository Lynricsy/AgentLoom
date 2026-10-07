CREATE TYPE "public"."runtime_plugin_status" AS ENUM('registered', 'active', 'disabled');--> statement-breakpoint
CREATE TABLE "runtime_plugins" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"plugin_id" varchar(255) NOT NULL,
	"name" varchar(255) NOT NULL,
	"version" varchar(50) NOT NULL,
	"author" varchar(255) NOT NULL,
	"description" text,
	"license" varchar(100),
	"status" "runtime_plugin_status" DEFAULT 'registered' NOT NULL,
	"manifest" jsonb NOT NULL,
	"bundle_patch" text NOT NULL,
	"config_schema" jsonb,
	"storage_key" varchar(500) NOT NULL,
	"content_hash" varchar(64) NOT NULL,
	"signature" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"installed_by" uuid,
	"occ_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "runtime_plugins" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "runtime_plugins" ADD CONSTRAINT "runtime_plugins_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runtime_plugins" ADD CONSTRAINT "runtime_plugins_installed_by_users_id_fk" FOREIGN KEY ("installed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "runtime_plugins_org_plugin_id_version_idx" ON "runtime_plugins" USING btree ("org_id","plugin_id","version");--> statement-breakpoint
CREATE INDEX "runtime_plugins_tenant_status_idx" ON "runtime_plugins" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE POLICY "runtime_plugins_select_policy" ON "runtime_plugins" AS PERMISSIVE FOR SELECT TO "authenticated" USING (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "runtime_plugins_insert_policy" ON "runtime_plugins" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "runtime_plugins_update_policy" ON "runtime_plugins" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (tenant_id = get_tenant_id()) WITH CHECK (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "runtime_plugins_delete_policy" ON "runtime_plugins" AS PERMISSIVE FOR DELETE TO "authenticated" USING (tenant_id = get_tenant_id());--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "runtime_plugins" TO "authenticated";