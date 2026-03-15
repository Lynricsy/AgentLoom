ALTER TABLE "llm_model_configs" ADD COLUMN "endpoint_url" varchar(2048);--> statement-breakpoint
ALTER TABLE "llm_model_configs" ADD COLUMN "auth_method" varchar(20);--> statement-breakpoint
ALTER TABLE "llm_model_configs" ADD COLUMN "auth_config" jsonb;--> statement-breakpoint
ALTER TABLE "llm_model_configs" ADD COLUMN "timeout_ms" integer;
