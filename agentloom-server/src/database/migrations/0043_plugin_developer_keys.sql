-- 扩展 plugins 表
ALTER TABLE "plugins" ADD COLUMN "signature" text;
ALTER TABLE "plugins" ADD COLUMN "content_hash" varchar(64);
ALTER TABLE "plugins" ADD COLUMN "wasm_bundle_url" varchar(512);

-- 创建 plugin_developer_key_status 枚举
CREATE TYPE "public"."plugin_developer_key_status" AS ENUM('active', 'revoked');

-- 创建 plugin_developer_keys 表
CREATE TABLE IF NOT EXISTS "plugin_developer_keys" (
  "id" uuid PRIMARY KEY DEFAULT uuid_generate_v7(),
  "tenant_id" uuid NOT NULL,
  "org_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "public_key" text NOT NULL,
  "key_fingerprint" varchar(64) NOT NULL,
  "label" varchar(255),
  "status" "plugin_developer_key_status" NOT NULL DEFAULT 'active',
  "revoked_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- 索引
CREATE UNIQUE INDEX IF NOT EXISTS "uq_plugin_developer_keys_org_fingerprint" ON "plugin_developer_keys" USING btree ("org_id","key_fingerprint");
CREATE INDEX IF NOT EXISTS "idx_plugin_developer_keys_tenant_id" ON "plugin_developer_keys" USING btree ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_plugin_developer_keys_user_id" ON "plugin_developer_keys" USING btree ("user_id");
CREATE INDEX IF NOT EXISTS "idx_plugin_developer_keys_status" ON "plugin_developer_keys" USING btree ("status");

-- 外键
ALTER TABLE "plugin_developer_keys" ADD CONSTRAINT "plugin_developer_keys_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "plugin_developer_keys" ADD CONSTRAINT "plugin_developer_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;

-- RLS
ALTER TABLE "plugin_developer_keys" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "plugin_developer_keys_tenant_isolation" ON "plugin_developer_keys" AS PERMISSIVE FOR ALL TO "authenticated" USING ("tenant_id" = current_setting('app.tenant_id', true)::uuid);
