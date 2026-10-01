#!/usr/bin/env bash

set -euo pipefail

DEPLOY_DIR=$(cd "$(dirname "$0")/.." && pwd)
COMPOSE_FILE=${COMPOSE_FILE:-$DEPLOY_DIR/docker-compose.yml}
SUPABASE_COMPOSE_FILE=${SUPABASE_COMPOSE_FILE:-$DEPLOY_DIR/docker-compose.supabase.yml}
ENV_FILE=${ENV_FILE:-$DEPLOY_DIR/.env}

COMPOSE_ARGS=(-f "$COMPOSE_FILE")
SUPABASE_COMPOSE_ARGS=(-f "$SUPABASE_COMPOSE_FILE")

if [[ -f "$ENV_FILE" ]]; then
  COMPOSE_ARGS+=(--env-file "$ENV_FILE")
  SUPABASE_COMPOSE_ARGS+=(--env-file "$ENV_FILE")
  set -a
  source "$ENV_FILE"
  set +a
fi

compose() {
  docker compose "${COMPOSE_ARGS[@]}" "$@"
}

supabase_compose() {
  docker compose "${SUPABASE_COMPOSE_ARGS[@]}" "$@"
}

# shellcheck source=lib/db.sh
source "$DEPLOY_DIR/scripts/lib/db.sh"

# server 迁移给 users.supabase_user_id 加了指向 auth.users(id) 的外键，
# auth.users 由 GoTrue 首次启动时创建，所以迁移前必须先让 GoTrue 跑完自身迁移。
wait_for_auth_users() {
  if auth_users_exists; then
    printf '✓ auth.users 已存在\n'
    return 0
  fi

  printf '启动 Supabase 认证栈，等待 GoTrue 创建 auth.users ...\n'
  supabase_compose up -d --wait

  local retries=30
  local attempt=1
  while (( attempt <= retries )); do
    if auth_users_exists; then
      printf '✓ auth.users 已由 GoTrue 创建\n'
      return 0
    fi
    sleep 2
    attempt=$((attempt + 1))
  done

  printf 'GoTrue 未在预期时间内创建 auth.users，检查: docker compose -f %s logs supabase-auth\n' "$SUPABASE_COMPOSE_FILE" >&2
  return 1
}

printf '构建 server 镜像（server/worker 共用镜像）...\n'
compose build server

printf '启动 PostgreSQL ...\n'
compose up -d postgres
wait_for_postgres

bootstrap_auth_prerequisites
wait_for_auth_users

printf '执行数据库迁移...\n'
compose run --rm --no-deps server-migrator pnpm db:migrate

if [[ "${RUN_DB_SEED:-false}" == "true" ]]; then
  printf 'RUN_DB_SEED=true，执行种子数据导入...\n'
  compose run --rm --no-deps server-migrator pnpm db:seed
else
  printf '跳过种子数据导入（RUN_DB_SEED=%s）。\n' "${RUN_DB_SEED:-false}"
fi

printf '数据库初始化完成。\n'
