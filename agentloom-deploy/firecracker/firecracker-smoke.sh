#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-$DEPLOY_ROOT/docker-compose.yml}"
VM_ID="${FIRECRACKER_SMOKE_VM_ID:-$(cat /proc/sys/kernel/random/uuid)}"
SESSION_ID="smoke-${VM_ID}"

manager_curl() {
  docker compose -f "$COMPOSE_FILE" exec -T firecracker-runtime \
    curl --fail --silent --show-error \
      --cacert /run/secrets/firecracker-manager-ca \
      --cert /run/secrets/firecracker-health-client-cert \
      --key /run/secrets/firecracker-health-client-key \
      "$@"
}

cleanup() {
  manager_curl -X DELETE "https://firecracker-runtime:8443/v1/vms/${VM_ID}?deleteDisk=true" >/dev/null 2>&1 || true
}
trap cleanup EXIT

manager_curl https://firecracker-runtime:8443/readyz >/dev/null
created="$(manager_curl \
  -H 'Content-Type: application/json' \
  -d "{\"id\":\"$VM_ID\",\"cpu\":1,\"memoryMiB\":1024,\"diskGiB\":2,\"lifecycleMode\":\"persistent\"}" \
  https://firecracker-runtime:8443/v1/vms)"
[[ "$(jq -r '.state' <<<"$created")" == "running" ]]
[[ "$(jq -r '.runtimeHandle' <<<"$created")" == "$VM_ID" ]]

health="$(manager_curl "https://firecracker-runtime:8443/v1/vms/$VM_ID/guest/health")"
[[ "$(jq -r '.status' <<<"$health")" == "ok" ]]
[[ "$(jq -r '.guestApiVersion' <<<"$health")" == "v1" ]]

ipv6_probe="$(manager_curl \
  -H 'Content-Type: application/json' \
  -d '{"command":"/usr/bin/test","args":["!","-e","/proc/net/if_inet6"],"cwd":"/workspace"}' \
  "https://firecracker-runtime:8443/v1/vms/$VM_ID/guest/v1/runtime/exec")"
ipv6_probe_id="$(jq -r '.execId' <<<"$ipv6_probe")"
ipv6_probe_wait="$(manager_curl "https://firecracker-runtime:8443/v1/vms/$VM_ID/guest/v1/runtime/exec/$ipv6_probe_id/wait")"
if [[ "$(jq -r '.exitCode' <<<"$ipv6_probe_wait")" != "0" ]]; then
  echo "guest kernel unexpectedly exposes IPv6" >&2
  exit 1
fi

manager_curl -X PUT -H 'Content-Type: text/plain' --data-binary 'firecracker-kvm-smoke' \
  "https://firecracker-runtime:8443/v1/vms/$VM_ID/guest/v1/runtime/files?path=%2Fworkspace%2Fsmoke.txt" >/dev/null
[[ "$(manager_curl "https://firecracker-runtime:8443/v1/vms/$VM_ID/guest/v1/runtime/files?path=%2Fworkspace%2Fsmoke.txt")" == "firecracker-kvm-smoke" ]]

exec_result="$(manager_curl \
  -H 'Content-Type: application/json' \
  -d '{"command":"/bin/cat","args":["/workspace/smoke.txt"],"cwd":"/workspace"}' \
  "https://firecracker-runtime:8443/v1/vms/$VM_ID/guest/v1/runtime/exec")"
exec_id="$(jq -r '.execId' <<<"$exec_result")"
wait_result="$(manager_curl "https://firecracker-runtime:8443/v1/vms/$VM_ID/guest/v1/runtime/exec/$exec_id/wait")"
[[ "$(jq -r '.exitCode' <<<"$wait_result")" == "0" ]]
output_result="$(manager_curl "https://firecracker-runtime:8443/v1/vms/$VM_ID/guest/v1/runtime/exec/$exec_id/output")"
[[ "$(jq -r '.data' <<<"$output_result" | base64 -d)" == "firecracker-kvm-smoke" ]]

https_exec="$(manager_curl \
  -H 'Content-Type: application/json' \
  -d '{"command":"/usr/bin/curl","args":["--fail","--silent","--show-error","--max-time","15","https://example.com/"],"cwd":"/workspace"}' \
  "https://firecracker-runtime:8443/v1/vms/$VM_ID/guest/v1/runtime/exec")"
https_exec_id="$(jq -r '.execId' <<<"$https_exec")"
https_wait="$(manager_curl "https://firecracker-runtime:8443/v1/vms/$VM_ID/guest/v1/runtime/exec/$https_exec_id/wait")"
https_output="$(manager_curl "https://firecracker-runtime:8443/v1/vms/$VM_ID/guest/v1/runtime/exec/$https_exec_id/output")"
https_output_text="$(jq -r '.data' <<<"$https_output" | base64 -d)"
if [[ "$(jq -r '.exitCode' <<<"$https_wait")" != "0" ]]; then
  echo "guest DNS/HTTPS probe failed: $https_output_text" >&2
  exit 1
fi
case "$https_output_text" in
  *"Example Domain"*) ;;
  *) echo "guest DNS/HTTPS probe returned unexpected content" >&2; exit 1 ;;
