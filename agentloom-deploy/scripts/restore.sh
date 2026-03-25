#!/usr/bin/env bash

set -euo pipefail

DEPLOY_DIR=$(cd "$(dirname "$0")/.." && pwd)
COMPOSE_FILE=${COMPOSE_FILE:-$DEPLOY_DIR/docker-compose.yml}
ENV_FILE=${ENV_FILE:-$DEPLOY_DIR/.env}
MINIO_SCHEME=http

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

if [[ "${APP_MINIO_USE_SSL:-false}" == "true" ]]; then
  MINIO_SCHEME=https
fi

compose() {
  docker compose "${COMPOSE_ARGS[@]}" "$@"
}

verify_postgres_dump() {
  local dump_dir
  local dump_file
  local checksum_file

  dump_dir=$(cd "$(dirname "$POSTGRES_DUMP")" && pwd)
  dump_file=$(basename "$POSTGRES_DUMP")
  checksum_file="$POSTGRES_DUMP.sha256"

  if [[ -f "$checksum_file" ]]; then
    printf '校验 PostgreSQL dump 校验和：%s\n' "$checksum_file"
    (cd "$dump_dir" && sha256sum -c "$dump_file.sha256") >/dev/null
  else
    printf '未找到 PostgreSQL dump 校验和文件，继续执行结构校验：%s\n' "$checksum_file"
  fi

  printf '校验 PostgreSQL dump 结构可恢复...\n'
  docker run --rm \
    -v "$dump_dir:/backup:ro" \
    "${POSTGRES_IMAGE:-postgres:16-alpine}" \
    sh -eu -c 'pg_restore --list "/backup/'"$dump_file"'" >/dev/null'
}

verify_minio_snapshot() {
  local bucket_dir="$MINIO_DIR/${APP_MINIO_BUCKET:-agentloom-documents}"
  if [[ ! -d "$bucket_dir" ]]; then
    printf 'MinIO 备份目录中缺少 bucket 快照：%s\n' "$bucket_dir" >&2
    return 1
  fi
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
      --network "${COMPOSE_NETWORK:-agentloom-app}" \
      --entrypoint /bin/sh \
      "${MC_IMAGE:-minio/mc:RELEASE.2025-05-21T01-59-54Z}" \
      -eu -c '
        mc alias set target "'"${MINIO_SCHEME}"'://'"${APP_MINIO_ENDPOINT:-minio}"':'"${APP_MINIO_PORT:-9000}"'" "'"${APP_MINIO_ACCESS_KEY:-agentloom}"'" "'"${APP_MINIO_SECRET_KEY:-change-me-minio-password}"'" >/dev/null 2>&1
      ' >/dev/null 2>&1; then
      return 0
    fi
    sleep 2
    attempt=$((attempt + 1))
  done

  printf 'MinIO 未在预期时间内就绪。\n' >&2
  return 1
}

printf '执行恢复前校验...\n'
verify_postgres_dump
verify_minio_snapshot

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
  --network "${COMPOSE_NETWORK:-agentloom-app}" \
  -v "$MINIO_DIR:/restore:ro" \
  --entrypoint /bin/sh \
  "${MC_IMAGE:-minio/mc:RELEASE.2025-05-21T01-59-54Z}" \
  -eu -c '
    mc alias set target "'"${MINIO_SCHEME}"'://'"${APP_MINIO_ENDPOINT:-minio}"':'"${APP_MINIO_PORT:-9000}"'" "'"${APP_MINIO_ACCESS_KEY:-agentloom}"'" "'"${APP_MINIO_SECRET_KEY:-change-me-minio-password}"'"
    mc mb --ignore-existing "target/'"${APP_MINIO_BUCKET:-agentloom-documents}"'"
    mc mirror --overwrite --remove /restore/'"${APP_MINIO_BUCKET:-agentloom-documents}"' "target/'"${APP_MINIO_BUCKET:-agentloom-documents}"'"
  '

printf '重新启动应用层容器...\n'
compose up -d server worker studio reverse-proxy

printf '执行恢复后烟雾检查...\n'
compose exec -T postgres sh -lc 'PGPASSWORD="$POSTGRES_PASSWORD" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "select 1"' >/dev/null
compose exec -T server node -e "require('http').get('http://127.0.0.1:3000/api/v1/health', (res) => { if (res.statusCode !== 200) process.exit(1); res.resume(); res.on('end', () => process.exit(0)); }).on('error', () => process.exit(1))"
compose exec -T reverse-proxy sh -lc 'if command -v curl >/dev/null 2>&1; then curl -fsS http://127.0.0.1/healthz >/dev/null; else wget -q -O /dev/null http://127.0.0.1/healthz; fi'

printf '恢复完成：数据库、对象存储与基础健康检查均已通过。\n'
