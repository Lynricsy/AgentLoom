CREATE TABLE "reusable_blocks" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"org_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"category" varchar(64),
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"definition" jsonb NOT NULL,
	"metadata" jsonb,
	"version" integer DEFAULT 1 NOT NULL,
	"is_published" boolean DEFAULT false NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reusable_blocks" ADD CONSTRAINT "reusable_blocks_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reusable_blocks" ADD CONSTRAINT "reusable_blocks_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_reusable_blocks_org_id" ON "reusable_blocks" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "idx_reusable_blocks_tags" ON "reusable_blocks" USING gin ("tags");--> statement-breakpoint
CREATE TRIGGER trg_reusable_blocks_updated_at
	BEFORE UPDATE ON "reusable_blocks"
	FOR EACH ROW
	EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
ALTER TABLE "reusable_blocks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "reusable_blocks" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "reusable_blocks_select_policy" ON "reusable_blocks" AS PERMISSIVE FOR SELECT TO "authenticated" USING (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "reusable_blocks_insert_policy" ON "reusable_blocks" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "reusable_blocks_update_policy" ON "reusable_blocks" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (tenant_id = get_tenant_id()) WITH CHECK (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "reusable_blocks_delete_policy" ON "reusable_blocks" AS PERMISSIVE FOR DELETE TO "authenticated" USING (tenant_id = get_tenant_id());--> statement-breakpoint
GRANT ALL ON "reusable_blocks" TO "authenticated";
