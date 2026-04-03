CREATE TYPE "public"."agent_runtime_mode_enum" AS ENUM('sandbox', 'no_sandbox');
--> statement-breakpoint
ALTER TABLE "agent_definitions"
ADD COLUMN "runtime_mode" "public"."agent_runtime_mode_enum" DEFAULT 'sandbox' NOT NULL;
