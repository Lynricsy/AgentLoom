CREATE TYPE "public"."sandbox_runtime_migration_status_enum" AS ENUM('pending', 'archiving', 'archived', 'restoring', 'verified', 'finalized', 'failed', 'rolled_back');--> statement-breakpoint
CREATE TABLE "sandbox_runtime_migrations" (
	"sandbox_session_id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"legacy_container_id" varchar(128) NOT NULL,
	"source_workspace_identity" varchar(512) NOT NULL,
	"archive_object_key" varchar(1024),
	"manifest_object_key" varchar(1024),
	"archive_sha256" varchar(64),
	"manifest_sha256" varchar(64),
	"file_count" bigint,
	"total_bytes" bigint,
	"status" "sandbox_runtime_migration_status_enum" DEFAULT 'pending' NOT NULL,
	"error" text,
	"archived_at" timestamp with time zone,
	"restored_at" timestamp with time zone,
	"verified_at" timestamp with time zone,
	"finalized_at" timestamp with time zone,
	"rolled_back_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sandbox_runtime_migrations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "workspace_runtime_leases" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"sandbox_session_id" uuid NOT NULL,
	"fencing_token" bigint NOT NULL,
	"lease_expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workspace_runtime_leases" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sandbox_runtime_migrations" ADD CONSTRAINT "sandbox_runtime_migrations_sandbox_session_id_sandbox_sessions_id_fk" FOREIGN KEY ("sandbox_session_id") REFERENCES "public"."sandbox_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_runtime_leases" ADD CONSTRAINT "workspace_runtime_leases_workspace_id_workspace_snapshots_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace_snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_runtime_leases" ADD CONSTRAINT "workspace_runtime_leases_sandbox_session_id_sandbox_sessions_id_fk" FOREIGN KEY ("sandbox_session_id") REFERENCES "public"."sandbox_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_sandbox_runtime_migrations_tenant_status" ON "sandbox_runtime_migrations" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "idx_sandbox_runtime_migrations_workspace" ON "sandbox_runtime_migrations" USING btree ("tenant_id","source_workspace_identity");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_workspace_runtime_leases_workspace" ON "workspace_runtime_leases" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "idx_workspace_runtime_leases_tenant_expiry" ON "workspace_runtime_leases" USING btree ("tenant_id","lease_expires_at");--> statement-breakpoint
CREATE INDEX "idx_workspace_runtime_leases_session" ON "workspace_runtime_leases" USING btree ("sandbox_session_id");--> statement-breakpoint
CREATE POLICY "sandbox_runtime_migrations_select_policy" ON "sandbox_runtime_migrations" AS PERMISSIVE FOR SELECT TO "authenticated" USING (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "sandbox_runtime_migrations_insert_policy" ON "sandbox_runtime_migrations" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "sandbox_runtime_migrations_update_policy" ON "sandbox_runtime_migrations" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (tenant_id = get_tenant_id()) WITH CHECK (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "sandbox_runtime_migrations_delete_policy" ON "sandbox_runtime_migrations" AS PERMISSIVE FOR DELETE TO "authenticated" USING (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "workspace_runtime_leases_select_policy" ON "workspace_runtime_leases" AS PERMISSIVE FOR SELECT TO "authenticated" USING (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "workspace_runtime_leases_insert_policy" ON "workspace_runtime_leases" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "workspace_runtime_leases_update_policy" ON "workspace_runtime_leases" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (tenant_id = get_tenant_id()) WITH CHECK (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "workspace_runtime_leases_delete_policy" ON "workspace_runtime_leases" AS PERMISSIVE FOR DELETE TO "authenticated" USING (tenant_id = get_tenant_id());
GRANT SELECT, INSERT, UPDATE, DELETE ON "sandbox_runtime_migrations" TO "authenticated";--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "workspace_runtime_leases" TO "authenticated";