CREATE TABLE IF NOT EXISTS "plugin_usage_records" (
  "id" uuid PRIMARY KEY DEFAULT uuid_generate_v7(),
  "tenant_id" uuid NOT NULL,
  "plugin_db_id" uuid NOT NULL REFERENCES "plugins"("id") ON DELETE CASCADE,
  "plugin_id" varchar(255) NOT NULL,
  "execution_id" uuid NOT NULL,
  "step_id" uuid,
  "executed_by" uuid REFERENCES "users"("id"),
  "billing_amount" numeric(18, 8),
  "currency" varchar(10) DEFAULT 'USD',
  "execution_duration_ms" numeric(12, 0),
  "input_tokens" numeric(12, 0),
  "output_tokens" numeric(12, 0),
  "metadata" jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "plugin_usage_records_tenant_plugin_idx" ON "plugin_usage_records" ("tenant_id", "plugin_db_id");
CREATE INDEX IF NOT EXISTS "plugin_usage_records_execution_idx" ON "plugin_usage_records" ("execution_id");
CREATE INDEX IF NOT EXISTS "plugin_usage_records_created_at_idx" ON "plugin_usage_records" ("created_at");
CREATE INDEX IF NOT EXISTS "plugin_usage_records_plugin_id_idx" ON "plugin_usage_records" ("plugin_id");

ALTER TABLE "plugin_usage_records" ENABLE ROW LEVEL SECURITY;
