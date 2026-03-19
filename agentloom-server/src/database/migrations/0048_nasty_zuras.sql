CREATE TYPE "public"."private_cloud_auth_method" AS ENUM('none', 'api_key');--> statement-breakpoint
CREATE TYPE "public"."private_deployment_certificate_source" AS ENUM('none', 'uploaded', 'tls_secret_ref');--> statement-breakpoint
CREATE TABLE "private_deployment_settings" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"organization_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"smtp_host" varchar(255),
	"smtp_port" integer,
	"smtp_username" varchar(255),
	"smtp_from_email" varchar(320),
	"smtp_use_tls" boolean DEFAULT false NOT NULL,
	"smtp_password_encrypted_key" "bytea",
	"smtp_password_encrypted_dek" "bytea",
	"smtp_password_iv" "bytea",
	"smtp_password_auth_tag" "bytea",
	"private_cloud_endpoint_url" varchar(512),
	"private_cloud_auth_method" "private_cloud_auth_method" DEFAULT 'none' NOT NULL,
	"private_cloud_allow_external_egress" boolean DEFAULT false NOT NULL,
	"private_cloud_api_key_encrypted_key" "bytea",
	"private_cloud_api_key_encrypted_dek" "bytea",
	"private_cloud_api_key_iv" "bytea",
	"private_cloud_api_key_auth_tag" "bytea",
	"certificate_source" "private_deployment_certificate_source" DEFAULT 'none' NOT NULL,
	"certificate_tls_secret_ref" varchar(255),
	"certificate_expires_at" timestamp with time zone,
	"certificate_pem_encrypted_key" "bytea",
	"certificate_pem_encrypted_dek" "bytea",
	"certificate_pem_iv" "bytea",
	"certificate_pem_auth_tag" "bytea",
	"certificate_private_key_encrypted_key" "bytea",
	"certificate_private_key_encrypted_dek" "bytea",
	"certificate_private_key_iv" "bytea",
	"certificate_private_key_auth_tag" "bytea",
	"license_key_encrypted_key" "bytea",
	"license_key_encrypted_dek" "bytea",
	"license_key_iv" "bytea",
	"license_key_auth_tag" "bytea",
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" uuid NOT NULL,
	"updated_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "private_deployment_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "private_deployment_settings" ADD CONSTRAINT "private_deployment_settings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "private_deployment_settings" ADD CONSTRAINT "private_deployment_settings_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "private_deployment_settings" ADD CONSTRAINT "private_deployment_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_private_deployment_settings_org" ON "private_deployment_settings" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_private_deployment_settings_tenant" ON "private_deployment_settings" USING btree ("tenant_id");--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "private_deployment_settings" TO "authenticated";--> statement-breakpoint
CREATE POLICY "private_deployment_settings_select_policy" ON "private_deployment_settings" AS PERMISSIVE FOR SELECT TO "authenticated" USING (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "private_deployment_settings_insert_policy" ON "private_deployment_settings" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "private_deployment_settings_update_policy" ON "private_deployment_settings" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (tenant_id = get_tenant_id()) WITH CHECK (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "private_deployment_settings_delete_policy" ON "private_deployment_settings" AS PERMISSIVE FOR DELETE TO "authenticated" USING (tenant_id = get_tenant_id());