esac

spoof_setup="$(manager_curl \
  -H 'Content-Type: application/json' \
  -d '{"command":"/usr/bin/ip","args":["address","add","172.30.255.254/16","dev","eth0"],"cwd":"/workspace"}' \
  "https://firecracker-runtime:8443/v1/vms/$VM_ID/guest/v1/runtime/exec")"
spoof_setup_id="$(jq -r '.execId' <<<"$spoof_setup")"
spoof_setup_wait="$(manager_curl "https://firecracker-runtime:8443/v1/vms/$VM_ID/guest/v1/runtime/exec/$spoof_setup_id/wait")"
[[ "$(jq -r '.exitCode' <<<"$spoof_setup_wait")" == "0" ]]

spoof_probe="$(manager_curl \
  -H 'Content-Type: application/json' \
  -d '{"command":"/usr/bin/curl","args":["--fail","--silent","--show-error","--connect-timeout","2","--max-time","4","--interface","172.30.255.254","https://example.com/"],"cwd":"/workspace"}' \
  "https://firecracker-runtime:8443/v1/vms/$VM_ID/guest/v1/runtime/exec")"
spoof_probe_id="$(jq -r '.execId' <<<"$spoof_probe")"
spoof_probe_wait="$(manager_curl "https://firecracker-runtime:8443/v1/vms/$VM_ID/guest/v1/runtime/exec/$spoof_probe_id/wait")"
if [[ "$(jq -r '.exitCode' <<<"$spoof_probe_wait")" == "0" ]]; then
  echo "guest source-IP spoof bypassed host egress identity enforcement" >&2
  exit 1
fi

private_probe="$(manager_curl \
  -H 'Content-Type: application/json' \
  -d '{"command":"/usr/bin/curl","args":["--insecure","--silent","--show-error","--connect-timeout","2","--max-time","4","https://172.30.0.1:8443/healthz"],"cwd":"/workspace"}' \
  "https://firecracker-runtime:8443/v1/vms/$VM_ID/guest/v1/runtime/exec")"
private_probe_id="$(jq -r '.execId' <<<"$private_probe")"
private_probe_wait="$(manager_curl "https://firecracker-runtime:8443/v1/vms/$VM_ID/guest/v1/runtime/exec/$private_probe_id/wait")"
if [[ "$(jq -r '.exitCode' <<<"$private_probe_wait")" == "0" ]]; then
  echo "guest reached the manager control plane outside the callback relay" >&2
  exit 1
fi

session_result="$(manager_curl \
  -H 'Content-Type: application/json' \
  -d "{\"sessionId\":\"$SESSION_ID\",\"systemPrompt\":\"Reply exactly OK\",\"remoteToolExecution\":{\"sessionId\":\"$SESSION_ID\",\"callbackUrl\":\"http://server:3000/api/v1/agent-runtime/sessions/$SESSION_ID/tool-executions\",\"callbackToken\":\"smoke-callback-token\",\"tools\":[]}}" \
  "https://firecracker-runtime:8443/v1/vms/$VM_ID/guest/v1/session")"
[[ "$(jq -r '.sessionId' <<<"$session_result")" == "$SESSION_ID" ]]

pty_sessions="$(manager_curl "https://firecracker-runtime:8443/v1/vms/$VM_ID/guest/v1/pty/sessions")"
jq -e 'type == "array"' <<<"$pty_sessions" >/dev/null

sse="$(manager_curl --no-buffer --max-time 30 \
  -H 'Content-Type: application/json' \
  -d "{\"sessionId\":\"$SESSION_ID\",\"text\":\"Reply exactly OK\",\"permissionCallbackUrl\":\"http://server:3000/api/v1/agent-conversations/$SESSION_ID/tool-permission\"}" \
  "https://firecracker-runtime:8443/v1/vms/$VM_ID/guest/v1/prompt")"
case "$sse" in
  *'"type":"done"'*|*'"type":"error"'*) ;;
  *) echo "SSE prompt omitted a terminal event" >&2; exit 1 ;;
esac
abort_result="$(manager_curl \
  -H 'Content-Type: application/json' \
  -d "{\"sessionId\":\"$SESSION_ID\"}" \
  "https://firecracker-runtime:8443/v1/vms/$VM_ID/guest/v1/abort")"
[[ "$(jq -r '.success' <<<"$abort_result")" == "true" ]]

stopped="$(manager_curl -X POST "https://firecracker-runtime:8443/v1/vms/$VM_ID:stop")"
[[ "$(jq -r '.state' <<<"$stopped")" == "stopped" ]]
started="$(manager_curl -X POST "https://firecracker-runtime:8443/v1/vms/$VM_ID:start")"
[[ "$(jq -r '.state' <<<"$started")" == "running" ]]
[[ "$(manager_curl "https://firecracker-runtime:8443/v1/vms/$VM_ID/guest/v1/runtime/files?path=%2Fworkspace%2Fsmoke.txt")" == "firecracker-kvm-smoke" ]]

echo "Firecracker KVM smoke passed for $VM_ID"
