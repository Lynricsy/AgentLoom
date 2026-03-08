ALTER TABLE "documents" ADD COLUMN "error_message" text;--> statement-breakpoint
ALTER TABLE "knowledge_bases" ADD COLUMN "chunk_size" integer DEFAULT 512 NOT NULL;--> statement-breakpoint
ALTER TABLE "knowledge_bases" ADD COLUMN "chunk_overlap" integer DEFAULT 64 NOT NULL;--> statement-breakpoint
ALTER TABLE "knowledge_bases" ADD COLUMN "embedding_model" varchar(255) DEFAULT 'text-embedding-3-small' NOT NULL;