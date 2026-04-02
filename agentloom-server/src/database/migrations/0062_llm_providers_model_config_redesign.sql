-- Migration 0062: 重做模型配置 — llm_providers 新表 + llm_model_configs 重构
-- 系统未上线，直接破坏性变更，不做向下兼容

--> statement-breakpoint
-- 1. 创建 api_protocol 枚举
CREATE TYPE "public"."api_protocol" AS ENUM('openai_chat', 'openai_responses', 'anthropic', 'google', 'cohere');

--> statement-breakpoint
-- 2. 创建 metadata_source 枚举
CREATE TYPE "public"."metadata_source" AS ENUM('api_discovery', 'litellm', 'manual');

--> statement-breakpoint
-- 3. 创建 llm_providers 表
CREATE TABLE IF NOT EXISTS "llm_providers" (
  "id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "tenant_id" uuid NOT NULL,
  "slug" varchar(50) NOT NULL,
  "name" varchar(100) NOT NULL,
  "icon_url" varchar(2048),
  "base_url" varchar(2048),
  "default_base_url" varchar(2048),
  "is_builtin" boolean NOT NULL DEFAULT false,
  "is_enabled" boolean NOT NULL DEFAULT true,
  "api_protocol" "api_protocol" NOT NULL DEFAULT 'openai_chat',
  "api_key_id" uuid REFERENCES "api_keys"("id") ON DELETE SET NULL,
  "sort_order" integer NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

--> statement-breakpoint
ALTER TABLE "llm_providers" ADD CONSTRAINT "uq_llm_providers_org_slug" UNIQUE("org_id", "slug");
CREATE INDEX "idx_llm_providers_org_id" ON "llm_providers" ("org_id");
CREATE INDEX "idx_llm_providers_tenant_id" ON "llm_providers" ("tenant_id");

--> statement-breakpoint
-- 4. llm_providers RLS 策略
ALTER TABLE "llm_providers" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "llm_providers_select" ON "llm_providers" FOR SELECT TO authenticated USING ("tenant_id" = get_tenant_id());
CREATE POLICY "llm_providers_insert" ON "llm_providers" FOR INSERT TO authenticated WITH CHECK ("tenant_id" = get_tenant_id());
CREATE POLICY "llm_providers_update" ON "llm_providers" FOR UPDATE TO authenticated USING ("tenant_id" = get_tenant_id());
CREATE POLICY "llm_providers_delete" ON "llm_providers" FOR DELETE TO authenticated USING ("tenant_id" = get_tenant_id());

--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "llm_providers" TO authenticated;

--> statement-breakpoint
-- 5. 为每个组织的现有 llm_model_configs 数据创建 llm_providers 记录
-- 从现有 provider varchar 值生成 provider 记录
INSERT INTO "llm_providers" ("id", "org_id", "tenant_id", "slug", "name", "is_builtin", "is_enabled", "api_protocol", "api_key_id", "sort_order")
SELECT DISTINCT ON (lmc.org_id, lmc.provider)
  uuid_generate_v7(),
  lmc.org_id,
  lmc.tenant_id,
  lmc.provider,
  CASE lmc.provider
    WHEN 'openai' THEN 'OpenAI'
    WHEN 'anthropic' THEN 'Anthropic'
    WHEN 'google' THEN 'Google Gemini'
    WHEN 'deepseek' THEN 'DeepSeek'
    WHEN 'custom' THEN 'Custom'
    WHEN 'private_cloud' THEN 'Private Cloud'
    ELSE lmc.provider
  END,
  CASE WHEN lmc.provider IN ('openai', 'anthropic', 'google', 'deepseek') THEN true ELSE false END,
  true,
  CASE lmc.provider
    WHEN 'openai' THEN 'openai_responses'::"api_protocol"
    WHEN 'anthropic' THEN 'anthropic'::"api_protocol"
    WHEN 'google' THEN 'google'::"api_protocol"
    ELSE 'openai_chat'::"api_protocol"
  END,
  lmc.api_key_id,
  CASE lmc.provider
    WHEN 'openai' THEN 1
    WHEN 'anthropic' THEN 2
    WHEN 'google' THEN 3
    WHEN 'deepseek' THEN 4
    ELSE 99
  END
FROM "llm_model_configs" lmc
WHERE EXISTS (SELECT 1 FROM "llm_model_configs" WHERE org_id = lmc.org_id AND provider = lmc.provider)
ON CONFLICT DO NOTHING;

--> statement-breakpoint
-- 6. 添加 llm_model_configs 新列
ALTER TABLE "llm_model_configs" ADD COLUMN "provider_id" uuid;
ALTER TABLE "llm_model_configs" ADD COLUMN "model_id" varchar(100);
ALTER TABLE "llm_model_configs" ADD COLUMN "is_enabled" boolean NOT NULL DEFAULT true;
ALTER TABLE "llm_model_configs" ADD COLUMN "capabilities" jsonb DEFAULT '{}';
ALTER TABLE "llm_model_configs" ADD COLUMN "context_window" integer;
ALTER TABLE "llm_model_configs" ADD COLUMN "max_output_tokens" integer;
ALTER TABLE "llm_model_configs" ADD COLUMN "pricing" jsonb;
ALTER TABLE "llm_model_configs" ADD COLUMN "metadata_source" "metadata_source";

--> statement-breakpoint
-- 7. 填充 provider_id（关联到上面创建的 provider 记录）和 model_id
UPDATE "llm_model_configs" lmc
SET
  "provider_id" = lp.id,
  "model_id" = lmc.model_name
FROM "llm_providers" lp
WHERE lp.org_id = lmc.org_id AND lp.slug = lmc.provider;

--> statement-breakpoint
-- 8. 处理 private_cloud/custom provider 的 endpoint_url → 对应 provider 的 base_url
UPDATE "llm_providers" lp
SET "base_url" = lmc.endpoint_url
FROM "llm_model_configs" lmc
WHERE lp.org_id = lmc.org_id AND lp.slug = lmc.provider AND lmc.endpoint_url IS NOT NULL;

--> statement-breakpoint
-- 9. 设置 NOT NULL 约束（数据已填充）
ALTER TABLE "llm_model_configs" ALTER COLUMN "provider_id" SET NOT NULL;
ALTER TABLE "llm_model_configs" ALTER COLUMN "model_id" SET NOT NULL;

--> statement-breakpoint
-- 10. 添加外键
ALTER TABLE "llm_model_configs" ADD CONSTRAINT "fk_llm_model_configs_provider" FOREIGN KEY ("provider_id") REFERENCES "llm_providers"("id") ON DELETE CASCADE;

--> statement-breakpoint
-- 11. 添加 provider_id 索引
CREATE INDEX "idx_llm_model_configs_provider_id" ON "llm_model_configs" ("provider_id");

--> statement-breakpoint
-- 12. 删除旧列（系统未上线，直接删）
ALTER TABLE "llm_model_configs" DROP COLUMN "provider";
ALTER TABLE "llm_model_configs" DROP COLUMN "model_name";
ALTER TABLE "llm_model_configs" DROP COLUMN "api_key_id";
ALTER TABLE "llm_model_configs" DROP COLUMN "endpoint_url";
ALTER TABLE "llm_model_configs" DROP COLUMN "auth_method";
ALTER TABLE "llm_model_configs" DROP COLUMN "auth_config";

--> statement-breakpoint
-- 13. api_keys.provider: 从 enum 改为 varchar（支持任意提供商 slug）
ALTER TABLE "api_keys" ALTER COLUMN "provider" TYPE varchar(50) USING "provider"::varchar(50);

--> statement-breakpoint
-- 14. 清理旧的 llm_provider enum（不再使用）
-- 注意: 仅当无其他表引用此 enum 时才删除
DROP TYPE IF EXISTS "public"."llm_provider";
