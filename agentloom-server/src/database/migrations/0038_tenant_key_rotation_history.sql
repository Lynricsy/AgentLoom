ALTER TABLE "tenant_encryption_keys" DROP CONSTRAINT "uq_tenant_encryption_keys_org_id";--> statement-breakpoint
CREATE UNIQUE INDEX "uq_tenant_encryption_keys_org_fingerprint" ON "tenant_encryption_keys" USING btree ("organization_id", "key_fingerprint");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_tenant_encryption_keys_org_active" ON "tenant_encryption_keys" USING btree ("organization_id") WHERE "status" = 'active';
