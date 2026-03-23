CREATE TABLE "skills" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" varchar(128) NOT NULL,
	"slug" varchar(128) NOT NULL,
	"description" text NOT NULL,
	"content" text,
	"frontmatter" jsonb,
	"is_builtin" boolean DEFAULT false NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"file_count" integer DEFAULT 1 NOT NULL,
	"total_size_bytes" bigint DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" uuid NOT NULL,
	"updated_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "skills" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "skills" ADD CONSTRAINT "skills_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skills" ADD CONSTRAINT "skills_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "skills_tenant_name_idx" ON "skills" USING btree ("tenant_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "skills_tenant_slug_idx" ON "skills" USING btree ("tenant_id","slug");--> statement-breakpoint
CREATE INDEX "skills_tenant_status_idx" ON "skills" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "skills_is_builtin_idx" ON "skills" USING btree ("is_builtin");--> statement-breakpoint
CREATE POLICY "skills_select_policy" ON "skills" AS PERMISSIVE FOR SELECT TO "authenticated" USING (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "skills_insert_policy" ON "skills" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "skills_update_policy" ON "skills" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (tenant_id = get_tenant_id()) WITH CHECK (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "skills_delete_policy" ON "skills" AS PERMISSIVE FOR DELETE TO "authenticated" USING (tenant_id = get_tenant_id());