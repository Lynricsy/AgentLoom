CREATE TABLE "document_chunks" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"document_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"knowledge_base_id" uuid NOT NULL,
	"chunk_index" integer NOT NULL,
	"content" text NOT NULL,
	"metadata" jsonb NOT NULL,
	"token_count" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "document_chunks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "document_chunks" ADD CONSTRAINT "document_chunks_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "document_chunks_document_id_idx" ON "document_chunks" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "document_chunks_tenant_id_idx" ON "document_chunks" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "document_chunks_knowledge_base_id_idx" ON "document_chunks" USING btree ("knowledge_base_id");--> statement-breakpoint
CREATE INDEX "document_chunks_document_chunk_idx" ON "document_chunks" USING btree ("document_id","chunk_index");--> statement-breakpoint
CREATE POLICY "document_chunks_select_policy" ON "document_chunks" AS PERMISSIVE FOR SELECT TO "authenticated" USING (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "document_chunks_insert_policy" ON "document_chunks" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "document_chunks_update_policy" ON "document_chunks" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (tenant_id = get_tenant_id()) WITH CHECK (tenant_id = get_tenant_id());--> statement-breakpoint
CREATE POLICY "document_chunks_delete_policy" ON "document_chunks" AS PERMISSIVE FOR DELETE TO "authenticated" USING (tenant_id = get_tenant_id());