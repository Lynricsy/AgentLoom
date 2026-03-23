#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PI_MONO_DIR="/root/Projects/GitHub/pi-mono"
TARBALLS_DIR="$SCRIPT_DIR/.pi-tarballs"

echo "==> [1/4] Installing pi-mono dependencies..."
cd "$PI_MONO_DIR"
npm install

echo "==> [2/4] Building pi-mono packages in dependency order..."
cd "$PI_MONO_DIR/packages/tui"   && npm run build
cd "$PI_MONO_DIR/packages/ai"    && npm run build
cd "$PI_MONO_DIR/packages/agent" && npm run build
cd "$PI_MONO_DIR/packages/coding-agent" && npm run build

echo "==> [3/4] Packing tarballs -> $TARBALLS_DIR"
rm -rf "$TARBALLS_DIR"
mkdir -p "$TARBALLS_DIR"

pack_pkg() {
  local pkg_dir="$1"
  local dest_name="$2"
  cd "$pkg_dir"
  npm pack
  mv ./*.tgz "$TARBALLS_DIR/$dest_name"
}

pack_pkg "$PI_MONO_DIR/packages/tui"           "pi-tui.tgz"
pack_pkg "$PI_MONO_DIR/packages/ai"            "pi-ai.tgz"
pack_pkg "$PI_MONO_DIR/packages/agent"         "pi-agent-core.tgz"
pack_pkg "$PI_MONO_DIR/packages/coding-agent"  "pi-coding-agent.tgz"

echo "    Tarballs ready:"
ls -lh "$TARBALLS_DIR"

echo "==> [4/4] Building Docker image agentloom/sandbox:latest..."
cd "$SCRIPT_DIR"
docker build -t agentloom/sandbox:latest .

echo ""
echo "Done. agentloom/sandbox:latest is ready."
