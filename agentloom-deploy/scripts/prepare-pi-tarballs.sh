#!/usr/bin/env bash
# 为 server/worker 与 sandbox 共用的 pi tarballs 准备统一产物。
# 默认从 GitHub 拉取 earendil-works/pi；如需复用本地 checkout，可显式设置 PI_MONO_DIR。
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
readonly SCRIPT_DIR DEPLOY_DIR

PI_MONO_REPO_URL="${PI_MONO_REPO_URL:-https://github.com/earendil-works/pi}"
PI_MONO_REF="${PI_MONO_REF:-b79e4cc834970cca69daebffab7df1da7d1e52c4}"

DEFAULT_OUTPUT_DIRS=(
  "$DEPLOY_DIR/docker/.pi-tarballs"
  "$DEPLOY_DIR/sandbox/.pi-tarballs"
)

OUTPUT_DIRS=("$@")
if [[ ${#OUTPUT_DIRS[@]} -eq 0 ]]; then
  OUTPUT_DIRS=("${DEFAULT_OUTPUT_DIRS[@]}")
fi

TMP_ROOT="$(mktemp -d -t agentloom-pi-mono-XXXXXX)"
PACK_DIR="$TMP_ROOT/tarballs"
SOURCE_MODE="github"
SOURCE_DIR=""
RESOLVED_COMMIT=""

cleanup() {
  rm -rf "$TMP_ROOT"
}
trap cleanup EXIT

require_package_dir() {
  local source_dir="$1"
  local package_name="$2"

  if [[ ! -d "$source_dir/packages/$package_name" ]]; then
    printf 'ERROR: %s/packages/%s does not exist.\n' "$source_dir" "$package_name" >&2
    exit 1
  fi
}

resolve_source_dir() {
  if [[ -n "${PI_MONO_DIR:-}" ]]; then
    SOURCE_MODE="local"
    SOURCE_DIR="$PI_MONO_DIR"
    if [[ ! -f "$SOURCE_DIR/package.json" || ! -d "$SOURCE_DIR/packages" ]]; then
      printf 'ERROR: PI_MONO_DIR=%s 不是有效的 pi-mono checkout。\n' "$SOURCE_DIR" >&2
      exit 1
    fi

    require_package_dir "$SOURCE_DIR" "tui"
    require_package_dir "$SOURCE_DIR" "ai"
    require_package_dir "$SOURCE_DIR" "agent"
    require_package_dir "$SOURCE_DIR" "coding-agent"

    if RESOLVED_COMMIT="$(git -C "$SOURCE_DIR" rev-parse HEAD 2>/dev/null)"; then
      :
    else
      RESOLVED_COMMIT='local-unversioned'
    fi
    return 0
  fi

  SOURCE_DIR="$TMP_ROOT/pi-mono"
  printf '==> [1/4] Cloning pi-mono from GitHub...\n'
  printf '    repo=%s\n' "$PI_MONO_REPO_URL"
  printf '    ref=%s\n' "$PI_MONO_REF"
  git clone --depth 1 "$PI_MONO_REPO_URL" "$SOURCE_DIR" >/dev/null
  git -C "$SOURCE_DIR" fetch --depth 1 origin "$PI_MONO_REF" >/dev/null
  git -C "$SOURCE_DIR" checkout --detach FETCH_HEAD >/dev/null

  require_package_dir "$SOURCE_DIR" "tui"
  require_package_dir "$SOURCE_DIR" "ai"
  require_package_dir "$SOURCE_DIR" "agent"
  require_package_dir "$SOURCE_DIR" "coding-agent"
  RESOLVED_COMMIT="$(git -C "$SOURCE_DIR" rev-parse HEAD)"
}

install_dependencies() {
  local install_cmd=(npm install)
  if [[ -f "$SOURCE_DIR/package-lock.json" ]]; then
    install_cmd=(npm ci)
  fi

  printf '==> [2/4] Installing pi-mono dependencies...\n'
  printf '    source=%s\n' "$SOURCE_DIR"
  printf '    mode=%s\n' "$SOURCE_MODE"
  (
    cd "$SOURCE_DIR"
    HUSKY=0 "${install_cmd[@]}"
  )
}

# 0.84 起 coding-agent 的内部依赖闭包扩大到 7 个包：
#   telemetry / tui / protocol 无内部依赖；client -> protocol；ai -> telemetry；
#   agent -> ai + telemetry；coding-agent -> agent + ai + client + protocol + tui。
# 顺序必须保持拓扑序，否则先构建的包解析不到尚未构建的 workspace 依赖。
PI_BUILD_ORDER=(telemetry tui protocol client ai agent coding-agent)

build_packages() {
  local package_name

  printf '==> [3/4] Building pi packages in dependency order...\n'
  for package_name in "${PI_BUILD_ORDER[@]}"; do
    printf '    - %s\n' "$package_name"
    (
      cd "$SOURCE_DIR/packages/$package_name"
      npm run build
    )
  done
}

pack_pkg() {
  local package_name="$1"
  local dest_name="$2"
  local packed_file

  packed_file="$(cd "$SOURCE_DIR/packages/$package_name" && npm pack --pack-destination "$PACK_DIR" | tail -n 1)"
  mv "$PACK_DIR/$packed_file" "$PACK_DIR/$dest_name"
}

write_metadata() {
  local output_dir="$1"
  {
    printf 'source_mode=%s\n' "$SOURCE_MODE"
    if [[ "$SOURCE_MODE" == 'local' ]]; then
      printf 'source_dir=%s\n' "$SOURCE_DIR"
    else
      printf 'repo_url=%s\n' "$PI_MONO_REPO_URL"
      printf 'requested_ref=%s\n' "$PI_MONO_REF"
    fi
    printf 'resolved_commit=%s\n' "$RESOLVED_COMMIT"
    printf 'generated_at=%s\n' "$(date -u +%FT%TZ)"
  } > "$output_dir/pi-mono-source.txt"
}

publish_output_dir() {
  local output_dir="$1"

  rm -rf "$output_dir"
  mkdir -p "$output_dir"
  cp "$PACK_DIR"/pi-*.tgz "$output_dir"/
  write_metadata "$output_dir"
}

resolve_source_dir
install_dependencies
build_packages

printf '==> [4/4] Packing tarballs...\n'
rm -rf "$PACK_DIR"
mkdir -p "$PACK_DIR"

pack_pkg "telemetry" "pi-telemetry.tgz"
pack_pkg "tui" "pi-tui.tgz"
pack_pkg "protocol" "pi-protocol.tgz"
pack_pkg "client" "pi-client.tgz"
pack_pkg "ai" "pi-ai.tgz"
pack_pkg "agent" "pi-agent-core.tgz"
pack_pkg "coding-agent" "pi-coding-agent.tgz"

for output_dir in "${OUTPUT_DIRS[@]}"; do
  publish_output_dir "$output_dir"
  printf '    published -> %s\n' "$output_dir"
done

printf '    Resolved commit: %s\n' "$RESOLVED_COMMIT"
printf '    Tarballs ready:\n'
ls -lh "$PACK_DIR"

printf '\nDone. You can now build server/worker and sandbox images from the prepared tarballs.\n'
