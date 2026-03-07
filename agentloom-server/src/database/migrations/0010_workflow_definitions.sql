DO $$ BEGIN
  CREATE TYPE "workflow_status_enum" AS ENUM('draft', 'published', 'archived');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE "workflow_definitions" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"slug" varchar(255) NOT NULL,
	"description" text,
	"nodes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"edges" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"viewport" jsonb,
	"version" integer DEFAULT 1 NOT NULL,
	"status" "workflow_status_enum" DEFAULT 'draft' NOT NULL,
	"created_by" uuid NOT NULL,
	"updated_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_workflow_definitions_tenant_slug" ON "workflow_definitions" USING btree ("tenant_id","slug");
--> statement-breakpoint
CREATE INDEX "idx_workflow_definitions_tenant_updated" ON "workflow_definitions" USING btree ("tenant_id","updated_at");
--> statement-breakpoint
CREATE INDEX "idx_workflow_definitions_tenant_status" ON "workflow_definitions" USING btree ("tenant_id","status");
--> statement-breakpoint
CREATE INDEX "idx_workflow_definitions_tenant_id" ON "workflow_definitions" USING btree ("tenant_id");
--> statement-breakpoint
ALTER TABLE "workflow_definitions" ADD CONSTRAINT "workflow_definitions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "workflow_definitions" ADD CONSTRAINT "workflow_definitions_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE TRIGGER trg_workflow_definitions_updated_at
  BEFORE UPDATE ON "workflow_definitions"
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
ALTER TABLE "workflow_definitions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "workflow_definitions" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "workflow_definitions_select_policy" ON "workflow_definitions" AS PERMISSIVE FOR SELECT TO "authenticated" USING (tenant_id = get_tenant_id());
--> statement-breakpoint
CREATE POLICY "workflow_definitions_insert_policy" ON "workflow_definitions" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (tenant_id = get_tenant_id());
--> statement-breakpoint
CREATE POLICY "workflow_definitions_update_policy" ON "workflow_definitions" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (tenant_id = get_tenant_id()) WITH CHECK (tenant_id = get_tenant_id());
--> statement-breakpoint
CREATE POLICY "workflow_definitions_delete_policy" ON "workflow_definitions" AS PERMISSIVE FOR DELETE TO "authenticated" USING (tenant_id = get_tenant_id());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "workflow_definitions" TO "authenticated";
