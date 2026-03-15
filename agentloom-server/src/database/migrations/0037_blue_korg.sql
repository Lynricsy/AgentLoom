CREATE TYPE "public"."encryption_key_status" AS ENUM('active', 'rotating', 'revoked');--> statement-breakpoint
CREATE TABLE "tenant_encryption_keys" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"organization_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"public_key" text NOT NULL,
	"key_fingerprint" varchar(64) NOT NULL,
	"status" "encryption_key_status" DEFAULT 'active' NOT NULL,
	"activated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"rotated_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_tenant_encryption_keys_org_id" UNIQUE("organization_id")
);
--> statement-breakpoint
ALTER TABLE "tenant_encryption_keys" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "evidence_records" ADD COLUMN "is_encrypted" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "evidence_records" ADD COLUMN "encryption_metadata" jsonb;--> statement-breakpoint
ALTER TABLE "execution_steps" ADD COLUMN "is_encrypted" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tenant_encryption_keys" ADD CONSTRAINT "tenant_encryption_keys_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_tenant_encryption_keys_tenant_id" ON "tenant_encryption_keys" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_tenant_encryption_keys_fingerprint" ON "tenant_encryption_keys" USING btree ("key_fingerprint");--> statement-breakpoint
CREATE INDEX "idx_tenant_encryption_keys_status" ON "tenant_encryption_keys" USING btree ("status");--> statement-breakpoint
CREATE POLICY "tenant_encryption_keys_select_policy" ON "tenant_encryption_keys" AS PERMISSIVE FOR SELECT TO "authenticated" USING (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "tenant_encryption_keys_insert_policy" ON "tenant_encryption_keys" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "tenant_encryption_keys_update_policy" ON "tenant_encryption_keys" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (tenant_id = get_tenant_id()) WITH CHECK (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "tenant_encryption_keys_delete_policy" ON "tenant_encryption_keys" AS PERMISSIVE FOR DELETE TO "authenticated" USING (tenant_id = get_tenant_id());