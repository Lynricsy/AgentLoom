CREATE TABLE "knowledge_nodes" (
	"id" text PRIMARY KEY NOT NULL,
	"document_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"knowledge_base_id" uuid NOT NULL,
	"node_index" integer NOT NULL,
	"node_type" varchar(64) NOT NULL,
	"content" text NOT NULL,
	"token_count" integer NOT NULL,
	"metadata" jsonb NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "knowledge_nodes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY "document_chunks_select_policy" ON "document_chunks" CASCADE;--> statement-breakpoint
DROP POLICY "document_chunks_insert_policy" ON "document_chunks" CASCADE;--> statement-breakpoint
DROP POLICY "document_chunks_update_policy" ON "document_chunks" CASCADE;--> statement-breakpoint
DROP POLICY "document_chunks_delete_policy" ON "document_chunks" CASCADE;--> statement-breakpoint
DROP TABLE "document_chunks" CASCADE;--> statement-breakpoint
ALTER TABLE "knowledge_bases" ADD COLUMN "chunking_strategy" jsonb DEFAULT '{"type":"sentence_window","windowSize":3}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "knowledge_bases" ADD COLUMN "retrieval_strategy" jsonb DEFAULT '{"topK":8,"similarityThreshold":null}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "knowledge_bases" ADD COLUMN "reranking_strategy" jsonb DEFAULT '{"type":"none"}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "knowledge_bases" ADD COLUMN "query_orchestration" jsonb DEFAULT '{"type":"none"}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "knowledge_nodes" ADD CONSTRAINT "knowledge_nodes_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_nodes" ADD CONSTRAINT "knowledge_nodes_knowledge_base_id_knowledge_bases_id_fk" FOREIGN KEY ("knowledge_base_id") REFERENCES "public"."knowledge_bases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "knowledge_nodes_document_id_idx" ON "knowledge_nodes" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "knowledge_nodes_tenant_id_idx" ON "knowledge_nodes" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "knowledge_nodes_knowledge_base_id_idx" ON "knowledge_nodes" USING btree ("knowledge_base_id");--> statement-breakpoint
CREATE INDEX "knowledge_nodes_document_node_idx" ON "knowledge_nodes" USING btree ("document_id","node_index");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_nodes_document_node_unique" ON "knowledge_nodes" USING btree ("document_id","node_index");--> statement-breakpoint
ALTER TABLE "knowledge_bases" DROP COLUMN "chunk_size";--> statement-breakpoint
ALTER TABLE "knowledge_bases" DROP COLUMN "chunk_overlap";--> statement-breakpoint
CREATE POLICY "knowledge_nodes_select_policy" ON "knowledge_nodes" AS PERMISSIVE FOR SELECT TO "authenticated" USING (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "knowledge_nodes_insert_policy" ON "knowledge_nodes" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "knowledge_nodes_update_policy" ON "knowledge_nodes" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (tenant_id = get_tenant_id()) WITH CHECK (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "knowledge_nodes_delete_policy" ON "knowledge_nodes" AS PERMISSIVE FOR DELETE TO "authenticated" USING (tenant_id = get_tenant_id());