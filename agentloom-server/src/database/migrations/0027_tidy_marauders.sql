ALTER TABLE "workflow_definitions" ADD COLUMN "input_schema" jsonb DEFAULT null;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "workflow_executions" TO "authenticated";--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "execution_steps" TO "authenticated";
