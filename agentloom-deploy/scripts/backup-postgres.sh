#!/usr/bin/env bash

set -euo pipefail

DEPLOY_DIR=$(cd "$(dirname "$0")/.." && pwd)
COMPOSE_FILE=${COMPOSE_FILE:-$DEPLOY_DIR/docker-compose.yml}
ENV_FILE=${ENV_FILE:-$DEPLOY_DIR/.env}
BACKUP_ROOT=${BACKUP_ROOT:-$DEPLOY_DIR/backups/postgres}
TIMESTAMP=${TIMESTAMP:-$(date +%Y%m%d-%H%M%S)}
OUTPUT_FILE=${OUTPUT_FILE:-$BACKUP_ROOT/agentloom-postgres-$TIMESTAMP.dump}

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

printf '启动 PostgreSQL（若尚未运行）...\n'
compose up -d postgres

printf '导出 PostgreSQL 归档到 %s ...\n' "$OUTPUT_FILE"
compose exec -T postgres sh -lc 'PGPASSWORD="$POSTGRES_PASSWORD" pg_dump -Fc -U "$POSTGRES_USER" -d "$POSTGRES_DB"' > "$OUTPUT_FILE"

printf 'PostgreSQL 备份完成：%s\n' "$OUTPUT_FILE"
