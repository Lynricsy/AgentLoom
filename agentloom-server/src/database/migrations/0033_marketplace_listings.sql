CREATE TYPE "marketplace_listing_status" AS ENUM('pending_review', 'review_failed', 'listed', 'unlisted');
--> statement-breakpoint
CREATE TABLE "marketplace_listings" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"workflow_version_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"title" varchar(120) NOT NULL,
	"summary" text NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"cover_image_url" text,
	"status" "marketplace_listing_status" DEFAULT 'pending_review' NOT NULL,
	"review_result" jsonb,
	"submitted_by" uuid NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone,
	"unlisted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "marketplace_listings" ADD CONSTRAINT "marketplace_listings_workflow_version_id_workflow_versions_id_fk" FOREIGN KEY ("workflow_version_id") REFERENCES "public"."workflow_versions"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "marketplace_listings" ADD CONSTRAINT "marketplace_listings_submitted_by_users_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_marketplace_listings_workflow_version_id" ON "marketplace_listings" USING btree ("workflow_version_id");
--> statement-breakpoint
CREATE INDEX "idx_marketplace_listings_tenant_status" ON "marketplace_listings" USING btree ("tenant_id", "status");
--> statement-breakpoint
CREATE INDEX "idx_marketplace_listings_tenant_created_at" ON "marketplace_listings" USING btree ("tenant_id", "created_at");
--> statement-breakpoint
CREATE INDEX "idx_marketplace_listings_listed" ON "marketplace_listings" USING btree ("status") WHERE status = 'listed';
--> statement-breakpoint
CREATE INDEX "idx_marketplace_listings_tags" ON "marketplace_listings" USING gin ("tags");
--> statement-breakpoint
CREATE TRIGGER trg_marketplace_listings_updated_at
	BEFORE UPDATE ON "marketplace_listings"
	FOR EACH ROW
	EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
ALTER TABLE "marketplace_listings" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "marketplace_listings" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "marketplace_listings_select_policy" ON "marketplace_listings" AS PERMISSIVE FOR SELECT TO "authenticated" USING (tenant_id = get_tenant_id());
--> statement-breakpoint
CREATE POLICY "marketplace_listings_insert_policy" ON "marketplace_listings" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (tenant_id = get_tenant_id());
--> statement-breakpoint
CREATE POLICY "marketplace_listings_update_policy" ON "marketplace_listings" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (tenant_id = get_tenant_id()) WITH CHECK (tenant_id = get_tenant_id());
--> statement-breakpoint
CREATE POLICY "marketplace_listings_delete_policy" ON "marketplace_listings" AS PERMISSIVE FOR DELETE TO "authenticated" USING (tenant_id = get_tenant_id());
--> statement-breakpoint
GRANT ALL ON "marketplace_listings" TO "authenticated";
