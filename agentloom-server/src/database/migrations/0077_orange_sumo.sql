CREATE TYPE "public"."sandbox_runtime_node_status_enum" AS ENUM('active', 'draining', 'disabled');--> statement-breakpoint
CREATE TABLE "sandbox_runtime_nodes" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"base_url" varchar(256) NOT NULL,
	"server_name" varchar(128),
	"status" "sandbox_runtime_node_status_enum" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
UPDATE "sandbox_sessions" SET "runtime_handle" = 'default/' || "runtime_handle" WHERE "runtime_handle" IS NOT NULL AND position('/' in "runtime_handle") = 0;
