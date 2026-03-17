ALTER TABLE "plugin_earnings" ADD COLUMN "source_tenant_id" uuid;--> statement-breakpoint
ALTER TABLE "plugin_earnings" ADD COLUMN "source_org_id" uuid;--> statement-breakpoint
ALTER TABLE "plugin_earnings" ADD COLUMN "source_plugin_db_id" uuid;--> statement-breakpoint
ALTER TABLE "plugin_earnings" ADD COLUMN "source_plugin_id" varchar(255);--> statement-breakpoint
ALTER TABLE "plugin_earnings" ADD COLUMN "source_listing_id" uuid;--> statement-breakpoint
ALTER TABLE "plugin_usage_records" ADD COLUMN "source_tenant_id" uuid;--> statement-breakpoint
ALTER TABLE "plugin_usage_records" ADD COLUMN "source_org_id" uuid;--> statement-breakpoint
ALTER TABLE "plugin_usage_records" ADD COLUMN "source_plugin_db_id" uuid;--> statement-breakpoint
ALTER TABLE "plugin_usage_records" ADD COLUMN "source_plugin_id" varchar(255);--> statement-breakpoint
ALTER TABLE "plugin_usage_records" ADD COLUMN "source_listing_id" uuid;--> statement-breakpoint
CREATE INDEX "plugin_earnings_source_org_idx" ON "plugin_earnings" USING btree ("source_org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "plugin_earnings_plugin_period_uidx" ON "plugin_earnings" USING btree ("plugin_db_id","period_start","period_end");--> statement-breakpoint
CREATE INDEX "plugin_usage_records_source_plugin_idx" ON "plugin_usage_records" USING btree ("source_tenant_id","source_plugin_db_id");--> statement-breakpoint
CREATE INDEX "plugin_usage_records_source_org_created_at_idx" ON "plugin_usage_records" USING btree ("source_org_id","created_at");--> statement-breakpoint
ALTER TABLE "plugin_earnings" ADD CONSTRAINT "plugin_earnings_listing_commission_non_negative" CHECK ("plugin_earnings"."listing_commission" >= 0);