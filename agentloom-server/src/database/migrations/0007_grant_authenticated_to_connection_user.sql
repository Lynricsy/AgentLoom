-- 运行时角色证明：确保数据库连接用户可以 SET ROLE authenticated
-- TenantTransactionInterceptor 在事务中执行 SET LOCAL ROLE authenticated，
-- 这要求连接用户是 authenticated 角色的成员。
-- 在 Supabase 中，postgres 用户是超级用户，已隐式拥有此权限。
-- 此迁移为非 Supabase 部署（如自托管 PostgreSQL）提供显式保障。

-- 确保 authenticated 角色存在（Supabase 内置，但自托管环境可能缺失）
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
END
$$;
--> statement-breakpoint
-- 将 authenticated 角色授予当前连接用户
GRANT authenticated TO current_user;
--> statement-breakpoint
-- 验证：连接用户现在可以 SET ROLE authenticated
-- 如果此语句失败，说明 GRANT 未生效
DO $$
BEGIN
  SET LOCAL ROLE authenticated;
  RESET ROLE;
END
$$;
