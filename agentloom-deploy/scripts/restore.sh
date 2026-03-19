#!/usr/bin/env bash

set -euo pipefail

DEPLOY_DIR=$(cd "$(dirname "$0")/.." && pwd)
COMPOSE_FILE=${COMPOSE_FILE:-$DEPLOY_DIR/docker-compose.yml}
ENV_FILE=${ENV_FILE:-$DEPLOY_DIR/.env}

POSTGRES_DUMP=""
MINIO_DIR=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --postgres-dump)
      POSTGRES_DUMP=${2:-}
      shift 2
      ;;
    --minio-dir)
      MINIO_DIR=${2:-}
      shift 2
      ;;
    *)
      printf '未知参数：%s\n' "$1" >&2
      exit 1
      ;;
  esac
done

if [[ -z "$POSTGRES_DUMP" || -z "$MINIO_DIR" ]]; then
  printf '用法：%s --postgres-dump <dump-file> --minio-dir <backup-dir>\n' "$0" >&2
  exit 1
fi

if [[ ! -f "$POSTGRES_DUMP" ]]; then
  printf '找不到 PostgreSQL dump：%s\n' "$POSTGRES_DUMP" >&2
  exit 1
fi

if [[ ! -d "$MINIO_DIR" ]]; then
  printf '找不到 MinIO 备份目录：%s\n' "$MINIO_DIR" >&2
  exit 1
fi

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

wait_for_minio() {
  local retries=30
  local attempt=1
  while (( attempt <= retries )); do
    if docker run --rm \
      --network "${COMPOSE_NETWORK:-agentloom-private}" \
      "${MC_IMAGE:-minio/mc:latest}" \
      sh -eu -c '
        mc alias set target "http://'"${APP_MINIO_ENDPOINT:-minio}"':'"${APP_MINIO_PORT:-9000}"'" "'"${APP_MINIO_ACCESS_KEY:-agentloom}"'" "'"${APP_MINIO_SECRET_KEY:-change-me-minio-password}"'" >/dev/null 2>&1
      ' >/dev/null 2>&1; then
      return 0
    fi
    sleep 2
    attempt=$((attempt + 1))
  done

  printf 'MinIO 未在预期时间内就绪。\n' >&2
  return 1
}

printf '停止应用层容器，避免恢复期间产生新写入...\n'
compose stop reverse-proxy studio server worker >/dev/null 2>&1 || true

printf '启动 PostgreSQL 与 MinIO ...\n'
compose up -d postgres minio
wait_for_postgres
wait_for_minio

printf '恢复 PostgreSQL：%s\n' "$POSTGRES_DUMP"
compose exec -T postgres sh -lc '
  PGPASSWORD="$POSTGRES_PASSWORD"
  export PGPASSWORD
  psql -U "$POSTGRES_USER" -d postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '\''$POSTGRES_DB'\'' AND pid <> pg_backend_pid();" >/dev/null
  dropdb --if-exists -U "$POSTGRES_USER" "$POSTGRES_DB"
  createdb -U "$POSTGRES_USER" "$POSTGRES_DB"
' >/dev/null
compose exec -T postgres sh -lc 'PGPASSWORD="$POSTGRES_PASSWORD" pg_restore --no-owner --no-privileges -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < "$POSTGRES_DUMP"

printf '恢复 MinIO：%s\n' "$MINIO_DIR"
docker run --rm \
  --network "${COMPOSE_NETWORK:-agentloom-private}" \
  -v "$MINIO_DIR:/restore:ro" \
  "${MC_IMAGE:-minio/mc:latest}" \
  sh -eu -c '
    mc alias set target "http://'"${APP_MINIO_ENDPOINT:-minio}"':'"${APP_MINIO_PORT:-9000}"'" "'"${APP_MINIO_ACCESS_KEY:-agentloom}"'" "'"${APP_MINIO_SECRET_KEY:-change-me-minio-password}"'"
    mc mb --ignore-existing "target/'"${APP_MINIO_BUCKET:-agentloom-documents}"'"
    mc mirror --overwrite --remove /restore/'"${APP_MINIO_BUCKET:-agentloom-documents}"' "target/'"${APP_MINIO_BUCKET:-agentloom-documents}"'"
  '

printf '重新启动应用层容器...\n'
compose up -d server worker studio reverse-proxy

printf '执行恢复后烟雾检查...\n'
compose exec -T postgres sh -lc 'PGPASSWORD="$POSTGRES_PASSWORD" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "select 1"' >/dev/null
compose exec -T server node -e "require('http').get('http://127.0.0.1:3000/api/v1/health', (res) => { if (res.statusCode !== 200) process.exit(1); res.resume(); res.on('end', () => process.exit(0)); }).on('error', () => process.exit(1))"
compose exec -T reverse-proxy sh -lc 'wget -q -O /dev/null http://127.0.0.1/healthz'

printf '恢复完成：数据库、对象存储与基础健康检查均已通过。\n'
