CREATE UNIQUE INDEX "uq_marketplace_listings_plugin_db_id" ON "marketplace_listings" USING btree ("plugin_db_id") WHERE plugin_db_id IS NOT NULL;--> statement-breakpoint
ALTER TABLE "marketplace_listings" ADD CONSTRAINT "marketplace_listings_listing_type_binding_check" CHECK ((
        "marketplace_listings"."listing_type" = 'workflow'
        AND "marketplace_listings"."workflow_version_id" IS NOT NULL
        AND "marketplace_listings"."plugin_db_id" IS NULL
      ) OR (
        "marketplace_listings"."listing_type" = 'plugin'
        AND "marketplace_listings"."plugin_db_id" IS NOT NULL
        AND "marketplace_listings"."workflow_version_id" IS NULL
      ));