ARG ARCH_DIGEST=sha256:a674898d53cc63b1af4023a468ccddc25ed9d7aecc3996f16171838a57085999
FROM archlinux@${ARCH_DIGEST} AS rootfs
ARG ARCH_SNAPSHOT=2026/08/01
RUN printf 'Server = https://archive.archlinux.org/repos/%s/$repo/os/$arch\n' "$ARCH_SNAPSHOT" > /etc/pacman.d/mirrorlist \
    && pacman -Syu --noconfirm \
    && pacman -S --noconfirm --needed \
      base ca-certificates curl fd gcc git iproute2 iputils make nodejs npm \
      python ripgrep systemd tar unzip uv zstd \
    && pacman -Scc --noconfirm

COPY agentloom-guestd /usr/local/bin/agentloom-guestd
COPY sandbox/ /opt/agentloom-sandbox/
COPY agentloom-guestd.service /usr/lib/systemd/system/agentloom-guestd.service
RUN chmod 0755 /usr/local/bin/agentloom-guestd \
    && mkdir -p /workspace /run/agentloom /etc/systemd/system/multi-user.target.wants \
      /etc/systemd/coredump.conf.d /etc/security/limits.d \
    && chmod 0700 /run/agentloom \
    && ln -s /usr/lib/systemd/system/agentloom-guestd.service \
      /etc/systemd/system/multi-user.target.wants/agentloom-guestd.service \
    && printf '[Coredump]\nStorage=none\nProcessSizeMax=0\n' > /etc/systemd/coredump.conf.d/disable.conf \
    && printf '* hard core 0\n* soft core 0\n' > /etc/security/limits.d/disable-core.conf \
    && rm -f /etc/machine-id \
    && touch /etc/machine-id

FROM scratch
COPY --from=rootfs / /
