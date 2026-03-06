-- 自定义迁移: 为 users 表添加 updated_at 自动更新触发器
-- Drizzle 的 $onUpdateFn 仅在 ORM 层生效，不保证数据库级别自动更新
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON "users"
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();
