ARG ARCH_DIGEST=sha256:a674898d53cc63b1af4023a468ccddc25ed9d7aecc3996f16171838a57085999
FROM archlinux@${ARCH_DIGEST} AS builder
ARG ARCH_SNAPSHOT=2026/08/01
ARG KERNEL_ARCHIVE_SHA256
ARG KERNEL_CONFIG_SHA256
ARG BUSYBOX_ARCHIVE_SHA256
RUN printf 'Server = https://archive.archlinux.org/repos/%s/$repo/os/$arch\n' "$ARCH_SNAPSHOT" > /etc/pacman.d/mirrorlist \
    && pacman -Syu --noconfirm \
    && pacman -S --noconfirm --needed base-devel bc bison cpio elfutils flex openssl pahole perl tar xz
COPY kernel.tar.gz kernel.config kernel.config.fragment busybox.tar.bz2 init /build/
RUN echo "${KERNEL_ARCHIVE_SHA256}  /build/kernel.tar.gz" | sha256sum -c - \
    && echo "${KERNEL_CONFIG_SHA256}  /build/kernel.config" | sha256sum -c - \
    && echo "${BUSYBOX_ARCHIVE_SHA256}  /build/busybox.tar.bz2" | sha256sum -c - \
    && mkdir -p /build/kernel /build/busybox /output \
    && tar -xzf /build/kernel.tar.gz --strip-components=1 -C /build/kernel \
    && cp /build/kernel.config /build/kernel/.config \
    && cat /build/kernel.config.fragment >> /build/kernel/.config \
    && make -C /build/kernel olddefconfig \
    && make -C /build/kernel -j"$(nproc)" bzImage \
    && cp /build/kernel/arch/x86/boot/bzImage /output/vmlinux \
    && tar -xjf /build/busybox.tar.bz2 --strip-components=1 -C /build/busybox \
    && make -C /build/busybox allnoconfig \
    && sed -i \
      -e 's/# CONFIG_STATIC is not set/CONFIG_STATIC=y/' \
      -e 's/CONFIG_SH_IS_NONE=y/# CONFIG_SH_IS_NONE is not set/' \
      -e 's/# CONFIG_SH_IS_ASH is not set/CONFIG_SH_IS_ASH=y/' \
      -e 's/# CONFIG_ASH is not set/CONFIG_ASH=y/' \
      -e 's/# CONFIG_MKDIR is not set/CONFIG_MKDIR=y/' \
      -e 's/# CONFIG_MOUNT is not set/CONFIG_MOUNT=y/' \
      -e 's/# CONFIG_FEATURE_MOUNT_FLAGS is not set/CONFIG_FEATURE_MOUNT_FLAGS=y/' \
      -e 's/# CONFIG_SWITCH_ROOT is not set/CONFIG_SWITCH_ROOT=y/' \
      /build/busybox/.config \
    && yes '' | make -C /build/busybox oldconfig \
    && make -C /build/busybox -j"$(nproc)" busybox \
    && mkdir -p /build/initramfs/bin /build/initramfs/sbin /build/initramfs/usr/bin \
      /build/initramfs/usr/sbin /build/initramfs/proc /build/initramfs/sys \
      /build/initramfs/dev /build/initramfs/run /build/initramfs/lower \
      /build/initramfs/mutable /build/initramfs/newroot \
    && cp /build/busybox/busybox /build/initramfs/bin/busybox \
    && ln -s busybox /build/initramfs/bin/sh \
    && ln -s busybox /build/initramfs/bin/mount \
    && ln -s busybox /build/initramfs/bin/mkdir \
    && ln -s busybox /build/initramfs/bin/switch_root \
    && cp /build/init /build/initramfs/init \
    && chmod 0755 /build/initramfs/init \
    && cd /build/initramfs \
    && find . -print0 | cpio --null -ov --format=newc | gzip -9 > /output/initramfs.cpio.gz

FROM scratch
COPY --from=builder /output/ /
