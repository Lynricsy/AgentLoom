#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
REPO_ROOT="$(cd "$DEPLOY_ROOT/.." && pwd)"
COMPOSE=(docker compose -f "$DEPLOY_ROOT/docker-compose.yml")
RUN_ID="${CUTOVER_REHEARSAL_RUN_ID:-$(date +%s)-$$}"
DB_NAME="cutover_rehearsal_${RUN_ID//-/_}"
FRESH_DB_NAME="cutover_fresh_${RUN_ID//-/_}"
DB_ROLE="cutover_rehearsal"
DB_PASSWORD="cutover-rehearsal-only"
BUCKET="cutover-rehearsal-$RUN_ID"
MC_CONFIG_DIR="/tmp/agentloom-cutover-mc-$RUN_ID"
QUEUE_PREFIX="bull:cutover-rehearsal-$RUN_ID"
AGENT_QUEUE_PREFIX="bull:cutover-agent-rehearsal-$RUN_ID"
TENANT_ID="10000000-0000-4000-8000-000000000001"
UNIQUE_SESSION="10000000-0000-4000-8000-000000000011"
SHARED_SESSION_A="10000000-0000-4000-8000-000000000021"
SHARED_SESSION_B="10000000-0000-4000-8000-000000000022"
SHARED_WORKSPACE="10000000-0000-4000-8000-000000000031"
UNIQUE_VOLUME="sandbox-$UNIQUE_SESSION-workspace"
SHARED_VOLUME="workspace-$SHARED_WORKSPACE-volume"
UNIQUE_CONTAINER="agentloom-cutover-$RUN_ID-unique"
SHARED_CONTAINER_A="agentloom-cutover-$RUN_ID-shared-a"
SHARED_CONTAINER_B="agentloom-cutover-$RUN_ID-shared-b"
DATABASE_URL="postgresql://$DB_ROLE:$DB_PASSWORD@postgres:5432/$DB_NAME?sslmode=disable"

POSTGRES_USER=""
MINIO_USER=""
MINIO_PASSWORD=""
REDIS_URL=""
REDIS_PASSWORD=""

log() {
  printf '[cutover-rehearsal] %s\n' "$*"
}

fail() {
  printf '[cutover-rehearsal] ERROR: %s\n' "$*" >&2
  exit 1
}

compose_exec() {
  "${COMPOSE[@]}" exec -T "$@"
}

manager_curl() {
  compose_exec firecracker-runtime curl --fail --silent --show-error \
    --cacert /run/secrets/firecracker-manager-ca \
    --cert /run/secrets/firecracker-health-client-cert \
    --key /run/secrets/firecracker-health-client-key "$@"
}

psql_admin() {
  compose_exec postgres psql --set=ON_ERROR_STOP=1 --username "$POSTGRES_USER" "$@"
}

psql_rehearsal() {
  psql_admin --dbname "$DB_NAME" "$@"
}

query() {
  psql_rehearsal --tuples-only --no-align --command "$1"
}

assert_eq() {
  local expected="$1"
  local actual="$2"
  local message="$3"
  if [[ "$actual" != "$expected" ]]; then
    fail "$message: expected '$expected', got '$actual'"
  fi
}

minio_mc() {
  compose_exec minio env MC_CONFIG_DIR="$MC_CONFIG_DIR" mc "$@"
}

redis_cli() {
  compose_exec redis redis-cli --no-auth-warning -a "$REDIS_PASSWORD" "$@"
}

run_cutover() {
  "${COMPOSE[@]}" --profile migration run --rm --no-deps \
    -e APP_DATABASE_URL="$DATABASE_URL" \
    -e APP_REDIS_URL="$REDIS_URL" \
    -e APP_MINIO_ENDPOINT=minio:9000 \
    -e APP_MINIO_PORT=9000 \
    -e APP_MINIO_ACCESS_KEY="$MINIO_USER" \
    -e APP_MINIO_SECRET_KEY="$MINIO_PASSWORD" \
    -e APP_MINIO_BUCKET="$BUCKET" \
    -e APP_MINIO_USE_SSL=false \
    -e APP_SANDBOX_MAINTENANCE_MODE=true \
    -e APP_SANDBOX_LIFECYCLE_QUEUE_PREFIX="$QUEUE_PREFIX" \
    -e APP_AGENT_CONVERSATION_EXECUTION_QUEUE_PREFIX="$AGENT_QUEUE_PREFIX" \
    -e APP_SANDBOX_ROLLBACK_HOURS=0 \
    sandbox-cutover "$1"
}

