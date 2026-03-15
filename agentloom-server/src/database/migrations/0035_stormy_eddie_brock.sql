CREATE TYPE "public"."share_type" AS ENUM('read_only', 'copyable');--> statement-breakpoint
CREATE TABLE "workflow_shares" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"workflow_definition_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"share_token" text NOT NULL,
	"share_type" "share_type" DEFAULT 'read_only' NOT NULL,
	"created_by" uuid NOT NULL,
	"expires_at" timestamp with time zone,
	"is_revoked" boolean DEFAULT false NOT NULL,
	"view_count" integer DEFAULT 0 NOT NULL,
	"copy_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workflow_shares_view_count_non_negative" CHECK ("workflow_shares"."view_count" >= 0),
	CONSTRAINT "workflow_shares_copy_count_non_negative" CHECK ("workflow_shares"."copy_count" >= 0)
);
--> statement-breakpoint
ALTER TABLE "workflow_shares" ADD CONSTRAINT "workflow_shares_workflow_definition_id_workflow_definitions_id_fk" FOREIGN KEY ("workflow_definition_id") REFERENCES "public"."workflow_definitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_shares" ADD CONSTRAINT "workflow_shares_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_workflow_shares_token" ON "workflow_shares" USING btree ("share_token");--> statement-breakpoint
CREATE INDEX "idx_workflow_shares_workflow_definition" ON "workflow_shares" USING btree ("workflow_definition_id");--> statement-breakpoint
CREATE INDEX "idx_workflow_shares_tenant_id" ON "workflow_shares" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_workflow_shares_created_by" ON "workflow_shares" USING btree ("created_by");