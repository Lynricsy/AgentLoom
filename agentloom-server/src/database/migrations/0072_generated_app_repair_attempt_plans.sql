ALTER TABLE "generated_app_repair_attempts" ADD COLUMN "repair_plan" jsonb;--> statement-breakpoint
ALTER TABLE "generated_app_repair_attempts" ADD COLUMN "reverification_plan" jsonb;
