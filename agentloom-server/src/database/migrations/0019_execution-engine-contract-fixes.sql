CREATE TYPE "public"."execution_trigger_type_enum" AS ENUM('manual', 'api', 'webhook', 'system');--> statement-breakpoint
ALTER TABLE "execution_steps" ALTER COLUMN "node_id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "execution_steps" ADD COLUMN "checkpoint_data" jsonb;--> statement-breakpoint
ALTER TABLE "workflow_executions" ADD COLUMN "trigger_type" "execution_trigger_type_enum" DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "workflow_executions" ADD COLUMN "input_params" jsonb DEFAULT '{}'::jsonb NOT NULL;
