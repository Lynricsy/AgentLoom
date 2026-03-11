ALTER TYPE "public"."evidence_source_type" ADD VALUE 'node_error';--> statement-breakpoint
CREATE TABLE "workflow_templates" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"slug" varchar(128) NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"category" varchar(64) NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"thumbnail_url" varchar(512),
	"definition" jsonb NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_published" boolean DEFAULT true NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workflow_templates_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_workflow_templates_slug" ON "workflow_templates" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "idx_workflow_templates_category_published" ON "workflow_templates" USING btree ("category") WHERE is_published = true;--> statement-breakpoint
CREATE INDEX "idx_workflow_templates_tags_published" ON "workflow_templates" USING gin ("tags") WHERE is_published = true;