#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
LOCK_FILE="$SCRIPT_DIR/artifact-lock.json"
BUILD_ROOT="$SCRIPT_DIR/.build"
DOWNLOAD_ROOT="$BUILD_ROOT/downloads"
CONTEXT_ROOT="$SCRIPT_DIR/build-context"
ARTIFACT_ROOT="$SCRIPT_DIR/artifacts"

for command in curl docker go jq mke2fs npm od sha256sum tar tr; do
  command -v "$command" >/dev/null || { echo "missing required command: $command" >&2; exit 1; }
done
[[ "$(uname -m)" == "x86_64" ]] || { echo "linux x86_64 build host required" >&2; exit 1; }

mkdir -p "$DOWNLOAD_ROOT"
rm -rf "$CONTEXT_ROOT" "$BUILD_ROOT/output" "$BUILD_ROOT/rootfs" "$BUILD_ROOT/kernel-output"
mkdir -p "$CONTEXT_ROOT" "$BUILD_ROOT/output" "$BUILD_ROOT/rootfs"

download_verified() {
  local url="$1" expected="$2" output="$3"
  local temporary="${output}.tmp"
  curl --fail --location --silent --show-error "$url" --output "$temporary"
  echo "$expected  $temporary" | sha256sum --check --status
  mv "$temporary" "$output"
}

firecracker_url="$(jq -r '.firecracker.releaseArchive' "$LOCK_FILE")"
firecracker_sha="$(jq -r '.firecracker.releaseArchiveSha256' "$LOCK_FILE")"
kernel_url="$(jq -r '.kernel.sourceArchive' "$LOCK_FILE")"
kernel_sha="$(jq -r '.kernel.sourceArchiveSha256' "$LOCK_FILE")"
config_url="$(jq -r '.kernel.configUrl' "$LOCK_FILE")"
config_sha="$(jq -r '.kernel.configSha256' "$LOCK_FILE")"
busybox_url="$(jq -r '.busybox.sourceArchive' "$LOCK_FILE")"
busybox_sha="$(jq -r '.busybox.sourceArchiveSha256' "$LOCK_FILE")"
arch_digest="$(jq -r '.rootfs.archOciDigest' "$LOCK_FILE")"
arch_snapshot="$(jq -r '.rootfs.archSnapshot' "$LOCK_FILE")"

[[ -f "$DOWNLOAD_ROOT/firecracker.tgz" ]] || download_verified "$firecracker_url" "$firecracker_sha" "$DOWNLOAD_ROOT/firecracker.tgz"
[[ -f "$DOWNLOAD_ROOT/kernel.tar.gz" ]] || download_verified "$kernel_url" "$kernel_sha" "$DOWNLOAD_ROOT/kernel.tar.gz"
[[ -f "$DOWNLOAD_ROOT/kernel.config" ]] || download_verified "$config_url" "$config_sha" "$DOWNLOAD_ROOT/kernel.config"
[[ -f "$DOWNLOAD_ROOT/busybox.tar.bz2" ]] || download_verified "$busybox_url" "$busybox_sha" "$DOWNLOAD_ROOT/busybox.tar.bz2"

echo "$firecracker_sha  $DOWNLOAD_ROOT/firecracker.tgz" | sha256sum --check --status
echo "$kernel_sha  $DOWNLOAD_ROOT/kernel.tar.gz" | sha256sum --check --status
echo "$config_sha  $DOWNLOAD_ROOT/kernel.config" | sha256sum --check --status
echo "$busybox_sha  $DOWNLOAD_ROOT/busybox.tar.bz2" | sha256sum --check --status

mkdir -p "$BUILD_ROOT/firecracker-release"
tar -xzf "$DOWNLOAD_ROOT/firecracker.tgz" -C "$BUILD_ROOT/firecracker-release"
firecracker_binary="$BUILD_ROOT/firecracker-release/release-v1.16.1-x86_64/firecracker-v1.16.1-x86_64"
jailer_binary="$BUILD_ROOT/firecracker-release/release-v1.16.1-x86_64/jailer-v1.16.1-x86_64"
[[ -x "$firecracker_binary" && -x "$jailer_binary" ]] || { echo "release archive missing binaries" >&2; exit 1; }
cp "$firecracker_binary" "$BUILD_ROOT/output/firecracker"
cp "$jailer_binary" "$BUILD_ROOT/output/jailer"
chmod 0755 "$BUILD_ROOT/output/firecracker" "$BUILD_ROOT/output/jailer"

(
  cd "$REPO_ROOT/agentloom-deploy/sandbox"
  npm ci
  npm run typecheck
  npm run build
)
CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go -C "$REPO_ROOT/agentloom-firecracker-runtime" \
  build -trimpath -ldflags='-s -w' \
  -o "$BUILD_ROOT/output/agentloom-guestd" ./cmd/agentloom-guestd

