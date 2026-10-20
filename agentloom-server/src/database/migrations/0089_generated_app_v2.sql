CREATE TYPE "public"."generated_app_submission_origin" AS ENUM('public', 'gate-acceptance');--> statement-breakpoint
ALTER TYPE "public"."generated_app_status" ADD VALUE 'app_spec_generating' BEFORE 'app_spec_ready';--> statement-breakpoint
ALTER TABLE "generated_app_submissions" ALTER COLUMN "public_share_token" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "generated_apps" ALTER COLUMN "app_spec" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "generated_app_submissions" ADD COLUMN "origin" "generated_app_submission_origin" DEFAULT 'public' NOT NULL;--> statement-breakpoint
ALTER TABLE "generated_app_submissions" ADD COLUMN "generation_run_id" uuid;--> statement-breakpoint
ALTER TABLE "generated_apps" ADD COLUMN "generation_model_config_id" uuid;--> statement-breakpoint
ALTER TABLE "generated_apps" ADD COLUMN "binding_target" jsonb;--> statement-breakpoint
ALTER TABLE "generated_apps" ADD COLUMN "acceptance_token_hash" text;--> statement-breakpoint
ALTER TABLE "generated_apps" ADD COLUMN "acceptance_token_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "generated_apps" ADD COLUMN "acceptance_generation_run_id" uuid;--> statement-breakpoint
ALTER TABLE "generated_app_submissions" ADD CONSTRAINT "generated_app_submissions_generation_run_id_generated_app_generation_runs_id_fk" FOREIGN KEY ("generation_run_id") REFERENCES "public"."generated_app_generation_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generated_apps" ADD CONSTRAINT "generated_apps_generation_model_config_id_llm_model_configs_id_fk" FOREIGN KEY ("generation_model_config_id") REFERENCES "public"."llm_model_configs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generated_apps" ADD CONSTRAINT "generated_apps_acceptance_generation_run_id_generated_app_generation_runs_id_fk" FOREIGN KEY ("acceptance_generation_run_id") REFERENCES "public"."generated_app_generation_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_generated_apps_acceptance_token_hash" ON "generated_apps" USING btree ("acceptance_token_hash");--> statement-breakpoint
-- ADR-0007：v1 模板 AppSpec 没有真实运行路径。关闭其公开分享并回到 app_spec_ready，
-- readiness 置为 blocked 防止再次开启分享；下一次生成运行由 Gate 0 重新生成 v2 规格。
UPDATE "generated_apps"
SET
  "public_share_token" = NULL,
  "public_share_enabled" = false,
  "public_share_disabled_at" = CASE
    WHEN "public_share_enabled" THEN now()
    ELSE "public_share_disabled_at"
  END,
  "status" = 'app_spec_ready',
  "readiness" = jsonb_build_object(
    'state', 'blocked',
    'canCreatePublicShare', false,
    'blockingIssueCount', 1,
    'warningCount', 0,
    'summary', 'AppSpec 为 v1 模板，需重新运行生成以产出 v2 规格后才能继续。',
    'blockers', jsonb_build_array(
      jsonb_build_object(
        'gateId', 'gate-0',
        'name', '需求规格门禁',
        'status', 'failed',
        'summary', 'v1 模板 AppSpec 已停用，下一次生成运行会重新生成规格。'
      )
    ),
    'warnings', '[]'::jsonb
  ),
  "updated_at" = now()
WHERE "app_spec"->>'version' = '1';