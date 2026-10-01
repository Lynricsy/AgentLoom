#!/usr/bin/env bash
# 将 index.html 打印为 A4 PDF，并可选导出逐页预览 PNG（用于目视检查）。
# 用法：./build.sh [预览输出目录]
set -euo pipefail
cd "$(dirname "$0")"

OUT="AgentLoom-系统介绍.pdf"
chromium --headless=new --no-sandbox --disable-gpu --no-pdf-header-footer \
  --virtual-time-budget=5000 --print-to-pdf="$OUT" "file://$PWD/index.html" 2>/dev/null
pdfinfo "$OUT" | grep -E '^(Pages|Page size)'

if [[ $# -ge 1 ]]; then
  rm -rf "$1" && mkdir -p "$1"
  pdftoppm -r 80 -png "$OUT" "$1/p"
fi
