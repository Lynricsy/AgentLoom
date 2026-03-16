-- Add listing type and pricing model enums for plugin marketplace support
DO $$ BEGIN
  CREATE TYPE "marketplace_listing_type" AS ENUM ('workflow', 'plugin');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "marketplace_pricing_model" AS ENUM ('free', 'per_execution');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Add new columns to marketplace_listings
ALTER TABLE "marketplace_listings"
  ADD COLUMN IF NOT EXISTS "plugin_db_id" uuid REFERENCES "plugins"("id") ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS "listing_type" "marketplace_listing_type" NOT NULL DEFAULT 'workflow',
  ADD COLUMN IF NOT EXISTS "pricing_model" "marketplace_pricing_model" NOT NULL DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS "price_per_execution" numeric(18, 8);

-- Make workflow_version_id nullable (was NOT NULL before)
ALTER TABLE "marketplace_listings"
  ALTER COLUMN "workflow_version_id" DROP NOT NULL;

-- Drop the old unique index and recreate as partial (only when workflow_version_id IS NOT NULL)
DROP INDEX IF EXISTS "uq_marketplace_listings_workflow_version_id";
CREATE UNIQUE INDEX IF NOT EXISTS "uq_marketplace_listings_workflow_version_id"
  ON "marketplace_listings" ("workflow_version_id")
  WHERE workflow_version_id IS NOT NULL;

-- Add new indexes
CREATE INDEX IF NOT EXISTS "idx_marketplace_listings_plugin_db_id"
  ON "marketplace_listings" ("plugin_db_id")
  WHERE plugin_db_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS "idx_marketplace_listings_listing_type"
  ON "marketplace_listings" ("listing_type");

-- Add price check constraint
ALTER TABLE "marketplace_listings"
  ADD CONSTRAINT "marketplace_listings_price_per_execution_non_negative"
  CHECK ("price_per_execution" IS NULL OR "price_per_execution" >= 0);