mkdir -p "$CONTEXT_ROOT/rootfs/sandbox"
cp "$BUILD_ROOT/output/agentloom-guestd" "$CONTEXT_ROOT/rootfs/agentloom-guestd"
cp "$SCRIPT_DIR/systemd/agentloom-guestd.service" "$CONTEXT_ROOT/rootfs/agentloom-guestd.service"
cp "$REPO_ROOT/agentloom-deploy/sandbox/package.json" "$CONTEXT_ROOT/rootfs/sandbox/package.json"
cp "$REPO_ROOT/agentloom-deploy/sandbox/package-lock.json" "$CONTEXT_ROOT/rootfs/sandbox/package-lock.json"
cp -a "$REPO_ROOT/agentloom-deploy/sandbox/dist" "$CONTEXT_ROOT/rootfs/sandbox/dist"
(
  cd "$CONTEXT_ROOT/rootfs/sandbox"
  npm ci --omit=dev
)
docker buildx build \
  --file "$SCRIPT_DIR/rootfs.Dockerfile" \
  --build-arg "ARCH_DIGEST=$arch_digest" \
  --build-arg "ARCH_SNAPSHOT=$arch_snapshot" \
  --output "type=local,dest=$BUILD_ROOT/rootfs" \
  "$CONTEXT_ROOT/rootfs"
rm -f "$BUILD_ROOT/rootfs/etc/resolv.conf"
ln -s /proc/net/pnp "$BUILD_ROOT/rootfs/etc/resolv.conf"
[[ "$(readlink "$BUILD_ROOT/rootfs/etc/resolv.conf")" == "/proc/net/pnp" ]]

truncate -s "$(jq -r '.rootfs.sizeGiB' "$LOCK_FILE")G" "$BUILD_ROOT/output/rootfs.ext4"
mke2fs -q -t ext4 -F -d "$BUILD_ROOT/rootfs" "$BUILD_ROOT/output/rootfs.ext4"

mkdir -p "$CONTEXT_ROOT/kernel"
cp "$DOWNLOAD_ROOT/kernel.tar.gz" "$CONTEXT_ROOT/kernel/kernel.tar.gz"
cp "$DOWNLOAD_ROOT/kernel.config" "$CONTEXT_ROOT/kernel/kernel.config"
cp "$DOWNLOAD_ROOT/busybox.tar.bz2" "$CONTEXT_ROOT/kernel/busybox.tar.bz2"
cp "$SCRIPT_DIR/kernel.config.fragment" "$CONTEXT_ROOT/kernel/kernel.config.fragment"
cp "$SCRIPT_DIR/initramfs/init" "$CONTEXT_ROOT/kernel/init"
docker buildx build \
  --file "$SCRIPT_DIR/kernel-builder.Dockerfile" \
  --build-arg "ARCH_DIGEST=$arch_digest" \
  --build-arg "ARCH_SNAPSHOT=$arch_snapshot" \
  --build-arg "KERNEL_ARCHIVE_SHA256=$kernel_sha" \
  --build-arg "KERNEL_CONFIG_SHA256=$config_sha" \
  --build-arg "BUSYBOX_ARCHIVE_SHA256=$busybox_sha" \
  --output "type=local,dest=$BUILD_ROOT/kernel-output" \
  "$CONTEXT_ROOT/kernel"
kernel_magic="$(od -An -tx1 -N4 "$BUILD_ROOT/kernel-output/vmlinux" | tr -d '[:space:]')"
[[ "$kernel_magic" == "7f454c46" ]] || { echo "kernel output is not an ELF image" >&2; exit 1; }
cp "$BUILD_ROOT/kernel-output/vmlinux" "$BUILD_ROOT/output/vmlinux"
cp "$BUILD_ROOT/kernel-output/initramfs.cpio.gz" "$BUILD_ROOT/output/initramfs.cpio.gz"

rm -rf "$ARTIFACT_ROOT"
mkdir -p "$ARTIFACT_ROOT"
cp "$BUILD_ROOT/output/"* "$ARTIFACT_ROOT/"
go -C "$REPO_ROOT/agentloom-firecracker-runtime" run ./cmd/build-artifact-manifest \
  -root "$ARTIFACT_ROOT" \
  -lock "$LOCK_FILE" \
  -output "$ARTIFACT_ROOT/manifest.json" \
  -guestd-version "$(git -C "$REPO_ROOT" rev-parse HEAD)"
chmod 0600 "$ARTIFACT_ROOT/manifest.json"
echo "Firecracker artifacts built at $ARTIFACT_ROOT"
