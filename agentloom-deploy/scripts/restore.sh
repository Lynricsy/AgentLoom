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

# docker run -v 只接受绝对路径（相对路径会被当成命名卷），在任何破坏性操作前规范化。
POSTGRES_DUMP="$(cd "$(dirname "$POSTGRES_DUMP")" && pwd)/$(basename "$POSTGRES_DUMP")"
MINIO_DIR="$(cd "$MINIO_DIR" && pwd)"

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

# MinIO 所在网络：docker-compose.yml 的 app_net，名字为 <AGENTLOOM_NETWORK_PREFIX>-app。
COMPOSE_NETWORK=${COMPOSE_NETWORK:-${AGENTLOOM_NETWORK_PREFIX:-agentloom}-app}
MC_IMAGE=${MC_IMAGE:-pgsty/mc:RELEASE.2026-09-16T00-00-00Z}
BUCKET=${APP_MINIO_BUCKET:-agentloom-documents}

compose() {
  docker compose "${COMPOSE_ARGS[@]}" "$@"
}

# shellcheck source=lib/db.sh
source "$DEPLOY_DIR/scripts/lib/db.sh"

run_mc() {
  docker run --rm \
    --network "$COMPOSE_NETWORK" \
    -v "$MINIO_DIR:/restore:ro" \
    --entrypoint /bin/sh \
    "$MC_IMAGE" \
    -eu -c '
      mc alias set target "'"${MINIO_SCHEME}"'://'"${APP_MINIO_ENDPOINT:-minio}"':'"${APP_MINIO_PORT:-9000}"'" "'"${APP_MINIO_ACCESS_KEY:-agentloom}"'" "'"${APP_MINIO_SECRET_KEY:-change-me-minio-password}"'" >/dev/null
      '"$1"'
    '
}

verify_postgres_dump() {
  local dump_dir
  local dump_file
  local checksum_file

  dump_dir=$(dirname "$POSTGRES_DUMP")
  dump_file=$(basename "$POSTGRES_DUMP")
  checksum_file="$POSTGRES_DUMP.sha256"

  if [[ -f "$checksum_file" ]]; then
    printf '校验 PostgreSQL dump 校验和：%s\n' "$checksum_file"
    # 只取哈希值比对，兼容旧版写入绝对路径的 .sha256（备份被移动后路径失效）。
    local expected actual
    expected=$(awk '{print $1; exit}' "$checksum_file")
    actual=$(sha256sum "$POSTGRES_DUMP" | awk '{print $1}')
    if [[ "$expected" != "$actual" ]]; then
      printf 'PostgreSQL dump 校验和不匹配：%s\n' "$POSTGRES_DUMP" >&2
      return 1
    fi
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
  local bucket_dir="$MINIO_DIR/$BUCKET"
  if [[ ! -d "$bucket_dir" ]]; then
    printf 'MinIO 备份目录中缺少 bucket 快照：%s\n' "$bucket_dir" >&2
    return 1
  fi
}

wait_for_minio() {
  local retries=30
  local attempt=1
  while (( attempt <= retries )); do
    if run_mc 'mc ls target >/dev/null' >/dev/null 2>&1; then
      return 0
    fi
    sleep 2
    attempt=$((attempt + 1))
  done

  printf 'MinIO 未在预期时间内就绪（网络 %s，镜像 %s）。\n' "$COMPOSE_NETWORK" "$MC_IMAGE" >&2
  return 1
}

printf '执行恢复前校验...\n'
verify_postgres_dump
verify_minio_snapshot

printf '启动 PostgreSQL 与 MinIO ...\n'
compose up -d postgres minio
wait_for_postgres
# 用与正式恢复完全相同的网络、镜像与挂载探测一次：任何一项不可用都在删库之前失败。
wait_for_minio
run_mc 'test -d "/restore/'"$BUCKET"'"'

printf '停止应用层容器，避免恢复期间产生新写入...\n'
compose stop reverse-proxy studio server worker >/dev/null 2>&1 || true

printf '恢复 PostgreSQL：%s\n' "$POSTGRES_DUMP"
compose exec -T postgres sh -lc '
  PGPASSWORD="$POSTGRES_PASSWORD"
  export PGPASSWORD
  psql -U "$POSTGRES_USER" -d postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '\''$POSTGRES_DB'\'' AND pid <> pg_backend_pid();" >/dev/null
  dropdb --if-exists -U "$POSTGRES_USER" "$POSTGRES_DB"
  createdb -U "$POSTGRES_USER" "$POSTGRES_DB"
' >/dev/null
# dump 中的属主与 GRANT（例如 authenticated 角色的表权限，RLS 请求依赖它）必须原样恢复，
# 所以不加 --no-owner/--no-privileges；为此先确保这些集群级角色存在（新数据卷上没有）。
ensure_supabase_roles >/dev/null
compose exec -T postgres sh -lc 'PGPASSWORD="$POSTGRES_PASSWORD" pg_restore --exit-on-error --single-transaction -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < "$POSTGRES_DUMP"

printf '恢复 MinIO：%s\n' "$MINIO_DIR"
run_mc '
  mc mb --ignore-existing "target/'"$BUCKET"'"
  mc mirror --overwrite --remove "/restore/'"$BUCKET"'" "target/'"$BUCKET"'"
'

printf '重新启动应用层容器...\n'
compose up -d --wait server worker studio reverse-proxy

printf '执行恢复后烟雾检查...\n'
compose exec -T postgres sh -lc 'PGPASSWORD="$POSTGRES_PASSWORD" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "select 1"' >/dev/null
compose exec -T server node -e "require('http').get('http://127.0.0.1:3000/api/v1/health', (res) => { if (res.statusCode !== 200) process.exit(1); res.resume(); res.on('end', () => process.exit(0)); }).on('error', () => process.exit(1))"
compose exec -T reverse-proxy sh -lc 'if command -v curl >/dev/null 2>&1; then curl -fsS http://127.0.0.1/healthz >/dev/null; else wget -q -O /dev/null http://127.0.0.1/healthz; fi'

printf '恢复完成：数据库、对象存储与基础健康检查均已通过。\n'
