#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
"$SCRIPT_DIR/build-artifacts.sh"
docker build \
  --file "$SCRIPT_DIR/runtime-manager.Dockerfile" \
  --tag agentloom/firecracker-runtime:1.16.1 \
  "$REPO_ROOT"
