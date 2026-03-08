ALTER TABLE "api_keys" ADD COLUMN "is_default" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
CREATE INDEX "idx_api_keys_org_default" ON "api_keys" USING btree ("organization_id","is_default");
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_api_keys_org_provider_default_active" ON "api_keys" USING btree ("organization_id","provider") WHERE ("is_default" = true AND "status" = 'active');
