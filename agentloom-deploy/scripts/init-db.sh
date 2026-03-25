#!/usr/bin/env bash

set -euo pipefail

DEPLOY_DIR=$(cd "$(dirname "$0")/.." && pwd)
COMPOSE_FILE=${COMPOSE_FILE:-$DEPLOY_DIR/docker-compose.yml}
ENV_FILE=${ENV_FILE:-$DEPLOY_DIR/.env}

COMPOSE_ARGS=(-f "$COMPOSE_FILE")

if [[ -f "$ENV_FILE" ]]; then
  COMPOSE_ARGS+=(--env-file "$ENV_FILE")
  set -a
  source "$ENV_FILE"
  set +a
fi

compose() {
  docker compose "${COMPOSE_ARGS[@]}" "$@"
}

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

check_pi_tarballs() {
  local pi_tarballs_dir="$DEPLOY_DIR/docker/.pi-tarballs"
  if [[ ! -d "$pi_tarballs_dir" ]] || [[ -z "$(ls -A "$pi_tarballs_dir" 2>/dev/null)" ]]; then
    printf '⚠ .pi-tarballs 目录不存在或为空: %s\n' "$pi_tarballs_dir"
    if [[ -f "$DEPLOY_DIR/scripts/prepare-pi-tarballs.sh" ]]; then
      printf '  正在运行 prepare-pi-tarballs.sh ...\n'
      bash "$DEPLOY_DIR/scripts/prepare-pi-tarballs.sh"
    else
      printf '  跳过 pi-tarballs 准备（脚本不存在）。Server 构建可能失败。\n'
    fi
  else
    printf '✓ .pi-tarballs 目录存在且非空\n'
  fi
}

bootstrap_auth_prerequisites() {
  printf '为 vanilla PostgreSQL 初始化 Supabase 兼容角色、auth schema 与 auth.users ...\n'
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
  -- GoTrue migrations hardcode GRANTs to 'postgres' role
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '\''postgres'\'') THEN
    CREATE ROLE postgres LOGIN SUPERUSER;
  END IF;
END
$$;

GRANT ALL ON DATABASE '"$POSTGRES_DB"' TO supabase_auth_admin;

CREATE SCHEMA IF NOT EXISTS auth AUTHORIZATION supabase_auth_admin;
GRANT USAGE ON SCHEMA auth TO '"$POSTGRES_USER"', anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA auth GRANT ALL ON TABLES TO '"$POSTGRES_USER"', anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA auth GRANT ALL ON FUNCTIONS TO '"$POSTGRES_USER"', anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA auth GRANT ALL ON SEQUENCES TO '"$POSTGRES_USER"', anon, authenticated, service_role;

-- 不创建 auth.users 桩表 — GoTrue 首次启动时会自动创建完整 auth schema
-- 启动 Supabase 后需执行: GRANT SELECT, DELETE ON auth.sessions TO $POSTGRES_USER;
SQL'
}

check_pi_tarballs

printf '构建 server 镜像（server/worker 共用镜像）...\n'
compose build server

printf '启动 PostgreSQL ...\n'
compose up -d postgres
wait_for_postgres

bootstrap_auth_prerequisites

printf '执行数据库迁移...\n'
compose run --rm --no-deps server-migrator pnpm db:migrate

if [[ "${RUN_DB_SEED:-false}" == "true" ]]; then
  printf 'RUN_DB_SEED=true，执行种子数据导入...\n'
  compose run --rm --no-deps server-migrator pnpm db:seed
else
  printf '跳过种子数据导入（RUN_DB_SEED=%s）。\n' "${RUN_DB_SEED:-false}"
fi

printf '数据库初始化完成。\n'
