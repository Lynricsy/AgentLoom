ALTER TABLE "tenant_quotas" ALTER COLUMN "api_rate_limit_per_minute" SET DEFAULT 600;--> statement-breakpoint
-- 分钟桶改为整个组织跨接口共用（D-214）。此前 100 实际是「每个接口 100」，保存配额时又会把默认值 100 原样写入，
-- 仍为 100 的行同步到新默认值；调成其他值的组织保留原值。
UPDATE "tenant_quotas" SET "api_rate_limit_per_minute" = 600, "version" = "version" + 1, "updated_at" = now() WHERE "api_rate_limit_per_minute" = 100;
