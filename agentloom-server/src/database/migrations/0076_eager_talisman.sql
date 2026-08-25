ALTER TABLE "marketplace_reviews" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "marketplace_reviews_select_policy" ON "marketplace_reviews" AS PERMISSIVE FOR SELECT TO "anon", "authenticated" USING (true);--> statement-breakpoint
CREATE POLICY "marketplace_reviews_insert_policy" ON "marketplace_reviews" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "marketplace_reviews_update_policy" ON "marketplace_reviews" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "marketplace_reviews_delete_policy" ON "marketplace_reviews" AS PERMISSIVE FOR DELETE TO "authenticated" USING (true);