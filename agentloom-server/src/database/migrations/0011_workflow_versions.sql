CREATE TABLE IF NOT EXISTS "workflow_versions" (
  "id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
  "workflow_definition_id" uuid NOT NULL,
  "tenant_id" uuid NOT NULL,
  "version_number" integer NOT NULL,
  "label" varchar(255),
  "snapshot" jsonb NOT NULL,
  "published_at" timestamp with time zone,
  "archived_at" timestamp with time zone,
  "created_by" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workflow_definitions"
  ADD COLUMN "published_version_id" uuid;
--> statement-breakpoint
ALTER TABLE "workflow_versions"
  ADD CONSTRAINT "workflow_versions_workflow_definition_id_workflow_definitions_id_fk"
  FOREIGN KEY ("workflow_definition_id") REFERENCES "public"."workflow_definitions"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "workflow_versions"
  ADD CONSTRAINT "workflow_versions_created_by_users_id_fk"
  FOREIGN KEY ("created_by") REFERENCES "public"."users"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "workflow_definitions"
  ADD CONSTRAINT "workflow_definitions_published_version_id_workflow_versions_id_fk"
  FOREIGN KEY ("published_version_id") REFERENCES "public"."workflow_versions"("id")
  ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_workflow_versions_workflow_version"
  ON "workflow_versions" USING btree ("workflow_definition_id", "version_number");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_workflow_versions_tenant_published"
  ON "workflow_versions" USING btree ("tenant_id", "published_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_workflow_versions_tenant_id"
  ON "workflow_versions" USING btree ("tenant_id");
--> statement-breakpoint
ALTER TABLE "workflow_versions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "workflow_versions" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "workflow_versions_select_policy"
  ON "workflow_versions" AS PERMISSIVE FOR SELECT
  TO "authenticated"
  USING (tenant_id = get_tenant_id());
--> statement-breakpoint
CREATE POLICY "workflow_versions_insert_policy"
  ON "workflow_versions" AS PERMISSIVE FOR INSERT
  TO "authenticated"
  WITH CHECK (tenant_id = get_tenant_id());
--> statement-breakpoint
CREATE POLICY "workflow_versions_update_policy"
  ON "workflow_versions" AS PERMISSIVE FOR UPDATE
  TO "authenticated"
  USING (tenant_id = get_tenant_id());
--> statement-breakpoint
CREATE POLICY "workflow_versions_delete_policy"
  ON "workflow_versions" AS PERMISSIVE FOR DELETE
  TO "authenticated"
  USING (tenant_id = get_tenant_id());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "workflow_versions" TO "authenticated";
