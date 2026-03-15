CREATE TYPE "public"."marketplace_category_enum" AS ENUM('analysis', 'content', 'development', 'automation', 'reporting');--> statement-breakpoint
CREATE TABLE "marketplace_reviews" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"listing_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"rating" smallint NOT NULL,
	"content" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rating_range" CHECK ("marketplace_reviews"."rating" >= 1 AND "marketplace_reviews"."rating" <= 5)
);
--> statement-breakpoint
ALTER TABLE "marketplace_listings" ADD COLUMN "category" "marketplace_category_enum";--> statement-breakpoint
ALTER TABLE "marketplace_listings" ADD COLUMN "use_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "marketplace_listings" ADD COLUMN "avg_rating" numeric(3, 2);--> statement-breakpoint
ALTER TABLE "marketplace_listings" ADD COLUMN "review_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "marketplace_reviews" ADD CONSTRAINT "marketplace_reviews_listing_id_marketplace_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."marketplace_listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace_reviews" ADD CONSTRAINT "marketplace_reviews_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "marketplace_reviews_listing_user_idx" ON "marketplace_reviews" USING btree ("listing_id","user_id");--> statement-breakpoint
CREATE INDEX "marketplace_reviews_listing_idx" ON "marketplace_reviews" USING btree ("listing_id");--> statement-breakpoint
CREATE INDEX "marketplace_listings_category_listed_idx" ON "marketplace_listings" USING btree ("category") WHERE status = 'listed';--> statement-breakpoint
ALTER TABLE "marketplace_listings" ADD CONSTRAINT "marketplace_listings_use_count_non_negative" CHECK ("marketplace_listings"."use_count" >= 0);--> statement-breakpoint
ALTER TABLE "marketplace_listings" ADD CONSTRAINT "marketplace_listings_review_count_non_negative" CHECK ("marketplace_listings"."review_count" >= 0);--> statement-breakpoint
ALTER TABLE "marketplace_listings" ADD CONSTRAINT "marketplace_listings_avg_rating_range" CHECK ("marketplace_listings"."avg_rating" IS NULL OR ("marketplace_listings"."avg_rating" >= 1 AND "marketplace_listings"."avg_rating" <= 5));