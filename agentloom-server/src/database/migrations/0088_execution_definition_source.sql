CREATE TYPE "public"."execution_definition_source_enum" AS ENUM('version', 'draft');--> statement-breakpoint
ALTER TABLE "workflow_executions" ALTER COLUMN "workflow_version_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "workflow_executions" ADD COLUMN "definition_source" "execution_definition_source_enum" DEFAULT 'version' NOT NULL;--> statement-breakpoint
-- D-135 回填：Studio 自 2026-03-31（commit 6fcdbf48）起以当前草稿运行（launchSource = web-studio），
-- 此前写入的 workflow_version_id 是当时的发布版本而非真实运行的定义；真实定义保留在 definition_snapshot。
UPDATE "workflow_executions" SET "definition_source" = 'draft', "workflow_version_id" = NULL WHERE "input_params" -> '_meta' ->> 'launchSource' = 'web-studio' AND "created_at" >= '2026-03-31T00:00:00Z';--> statement-breakpoint
CREATE INDEX "idx_workflow_executions_workflow_version" ON "workflow_executions" USING btree ("workflow_version_id");--> statement-breakpoint
ALTER TABLE "workflow_executions" ADD CONSTRAINT "chk_workflow_executions_definition_source_version" CHECK (("workflow_executions"."definition_source" = 'draft') = ("workflow_executions"."workflow_version_id" IS NULL));