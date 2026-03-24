#!/usr/bin/env bash
# 为 server.Dockerfile 准备 pi-mono tarballs
# 使用 npm pack 将 pi-ai 和 pi-agent-core 打包为稳定命名的 tgz 文件
set -euo pipefail

# ── 校验 PI_MONO_DIR ──────────────────────────────────────────────
if [[ -z "${PI_MONO_DIR:-}" ]]; then
  echo "ERROR: PI_MONO_DIR is not set." >&2
  echo "  Usage: PI_MONO_DIR=/path/to/pi-mono $0" >&2
  exit 1
fi

if [[ ! -d "$PI_MONO_DIR/packages/ai" ]]; then
  echo "ERROR: $PI_MONO_DIR/packages/ai does not exist." >&2
  exit 1
fi

if [[ ! -d "$PI_MONO_DIR/packages/agent" ]]; then
  echo "ERROR: $PI_MONO_DIR/packages/agent does not exist." >&2
  exit 1
fi

# ── 输出目录 ──────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARBALLS_DIR="$SCRIPT_DIR/../docker/.pi-tarballs"

echo "==> [1/3] Building pi-mono packages..."
cd "$PI_MONO_DIR"
npm install
cd "$PI_MONO_DIR/packages/ai"    && npm run build
cd "$PI_MONO_DIR/packages/agent" && npm run build

echo "==> [2/3] Packing tarballs -> $TARBALLS_DIR"
rm -rf "$TARBALLS_DIR"
mkdir -p "$TARBALLS_DIR"

pack_pkg() {
  local pkg_dir="$1"
  local dest_name="$2"
  cd "$pkg_dir"
  npm pack --pack-destination "$TARBALLS_DIR"
  # npm pack 生成 mariozechner-pi-*.tgz，重命名为稳定文件名
  mv "$TARBALLS_DIR"/mariozechner-*.tgz "$TARBALLS_DIR/$dest_name" 2>/dev/null \
    || mv "$TARBALLS_DIR"/*.tgz "$TARBALLS_DIR/$dest_name"
}

pack_pkg "$PI_MONO_DIR/packages/ai"    "pi-ai.tgz"
pack_pkg "$PI_MONO_DIR/packages/agent" "pi-agent-core.tgz"

echo "==> [3/3] Tarballs ready:"
ls -lh "$TARBALLS_DIR"

echo ""
echo "Done. Run 'docker build -f agentloom-deploy/docker/server.Dockerfile .' from project root."
