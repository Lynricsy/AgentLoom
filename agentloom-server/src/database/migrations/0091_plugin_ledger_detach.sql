ALTER TABLE "plugin_earnings" DROP CONSTRAINT "plugin_earnings_plugin_db_id_plugins_id_fk";
--> statement-breakpoint
ALTER TABLE "plugin_usage_records" DROP CONSTRAINT "plugin_usage_records_plugin_db_id_plugins_id_fk";
--> statement-breakpoint
DROP POLICY "plugin_usage_records_update_policy" ON "plugin_usage_records" CASCADE;--> statement-breakpoint
DROP POLICY "plugin_usage_records_delete_policy" ON "plugin_usage_records" CASCADE;