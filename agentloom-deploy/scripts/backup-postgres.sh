#!/usr/bin/env bash

set -euo pipefail

DEPLOY_DIR=$(cd "$(dirname "$0")/.." && pwd)
COMPOSE_FILE=${COMPOSE_FILE:-$DEPLOY_DIR/docker-compose.yml}
ENV_FILE=${ENV_FILE:-$DEPLOY_DIR/.env}
BACKUP_ROOT=${BACKUP_ROOT:-$DEPLOY_DIR/backups/postgres}
TIMESTAMP=${TIMESTAMP:-$(date +%Y%m%d-%H%M%S)}
OUTPUT_FILE=${OUTPUT_FILE:-$BACKUP_ROOT/agentloom-postgres-$TIMESTAMP.dump}
RETENTION_DAYS=${POSTGRES_BACKUP_RETENTION_DAYS:-7}
OUTPUT_BASENAME=$(basename "$OUTPUT_FILE")
CHECKSUM_FILE=${CHECKSUM_FILE:-$OUTPUT_FILE.sha256}
METADATA_FILE=${METADATA_FILE:-$OUTPUT_FILE.meta}

mkdir -p "$BACKUP_ROOT"

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

verify_dump() {
  local dump_dir
  dump_dir=$(cd "$(dirname "$OUTPUT_FILE")" && pwd)

  printf '校验 PostgreSQL 归档可被 pg_restore 读取...\n'
  docker run --rm \
    -v "$dump_dir:/backup:ro" \
    "${POSTGRES_IMAGE:-postgres:16-alpine}" \
    sh -eu -c 'pg_restore --list "/backup/'"$OUTPUT_BASENAME"'" >/dev/null'
}

write_metadata() {
  cat >"$METADATA_FILE" <<EOF
created_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)
format=pg_dump -Fc
database=${POSTGRES_DB:-agentloom}
backup_file=$(basename "$OUTPUT_FILE")
checksum_file=$(basename "$CHECKSUM_FILE")
restore_command=./agentloom-deploy/scripts/restore.sh --postgres-dump $OUTPUT_FILE --minio-dir <minio-backup-dir>
EOF
}

prune_old_backups() {
  if [[ "$RETENTION_DAYS" =~ ^[0-9]+$ ]] && (( RETENTION_DAYS >= 0 )); then
    find "$BACKUP_ROOT" -type f \( -name 'agentloom-postgres-*.dump' -o -name 'agentloom-postgres-*.dump.sha256' -o -name 'agentloom-postgres-*.dump.meta' \) -mtime "+$RETENTION_DAYS" -delete
  else
    printf '跳过 PostgreSQL 备份保留清理：POSTGRES_BACKUP_RETENTION_DAYS=%s 非法。\n' "$RETENTION_DAYS" >&2
  fi
}

printf '启动 PostgreSQL（若尚未运行）...\n'
compose up -d postgres

printf '导出 PostgreSQL 归档到 %s ...\n' "$OUTPUT_FILE"
compose exec -T postgres sh -lc 'PGPASSWORD="$POSTGRES_PASSWORD" pg_dump -Fc -U "$POSTGRES_USER" -d "$POSTGRES_DB"' > "$OUTPUT_FILE"

if [[ ! -s "$OUTPUT_FILE" ]]; then
  printf 'PostgreSQL 备份文件为空：%s\n' "$OUTPUT_FILE" >&2
  exit 1
fi

sha256sum "$OUTPUT_FILE" > "$CHECKSUM_FILE"
verify_dump
write_metadata
prune_old_backups

printf 'PostgreSQL 备份完成：%s\n' "$OUTPUT_FILE"
printf '校验和文件：%s\n' "$CHECKSUM_FILE"
printf '元数据文件：%s\n' "$METADATA_FILE"
