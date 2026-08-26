#!/usr/bin/env bash
# 生成 runtime manager、应用客户端和 guest 的独立 mTLS 信任域。
set -euo pipefail

DEPLOY_DIR=$(cd "$(dirname "$0")/.." && pwd)
OUTPUT_DIR="${1:-$DEPLOY_DIR/secrets/firecracker}"

# server/worker 容器以非 root（node，uid/gid 1000）运行，而 compose 的 file secret
# 是宿主文件的 bind mount，数字 uid/gid 原样进入容器，且非 swarm 模式下 secrets 的
# uid/gid/mode 字段会被忽略。因此 app-client.key 必须按组可读，否则应用侧读 key 得
# EACCES，所有经 server/worker 创建的沙箱都会异步失败。
# 只放宽这一个文件：manager/guest/health-client 的 key 由 root 进程消费，保持 0600。
APP_RUNTIME_GID="${APP_RUNTIME_GID:-1000}"

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

# 见文件头说明：只有 app-client.key 由非 root 的 server/worker 读取。
chgrp "$APP_RUNTIME_GID" "$OUTPUT_DIR/app-client.key"
chmod 640 "$OUTPUT_DIR/app-client.key"

printf 'Firecracker PKI 已生成: %s\n' "$OUTPUT_DIR"
printf 'Manager Secret: kubectl create secret generic agentloom-firecracker-manager-pki --from-file=%s\n' "$OUTPUT_DIR"
printf 'Client Secret: kubectl create secret generic agentloom-firecracker-client-pki --from-file=manager-ca.crt=%s/manager-ca.crt --from-file=app-client.crt=%s/app-client.crt --from-file=app-client.key=%s/app-client.key\n' "$OUTPUT_DIR" "$OUTPUT_DIR" "$OUTPUT_DIR"