expect_cutover_failure() {
  local command="$1"
  if run_cutover "$command" >/tmp/agentloom-cutover-rehearsal-error.log 2>&1; then
    fail "sandbox-cutover $command unexpectedly succeeded"
  fi
}

cleanup() {
  set +e
  for session_id in "$UNIQUE_SESSION" "$SHARED_SESSION_A" "$SHARED_SESSION_B"; do
    manager_curl -X DELETE \
      "https://firecracker-runtime:8443/v1/vms/$session_id?deleteDisk=true" >/dev/null 2>&1
  done
  docker rm -f "$UNIQUE_CONTAINER" "$SHARED_CONTAINER_A" "$SHARED_CONTAINER_B" >/dev/null 2>&1
  docker volume rm "$UNIQUE_VOLUME" "$SHARED_VOLUME" >/dev/null 2>&1
  if [[ -n "$MINIO_USER" && -n "$MINIO_PASSWORD" ]]; then
    minio_mc alias set rehearsal http://localhost:9000 "$MINIO_USER" "$MINIO_PASSWORD" >/dev/null 2>&1
    minio_mc rb --force "rehearsal/$BUCKET" >/dev/null 2>&1
  fi
  redis_cli DEL \
    "$QUEUE_PREFIX:active" "$QUEUE_PREFIX:wait" "$QUEUE_PREFIX:paused" \
    "$QUEUE_PREFIX:prioritized" "$QUEUE_PREFIX:waiting-children" "$QUEUE_PREFIX:meta" \
    "$AGENT_QUEUE_PREFIX:active" "$AGENT_QUEUE_PREFIX:wait" "$AGENT_QUEUE_PREFIX:paused" \
    "$AGENT_QUEUE_PREFIX:prioritized" "$AGENT_QUEUE_PREFIX:waiting-children" \
    "$AGENT_QUEUE_PREFIX:delayed" >/dev/null 2>&1
  if [[ -n "$POSTGRES_USER" ]]; then
    psql_admin --dbname postgres --command \
      "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname IN ('$DB_NAME', '$FRESH_DB_NAME') AND pid <> pg_backend_pid();" >/dev/null 2>&1
    psql_admin --dbname postgres --command "DROP DATABASE IF EXISTS \"$DB_NAME\";" >/dev/null 2>&1
    psql_admin --dbname postgres --command "DROP DATABASE IF EXISTS \"$FRESH_DB_NAME\";" >/dev/null 2>&1
    psql_admin --dbname postgres --command "DROP ROLE IF EXISTS $DB_ROLE;" >/dev/null 2>&1
  fi
  rm -f /tmp/agentloom-cutover-rehearsal-error.log
}
trap cleanup EXIT

log 'checking required services and host capabilities'
compose_exec firecracker-runtime sh -ceu 'test -r /dev/kvm; test -c /dev/net/tun'
manager_curl https://firecracker-runtime:8443/readyz >/dev/null
POSTGRES_USER="$(compose_exec postgres printenv POSTGRES_USER | tr -d '\r')"
MINIO_USER="$(compose_exec minio printenv MINIO_ROOT_USER | tr -d '\r')"
MINIO_PASSWORD="$(compose_exec minio printenv MINIO_ROOT_PASSWORD | tr -d '\r')"
REDIS_URL="$(compose_exec server printenv APP_REDIS_URL | tr -d '\r')"
REDIS_PASSWORD="$(compose_exec redis printenv REDIS_PASSWORD | tr -d '\r')"
[[ -n "$POSTGRES_USER" && -n "$MINIO_USER" && -n "$MINIO_PASSWORD" && -n "$REDIS_URL" && -n "$REDIS_PASSWORD" ]] || fail 'service credentials are unavailable'

