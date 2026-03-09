CREATE TYPE "public"."notification_type_enum" AS ENUM('execution_completed', 'execution_failed', 'intervention_required', 'system');--> statement-breakpoint
CREATE TABLE "notification_preferences" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"user_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"type" "notification_type_enum" NOT NULL,
	"channel" varchar(32) NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notification_preferences" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"type" "notification_type_enum" NOT NULL,
	"title" varchar(256) NOT NULL,
	"body" jsonb,
	"is_read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_notification_preferences_user_tenant_type_channel" ON "notification_preferences" USING btree ("user_id","tenant_id","type","channel");--> statement-breakpoint
CREATE INDEX "idx_notification_preferences_tenant_id" ON "notification_preferences" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_notifications_user_tenant_read_created" ON "notifications" USING btree ("user_id","tenant_id","is_read","created_at");--> statement-breakpoint
CREATE INDEX "idx_notifications_tenant_id" ON "notifications" USING btree ("tenant_id");--> statement-breakpoint
CREATE POLICY "notification_preferences_select_policy" ON "notification_preferences" AS PERMISSIVE FOR SELECT TO "authenticated" USING (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "notification_preferences_insert_policy" ON "notification_preferences" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "notification_preferences_update_policy" ON "notification_preferences" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (tenant_id = get_tenant_id()) WITH CHECK (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "notification_preferences_delete_policy" ON "notification_preferences" AS PERMISSIVE FOR DELETE TO "authenticated" USING (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "notifications_select_policy" ON "notifications" AS PERMISSIVE FOR SELECT TO "authenticated" USING (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "notifications_insert_policy" ON "notifications" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "notifications_update_policy" ON "notifications" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (tenant_id = get_tenant_id()) WITH CHECK (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "notifications_delete_policy" ON "notifications" AS PERMISSIVE FOR DELETE TO "authenticated" USING (tenant_id = get_tenant_id());