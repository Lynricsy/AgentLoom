#!/usr/bin/env bash
# 生成 runtime manager、应用客户端和 guest 的独立 mTLS 信任域。
set -euo pipefail

DEPLOY_DIR=$(cd "$(dirname "$0")/.." && pwd)
OUTPUT_DIR="${1:-$DEPLOY_DIR/secrets/firecracker}"

if [[ -e "$OUTPUT_DIR" ]]; then
  printf '拒绝覆盖已有 Firecracker PKI 目录: %s\n' "$OUTPUT_DIR" >&2
  exit 1
fi
command -v openssl >/dev/null 2>&1 || {
  printf '缺少必要工具: openssl\n' >&2
  exit 1
}

mkdir -p "$OUTPUT_DIR"
chmod 700 "$OUTPUT_DIR"
WORK_DIR=$(mktemp -d)
trap 'rm -rf "$WORK_DIR"' EXIT

create_ca() {
  local prefix="$1"
  local common_name="$2"
  openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:4096 -out "$OUTPUT_DIR/$prefix-ca.key" >/dev/null 2>&1
  openssl req -x509 -new -sha256 -days 3650 \
    -key "$OUTPUT_DIR/$prefix-ca.key" \
    -subj "/CN=$common_name" \
    -out "$OUTPUT_DIR/$prefix-ca.crt"
}

sign_cert() {
  local name="$1"
  local common_name="$2"
  local ca_prefix="$3"
  local extended_usage="$4"
  local san="$5"
  openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:3072 -out "$OUTPUT_DIR/$name.key" >/dev/null 2>&1
  openssl req -new -sha256 -key "$OUTPUT_DIR/$name.key" -subj "/CN=$common_name" -out "$WORK_DIR/$name.csr"
  cat >"$WORK_DIR/$name.ext" <<EOF
basicConstraints=critical,CA:FALSE
keyUsage=critical,digitalSignature,keyEncipherment
extendedKeyUsage=$extended_usage
subjectAltName=$san
EOF
  openssl x509 -req -sha256 -days 825 \
    -in "$WORK_DIR/$name.csr" \
    -CA "$OUTPUT_DIR/$ca_prefix-ca.crt" \
    -CAkey "$OUTPUT_DIR/$ca_prefix-ca.key" \
    -CAcreateserial \
    -extfile "$WORK_DIR/$name.ext" \
    -out "$OUTPUT_DIR/$name.crt" >/dev/null 2>&1
}

create_ca manager 'AgentLoom Firecracker Manager CA'
create_ca client 'AgentLoom Firecracker Client CA'
create_ca guest 'AgentLoom Firecracker Guest CA'
sign_cert manager firecracker-runtime manager serverAuth 'DNS:firecracker-runtime,DNS:agentloom-firecracker-runtime,DNS:localhost,IP:127.0.0.1'
sign_cert app-client agentloom-runtime-client client clientAuth 'DNS:agentloom-runtime-client'
sign_cert health-client agentloom-runtime-health client clientAuth 'DNS:agentloom-runtime-health'

rm -f "$OUTPUT_DIR"/*.srl
chmod 600 "$OUTPUT_DIR"/*.key
chmod 644 "$OUTPUT_DIR"/*.crt

printf 'Firecracker PKI 已生成: %s\n' "$OUTPUT_DIR"
printf 'Manager Secret: kubectl create secret generic agentloom-firecracker-manager-pki --from-file=%s\n' "$OUTPUT_DIR"
printf 'Client Secret: kubectl create secret generic agentloom-firecracker-client-pki --from-file=manager-ca.crt=%s/manager-ca.crt --from-file=app-client.crt=%s/app-client.crt --from-file=app-client.key=%s/app-client.key\n' "$OUTPUT_DIR" "$OUTPUT_DIR" "$OUTPUT_DIR"
