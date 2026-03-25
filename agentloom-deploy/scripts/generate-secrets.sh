#!/usr/bin/env bash
# generate-secrets.sh — 一键生成 AgentLoom 私有部署所需的全部密钥
# 用法: ./scripts/generate-secrets.sh [--output .env]

set -euo pipefail

DEPLOY_DIR=$(cd "$(dirname "$0")/.." && pwd)
OUTPUT_FILE="${1:---output}"

if [[ "$OUTPUT_FILE" == "--output" ]]; then
  OUTPUT_FILE="${2:-$DEPLOY_DIR/.env}"
fi

# 如果 .env 已存在，防止意外覆盖
if [[ -f "$OUTPUT_FILE" ]]; then
  printf '⚠ 文件已存在: %s\n' "$OUTPUT_FILE"
  printf '  如需重新生成，请先删除或备份该文件。\n'
  exit 1
fi

# 工具检查
for cmd in openssl; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    printf '❌ 缺少必要工具: %s\n' "$cmd" >&2
    exit 1
  fi
done

# ---------- 密钥生成 ----------

# 安全密码（20 字符，仅字母数字，避免 URL 编码问题）
gen_password() {
  openssl rand -base64 30 | tr -dc 'a-zA-Z0-9' | head -c 20
}

# 32 字节 Base64 密钥
gen_base64_key() {
  openssl rand -base64 32
}

# 生成 HS256 JWT（Supabase anon/service-role key）
gen_supabase_jwt() {
  local role="$1"
  local secret="$2"
  local iat
  local exp

  iat=$(date +%s)
  exp=$((iat + 157680000)) # 5 年

  local header
  header=$(printf '{"alg":"HS256","typ":"JWT"}' | openssl base64 -e -A | tr '+/' '-_' | tr -d '=')

  local payload
  payload=$(printf '{"role":"%s","iss":"supabase","iat":%d,"exp":%d}' "$role" "$iat" "$exp" | openssl base64 -e -A | tr '+/' '-_' | tr -d '=')

  local signature
  signature=$(printf '%s.%s' "$header" "$payload" | openssl dgst -sha256 -hmac "$secret" -binary | openssl base64 -e -A | tr '+/' '-_' | tr -d '=')

  printf '%s.%s.%s' "$header" "$payload" "$signature"
}

printf '🔐 正在生成密钥...\n'

DB_PASSWORD=$(gen_password)
REDIS_PASSWORD=$(gen_password)
MINIO_PASSWORD=$(gen_password)
JWT_SECRET=$(gen_base64_key)
MASTER_ENCRYPTION_KEY=$(gen_base64_key)

ANON_KEY=$(gen_supabase_jwt "anon" "$JWT_SECRET")
SERVICE_KEY=$(gen_supabase_jwt "service_role" "$JWT_SECRET")

# ---------- 从模板生成 .env ----------

cp "$DEPLOY_DIR/.env.template" "$OUTPUT_FILE"

# 替换密码
sed -i "s|POSTGRES_PASSWORD=change-me-db-password|POSTGRES_PASSWORD=${DB_PASSWORD}|g" "$OUTPUT_FILE"
sed -i "s|APP_DATABASE_URL=postgresql://agentloom:change-me-db-password@postgres:5432/agentloom|APP_DATABASE_URL=postgresql://agentloom:${DB_PASSWORD}@postgres:5432/agentloom|g" "$OUTPUT_FILE"
sed -i "s|REDIS_PASSWORD=change-me-redis-password|REDIS_PASSWORD=${REDIS_PASSWORD}|g" "$OUTPUT_FILE"
sed -i "s|APP_REDIS_URL=redis://:change-me-redis-password@redis:6379/0|APP_REDIS_URL=redis://:${REDIS_PASSWORD}@redis:6379/0|g" "$OUTPUT_FILE"
sed -i "s|APP_MINIO_SECRET_KEY=change-me-minio-password|APP_MINIO_SECRET_KEY=${MINIO_PASSWORD}|g" "$OUTPUT_FILE"
sed -i "s|APP_JWT_SECRET=change-me-jwt-secret|APP_JWT_SECRET=${JWT_SECRET}|g" "$OUTPUT_FILE"
sed -i "s|APP_MASTER_ENCRYPTION_KEY=REPLACE_WITH_BASE64_32_BYTES|APP_MASTER_ENCRYPTION_KEY=${MASTER_ENCRYPTION_KEY}|g" "$OUTPUT_FILE"

# Supabase JWT secret 必须与 APP_JWT_SECRET 相同
sed -i "s|SUPABASE_JWT_SECRET=change-me-jwt-secret|SUPABASE_JWT_SECRET=${JWT_SECRET}|g" "$OUTPUT_FILE"

# 填充 Supabase 变量
sed -i "s|^APP_SUPABASE_URL=$|APP_SUPABASE_URL=http://supabase-kong:8000|" "$OUTPUT_FILE"
sed -i "s|^APP_SUPABASE_ANON_KEY=$|APP_SUPABASE_ANON_KEY=${ANON_KEY}|" "$OUTPUT_FILE"
sed -i "s|^APP_SUPABASE_SERVICE_KEY=$|APP_SUPABASE_SERVICE_KEY=${SERVICE_KEY}|" "$OUTPUT_FILE"
sed -i "s|^VITE_SUPABASE_URL=$|VITE_SUPABASE_URL=http://localhost:8000|" "$OUTPUT_FILE"
sed -i "s|^VITE_SUPABASE_ANON_KEY=$|VITE_SUPABASE_ANON_KEY=${ANON_KEY}|" "$OUTPUT_FILE"

chmod 600 "$OUTPUT_FILE"

printf '\n✅ 密钥已生成并写入: %s\n' "$OUTPUT_FILE"
printf '\n📋 生成的密钥摘要:\n'
printf '  DB 密码:              %s...\n' "${DB_PASSWORD:0:6}"
printf '  Redis 密码:           %s...\n' "${REDIS_PASSWORD:0:6}"
printf '  MinIO 密码:           %s...\n' "${MINIO_PASSWORD:0:6}"
printf '  JWT Secret:           %s...\n' "${JWT_SECRET:0:10}"
printf '  Master Encryption:    %s...\n' "${MASTER_ENCRYPTION_KEY:0:10}"
printf '  Supabase Anon Key:    %s...\n' "${ANON_KEY:0:20}"
printf '  Supabase Service Key: %s...\n' "${SERVICE_KEY:0:20}"
printf '\n⚠ 请妥善保管此文件，切勿提交到版本控制！\n'
printf '⚠ 生产环境请修改 APP_FRONTEND_URL / APP_OAUTH_REDIRECT_URL / SUPABASE_SITE_URL 为实际域名\n'
