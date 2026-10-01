#!/usr/bin/env bash

set -euo pipefail

DEPLOY_DIR=$(cd "$(dirname "$0")/.." && pwd)
COMPOSE_FILE=${COMPOSE_FILE:-$DEPLOY_DIR/docker-compose.yml}
ENV_FILE=${ENV_FILE:-$DEPLOY_DIR/.env}
BACKUP_ROOT=${BACKUP_ROOT:-$DEPLOY_DIR/backups/minio}
TIMESTAMP=${TIMESTAMP:-$(date +%Y%m%d-%H%M%S)}
OUTPUT_DIR=${OUTPUT_DIR:-$BACKUP_ROOT/agentloom-minio-$TIMESTAMP}
RETENTION_DAYS=${MINIO_BACKUP_RETENTION_DAYS:-7}
METADATA_FILE=${METADATA_FILE:-$OUTPUT_DIR/backup.meta}

mkdir -p "$OUTPUT_DIR"

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

write_metadata() {
  cat >"$METADATA_FILE" <<EOF
created_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)
bucket=${APP_MINIO_BUCKET:-agentloom-documents}
source_endpoint=${MINIO_SCHEME}://${APP_MINIO_ENDPOINT:-minio}:${APP_MINIO_PORT:-9000}
backup_dir=$(basename "$OUTPUT_DIR")
restore_command=./agentloom-deploy/scripts/restore.sh --postgres-dump <postgres-dump> --minio-dir $OUTPUT_DIR
EOF
}

prune_old_backups() {
  if [[ "$RETENTION_DAYS" =~ ^[0-9]+$ ]] && (( RETENTION_DAYS >= 0 )); then
    find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d -name 'agentloom-minio-*' -mtime "+$RETENTION_DAYS" -exec rm -rf {} +
  else
    printf '跳过 MinIO 备份保留清理：MINIO_BACKUP_RETENTION_DAYS=%s 非法。\n' "$RETENTION_DAYS" >&2
  fi
}

MINIO_SCHEME=http
if [[ "${APP_MINIO_USE_SSL:-false}" == "true" ]]; then
  MINIO_SCHEME=https
fi

# MinIO 所在网络：docker-compose.yml 的 app_net，名字为 <AGENTLOOM_NETWORK_PREFIX>-app。
COMPOSE_NETWORK=${COMPOSE_NETWORK:-${AGENTLOOM_NETWORK_PREFIX:-agentloom}-app}
# docker run -v 只接受绝对路径。
OUTPUT_DIR=$(cd "$OUTPUT_DIR" && pwd)

printf '启动 MinIO（若尚未运行）...\n'
compose up -d --wait minio

printf '导出 MinIO bucket %s 到 %s ...\n' "${APP_MINIO_BUCKET:-agentloom-documents}" "$OUTPUT_DIR"
# bucket 不存在时 mc ls 失败（真正的错误）；bucket 为空时 mc mirror 不建目录，
# 先建好目标目录，空 bucket 得到一个空快照而不是失败。
docker run --rm \
  --network "$COMPOSE_NETWORK" \
  -v "$OUTPUT_DIR:/backup" \
  --entrypoint /bin/sh \
  "${MC_IMAGE:-pgsty/mc:RELEASE.2026-09-16T00-00-00Z}" \
  -eu -c '
    mc alias set source "'"$MINIO_SCHEME"'://'"${APP_MINIO_ENDPOINT:-minio}"':'"${APP_MINIO_PORT:-9000}"'" "'"${APP_MINIO_ACCESS_KEY:-agentloom}"'" "'"${APP_MINIO_SECRET_KEY:-change-me-minio-password}"'"
    mc ls "source/'"${APP_MINIO_BUCKET:-agentloom-documents}"'" >/dev/null
    mkdir -p /backup/'"${APP_MINIO_BUCKET:-agentloom-documents}"'
    mc mirror --overwrite "source/'"${APP_MINIO_BUCKET:-agentloom-documents}"'" /backup/'"${APP_MINIO_BUCKET:-agentloom-documents}"'
  '

if [[ ! -d "$OUTPUT_DIR/${APP_MINIO_BUCKET:-agentloom-documents}" ]]; then
  printf 'MinIO 备份目录中缺少 bucket 快照：%s\n' "$OUTPUT_DIR/${APP_MINIO_BUCKET:-agentloom-documents}" >&2
  exit 1
fi

write_metadata
prune_old_backups

printf 'MinIO 备份完成：%s\n' "$OUTPUT_DIR"
printf '元数据文件：%s\n' "$METADATA_FILE"
