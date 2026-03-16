DO $$ BEGIN
  CREATE TYPE "payout_status" AS ENUM ('pending', 'processing', 'completed', 'failed');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "plugin_earnings" (
  "id" uuid PRIMARY KEY DEFAULT uuid_generate_v7(),
  "tenant_id" uuid NOT NULL,
  "plugin_db_id" uuid NOT NULL REFERENCES "plugins"("id") ON DELETE CASCADE,
  "plugin_id" varchar(255) NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "period_start" timestamp with time zone NOT NULL,
  "period_end" timestamp with time zone NOT NULL,
  "total_executions" integer NOT NULL DEFAULT 0,
  "total_revenue" numeric(18, 8) NOT NULL DEFAULT '0',
  "developer_share" numeric(18, 8) NOT NULL DEFAULT '0',
  "platform_share" numeric(18, 8) NOT NULL DEFAULT '0',
  "listing_commission" numeric(18, 8) NOT NULL DEFAULT '0',
  "currency" varchar(10) NOT NULL DEFAULT 'USD',
  "payout_status" "payout_status" NOT NULL DEFAULT 'pending',
  "payout_reference" varchar(255),
  "payout_at" timestamp with time zone,
  "metadata" jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "plugin_earnings_tenant_plugin_idx" ON "plugin_earnings" ("tenant_id", "plugin_db_id");
CREATE INDEX IF NOT EXISTS "plugin_earnings_org_idx" ON "plugin_earnings" ("org_id");
CREATE INDEX IF NOT EXISTS "plugin_earnings_period_idx" ON "plugin_earnings" ("period_start", "period_end");
CREATE INDEX IF NOT EXISTS "plugin_earnings_payout_status_idx" ON "plugin_earnings" ("payout_status");

ALTER TABLE "plugin_earnings" ADD CONSTRAINT "plugin_earnings_total_executions_non_negative" CHECK ("total_executions" >= 0);
ALTER TABLE "plugin_earnings" ADD CONSTRAINT "plugin_earnings_total_revenue_non_negative" CHECK ("total_revenue" >= 0);
ALTER TABLE "plugin_earnings" ADD CONSTRAINT "plugin_earnings_developer_share_non_negative" CHECK ("developer_share" >= 0);
ALTER TABLE "plugin_earnings" ADD CONSTRAINT "plugin_earnings_platform_share_non_negative" CHECK ("platform_share" >= 0);

ALTER TABLE "plugin_earnings" ENABLE ROW LEVEL SECURITY;
