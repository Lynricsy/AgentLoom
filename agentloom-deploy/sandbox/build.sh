#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PREPARE_SCRIPT="$DEPLOY_DIR/scripts/prepare-pi-tarballs.sh"
TARBALLS_DIR="$SCRIPT_DIR/.pi-tarballs"

echo "==> [1/2] Preparing shared pi tarballs..."
bash "$PREPARE_SCRIPT"

echo "    Sandbox tarballs ready:"
ls -lh "$TARBALLS_DIR"

echo "==> [2/2] Building Docker image agentloom/sandbox:latest..."
docker build -t agentloom/sandbox:latest "$SCRIPT_DIR"

echo ""
echo "Done. agentloom/sandbox:latest is ready."
