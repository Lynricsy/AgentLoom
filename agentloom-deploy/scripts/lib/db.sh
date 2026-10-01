# shellcheck shell=bash
# init-db.sh 与 restore.sh 共用的 PostgreSQL 辅助函数。
# 调用方须先定义 compose()（docker compose + 本部署的 -f/--env-file 参数）。

wait_for_postgres() {
  local retries=30
  local attempt=1
  while (( attempt <= retries )); do
    if compose exec -T postgres sh -lc 'pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"' >/dev/null 2>&1; then
      return 0
    fi
    sleep 2
    attempt=$((attempt + 1))
  done

  printf 'PostgreSQL 未在预期时间内就绪。\n' >&2
  return 1
}

# Supabase 兼容角色是集群级对象：dropdb 不会删除，新数据卷上则不存在。
# GoTrue 迁移会对 postgres 角色授权，server 迁移与 RLS 依赖 authenticated 等角色。
ensure_supabase_roles() {
  compose exec -T postgres sh -lc 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" <<"SQL"
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '\''supabase_auth_admin'\'') THEN
    CREATE ROLE supabase_auth_admin LOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '\''authenticated'\'') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '\''anon'\'') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '\''service_role'\'') THEN
    CREATE ROLE service_role NOLOGIN;
  END IF;
  -- GoTrue migrations hardcode GRANTs to '\''postgres'\'' role
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '\''postgres'\'') THEN
    CREATE ROLE postgres LOGIN SUPERUSER;
  END IF;
END
$$;

-- 数据库级 ACL 不在 pg_dump 归档内（只有 pg_restore --create 才会带上），每次建库后都要补。
GRANT ALL ON DATABASE '"$POSTGRES_DB"' TO supabase_auth_admin;
SQL'
}

bootstrap_auth_prerequisites() {
  printf '为 vanilla PostgreSQL 初始化 Supabase 兼容角色与 auth schema ...\n'
  ensure_supabase_roles
  compose exec -T postgres sh -lc 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" <<"SQL"
CREATE SCHEMA IF NOT EXISTS auth AUTHORIZATION supabase_auth_admin;
GRANT USAGE ON SCHEMA auth TO '"$POSTGRES_USER"', anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA auth GRANT ALL ON TABLES TO '"$POSTGRES_USER"', anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA auth GRANT ALL ON FUNCTIONS TO '"$POSTGRES_USER"', anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA auth GRANT ALL ON SEQUENCES TO '"$POSTGRES_USER"', anon, authenticated, service_role;

-- 不创建 auth.users 桩表 — GoTrue 首次启动时会自动创建完整 auth schema
-- 启动 Supabase 后需执行: GRANT SELECT, DELETE ON auth.sessions TO $POSTGRES_USER;
SQL'
}

auth_users_exists() {
  local result
  result=$(compose exec -T postgres sh -lc 'psql -tA -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT to_regclass('\''auth.users'\'') IS NOT NULL"' 2>/dev/null) || return 1
  [[ "$result" == "t" ]]
}
