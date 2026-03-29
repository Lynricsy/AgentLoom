CREATE TYPE "public"."llm_model_type" AS ENUM('chat', 'embedding');--> statement-breakpoint
ALTER TABLE "knowledge_bases" ADD COLUMN "embedding_model_config_id" uuid;--> statement-breakpoint
ALTER TABLE "llm_model_configs" ADD COLUMN "model_type" "llm_model_type" DEFAULT 'chat' NOT NULL;--> statement-breakpoint
ALTER TABLE "llm_model_configs" ADD COLUMN "embedding_dimensions" integer;--> statement-breakpoint
ALTER TABLE "knowledge_bases" ADD CONSTRAINT "knowledge_bases_embedding_model_config_id_llm_model_configs_id_fk" FOREIGN KEY ("embedding_model_config_id") REFERENCES "public"."llm_model_configs"("id") ON DELETE set null ON UPDATE no action;