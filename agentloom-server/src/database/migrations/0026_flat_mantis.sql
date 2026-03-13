ALTER TABLE "mcp_server_configs" ADD COLUMN "connection_fingerprint" text;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_mcp_server_configs_tenant_fingerprint" ON "mcp_server_configs" USING btree ("tenant_id","connection_fingerprint");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_tool_definitions_active_mcp_identity" ON "tool_definitions" USING btree ("tenant_id","mcp_server_config_id","name") WHERE ("source" = 'mcp' AND "is_active" = true);
