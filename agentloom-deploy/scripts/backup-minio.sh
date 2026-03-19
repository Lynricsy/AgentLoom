#!/usr/bin/env bash

set -euo pipefail

DEPLOY_DIR=$(cd "$(dirname "$0")/.." && pwd)
COMPOSE_FILE=${COMPOSE_FILE:-$DEPLOY_DIR/docker-compose.yml}
ENV_FILE=${ENV_FILE:-$DEPLOY_DIR/.env}
BACKUP_ROOT=${BACKUP_ROOT:-$DEPLOY_DIR/backups/minio}
TIMESTAMP=${TIMESTAMP:-$(date +%Y%m%d-%H%M%S)}
OUTPUT_DIR=${OUTPUT_DIR:-$BACKUP_ROOT/agentloom-minio-$TIMESTAMP}

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

MINIO_SCHEME=http
if [[ "${APP_MINIO_USE_SSL:-false}" == "true" ]]; then
  MINIO_SCHEME=https
fi

printf '启动 MinIO（若尚未运行）...\n'
compose up -d minio

printf '导出 MinIO bucket %s 到 %s ...\n' "${APP_MINIO_BUCKET:-agentloom-documents}" "$OUTPUT_DIR"
docker run --rm \
  --network "${COMPOSE_NETWORK:-agentloom-private}" \
  -v "$OUTPUT_DIR:/backup" \
  "${MC_IMAGE:-minio/mc:latest}" \
  sh -eu -c '
    mc alias set source "'"$MINIO_SCHEME"'://'"${APP_MINIO_ENDPOINT:-minio}"':'"${APP_MINIO_PORT:-9000}"'" "'"${APP_MINIO_ACCESS_KEY:-agentloom}"'" "'"${APP_MINIO_SECRET_KEY:-change-me-minio-password}"'"
    mc mirror --overwrite "source/'"${APP_MINIO_BUCKET:-agentloom-documents}"'" /backup/'"${APP_MINIO_BUCKET:-agentloom-documents}"'
  '

printf 'MinIO 备份完成：%s\n' "$OUTPUT_DIR"