log 'creating isolated PostgreSQL schema and MinIO bucket'
psql_admin --dbname postgres --command "DROP DATABASE IF EXISTS \"$DB_NAME\";" >/dev/null
psql_admin --dbname postgres --command "DROP DATABASE IF EXISTS \"$FRESH_DB_NAME\";" >/dev/null
psql_admin --dbname postgres --command "DROP ROLE IF EXISTS $DB_ROLE;" >/dev/null
psql_admin --dbname postgres --command "CREATE ROLE $DB_ROLE LOGIN PASSWORD '$DB_PASSWORD';" >/dev/null
psql_admin --dbname postgres --command "CREATE DATABASE \"$DB_NAME\" OWNER $DB_ROLE;" >/dev/null
psql_rehearsal <<SQL
SET ROLE $DB_ROLE;
CREATE TABLE sandbox_sessions (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  container_id varchar(128),
  runtime_handle varchar(128),
  status text NOT NULL,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  stopped_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE workflow_executions (id uuid PRIMARY KEY, status text NOT NULL);
CREATE TABLE agent_conversations (id uuid PRIMARY KEY, metadata jsonb NOT NULL DEFAULT '{}'::jsonb);
CREATE TABLE workspace_snapshots (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  storage_key text,
  config jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE TABLE workspace_runtime_leases (
  workspace_id uuid NOT NULL,
  tenant_id uuid NOT NULL,
  sandbox_session_id uuid NOT NULL,
  lease_expires_at timestamptz NOT NULL
);
CREATE TABLE sandbox_runtime_migrations (
  sandbox_session_id uuid PRIMARY KEY REFERENCES sandbox_sessions(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL,
  legacy_container_id varchar(128) NOT NULL,
  source_workspace_identity varchar(512) NOT NULL,
  archive_object_key varchar(1024),
  manifest_object_key varchar(1024),
  archive_sha256 varchar(64),
  manifest_sha256 varchar(64),
  file_count bigint,
  total_bytes bigint,
  status text NOT NULL DEFAULT 'pending',
  error text,
  archived_at timestamptz,
  restored_at timestamptz,
  verified_at timestamptz,
  finalized_at timestamptz,
  rolled_back_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
RESET ROLE;
SQL
minio_mc alias set rehearsal http://localhost:9000 "$MINIO_USER" "$MINIO_PASSWORD" >/dev/null
minio_mc mb --ignore-existing "rehearsal/$BUCKET" >/dev/null

log 'creating legacy Docker volumes, containers, and workspace fixtures'
docker volume create "$UNIQUE_VOLUME" >/dev/null
docker volume create "$SHARED_VOLUME" >/dev/null
docker run -d --name "$UNIQUE_CONTAINER" --mount "source=$UNIQUE_VOLUME,target=/workspace" alpine:3.23 sleep infinity >/dev/null
docker run -d --name "$SHARED_CONTAINER_A" --mount "source=$SHARED_VOLUME,target=/workspace" alpine:3.23 sleep infinity >/dev/null
docker run -d --name "$SHARED_CONTAINER_B" --mount "source=$SHARED_VOLUME,target=/workspace" alpine:3.23 sleep infinity >/dev/null
docker exec "$UNIQUE_CONTAINER" sh -ceu "printf 'unique text\n' > /workspace/text.txt; printf '\\000\\001\\177\\377' > /workspace/binary.bin; mkdir -p /workspace/empty-dir; printf 'unicode\n' > /workspace/'路径.txt'; ln -s text.txt /workspace/text-link"
docker exec "$SHARED_CONTAINER_A" sh -ceu "printf 'shared text\n' > /workspace/shared.txt; printf '\\002\\003\\176\\376' > /workspace/shared.bin; mkdir -p /workspace/shared-empty; printf '共享\n' > /workspace/'共享.txt'; ln -s shared.txt /workspace/shared-link"

UNIQUE_CONTAINER_ID="$(docker inspect --format '{{.Id}}' "$UNIQUE_CONTAINER")"
SHARED_CONTAINER_A_ID="$(docker inspect --format '{{.Id}}' "$SHARED_CONTAINER_A")"
SHARED_CONTAINER_B_ID="$(docker inspect --format '{{.Id}}' "$SHARED_CONTAINER_B")"
psql_rehearsal <<SQL
SET ROLE $DB_ROLE;
INSERT INTO sandbox_sessions (id, tenant_id, container_id, status, config) VALUES
  ('$UNIQUE_SESSION', '$TENANT_ID', '$UNIQUE_CONTAINER_ID', 'stopped', '{"lifecycleMode":"persistent","cpu":1,"memory":1024,"disk":2}'),
  ('$SHARED_SESSION_A', '$TENANT_ID', '$SHARED_CONTAINER_A_ID', 'stopped', '{"lifecycleMode":"persistent","cpu":1,"memory":1024,"disk":2,"restoreWorkspaceId":"$SHARED_WORKSPACE"}'),
  ('$SHARED_SESSION_B', '$TENANT_ID', '$SHARED_CONTAINER_B_ID', 'stopped', '{"lifecycleMode":"persistent","cpu":1,"memory":1024,"disk":2,"restoreWorkspaceId":"$SHARED_WORKSPACE"}');
INSERT INTO workspace_snapshots (id, tenant_id, storage_key, config)
VALUES ('$SHARED_WORKSPACE', '$TENANT_ID', 'rehearsal/snapshot.tar.zst', '{}'::jsonb);
INSERT INTO workspace_runtime_leases (workspace_id, tenant_id, sandbox_session_id, lease_expires_at)
VALUES ('$SHARED_WORKSPACE', '$TENANT_ID', '$SHARED_SESSION_A', now() + interval '1 hour');
RESET ROLE;
SQL

log 'verifying maintenance, drain, and queue fail-closed gates'
if "${COMPOSE[@]}" --profile migration run --rm --no-deps \
  -e APP_SANDBOX_MAINTENANCE_MODE=false sandbox-cutover export \
  >/tmp/agentloom-cutover-rehearsal-error.log 2>&1; then
  fail 'cutover accepted maintenance mode=false'
fi
psql_rehearsal --command "UPDATE sandbox_sessions SET status='busy' WHERE id='$UNIQUE_SESSION';" >/dev/null
expect_cutover_failure export
psql_rehearsal --command "UPDATE sandbox_sessions SET status='stopped' WHERE id='$UNIQUE_SESSION';" >/dev/null
redis_cli LPUSH "$QUEUE_PREFIX:active" stale-job >/dev/null
expect_cutover_failure export
redis_cli DEL "$QUEUE_PREFIX:active" >/dev/null

log 'exporting legacy workspaces to MinIO'
run_cutover export >/dev/null
assert_eq '3' "$(query "SELECT count(*) FROM sandbox_runtime_migrations WHERE status='archived';")" 'not all migrations archived'
ARCHIVE_KEY="$(query "SELECT archive_object_key FROM sandbox_runtime_migrations ORDER BY sandbox_session_id LIMIT 1;")"
[[ -n "$ARCHIVE_KEY" ]] || fail 'archive key was not recorded'

log 'proving truncated archive restore fails without switching runtime handles'
minio_mc cp "rehearsal/$BUCKET/$ARCHIVE_KEY" "/tmp/cutover-original-$RUN_ID.tar.zst" >/dev/null
compose_exec minio sh -ceu "dd if=/tmp/cutover-original-$RUN_ID.tar.zst of=/tmp/cutover-truncated-$RUN_ID.tar.zst bs=1 count=128 2>/dev/null"
minio_mc cp "/tmp/cutover-truncated-$RUN_ID.tar.zst" "rehearsal/$BUCKET/$ARCHIVE_KEY" >/dev/null
expect_cutover_failure restore
assert_eq '0' "$(query 'SELECT count(*) FROM sandbox_sessions WHERE runtime_handle IS NOT NULL;')" 'failed restore switched runtime handles'
minio_mc cp "/tmp/cutover-original-$RUN_ID.tar.zst" "rehearsal/$BUCKET/$ARCHIVE_KEY" >/dev/null

log 'restoring and verifying manifests inside real KVM guests'
run_cutover restore >/dev/null
assert_eq '3' "$(query "SELECT count(*) FROM sandbox_runtime_migrations WHERE status='verified';")" 'not all migrations verified'
manager_curl -X POST "https://firecracker-runtime:8443/v1/vms/$SHARED_SESSION_A:start" >/dev/null
if manager_curl -X POST "https://firecracker-runtime:8443/v1/vms/$SHARED_SESSION_B:start" >/tmp/agentloom-cutover-rehearsal-error.log 2>&1; then
  fail 'two active VMs acquired the same workspace identity'
fi
manager_curl -X POST "https://firecracker-runtime:8443/v1/vms/$SHARED_SESSION_A:stop" >/dev/null

log 'activating Firecracker handles, writing after cutover, and rolling back latest data'
run_cutover activate >/dev/null
assert_eq '3' "$(query 'SELECT count(*) FROM sandbox_sessions WHERE runtime_handle = id::text;')" 'runtime handles were not activated'
manager_curl -X POST "https://firecracker-runtime:8443/v1/vms/$UNIQUE_SESSION:start" >/dev/null
printf 'post-cutover-write\n' | manager_curl -X PUT -H 'Content-Type: text/plain' --data-binary @- \
  "https://firecracker-runtime:8443/v1/vms/$UNIQUE_SESSION/guest/v1/runtime/files?path=%2Fworkspace%2Fpost-cutover.txt" >/dev/null
run_cutover rollback >/dev/null
assert_eq '3' "$(query "SELECT count(*) FROM sandbox_runtime_migrations WHERE status='rolled_back';")" 'rollback status did not converge'
assert_eq 'post-cutover-write' "$(docker exec "$UNIQUE_CONTAINER" cat /workspace/post-cutover.txt)" 'rollback lost a post-cutover workspace write'

log 'repeating forward cutover and finalizing legacy resources'
run_cutover export >/dev/null
run_cutover restore >/dev/null
run_cutover activate >/dev/null
run_cutover finalize >/dev/null
assert_eq '3' "$(query "SELECT count(*) FROM sandbox_runtime_migrations WHERE status='finalized';")" 'finalization status did not converge'
assert_eq '0' "$(query "SELECT count(*) FROM information_schema.columns WHERE table_name='sandbox_sessions' AND column_name='container_id';")" 'legacy container_id column still exists'
for container_name in "$UNIQUE_CONTAINER" "$SHARED_CONTAINER_A" "$SHARED_CONTAINER_B"; do
  if docker inspect "$container_name" >/dev/null 2>&1; then
    fail "legacy container $container_name still exists after finalize"
  fi
done
for volume_name in "$UNIQUE_VOLUME" "$SHARED_VOLUME"; do
  if docker volume inspect "$volume_name" >/dev/null 2>&1; then
    fail "legacy volume $volume_name still exists after finalize"
  fi
done

log 'verifying empty-database migration drops container_id immediately'
psql_admin --dbname postgres --command "CREATE DATABASE \"$FRESH_DB_NAME\" OWNER $DB_ROLE;" >/dev/null
psql_admin --dbname "$FRESH_DB_NAME" <<SQL
SET ROLE $DB_ROLE;
CREATE TABLE sandbox_sessions (id uuid PRIMARY KEY, container_id varchar(128));
RESET ROLE;
SQL
psql_admin --dbname "$FRESH_DB_NAME" < "$REPO_ROOT/agentloom-server/src/database/migrations/0074_sandbox_runtime_handle.sql"
FRESH_CONTAINER_COLUMN="$(psql_admin --dbname "$FRESH_DB_NAME" --tuples-only --no-align --command "SELECT count(*) FROM information_schema.columns WHERE table_name='sandbox_sessions' AND column_name='container_id';")"
assert_eq '0' "$FRESH_CONTAINER_COLUMN" 'fresh install retained legacy container_id'

log 'cutover rehearsal passed'
