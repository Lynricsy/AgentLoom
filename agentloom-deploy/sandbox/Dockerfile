FROM archlinux:latest

# nodejs/npm: runtime + build toolchain
# git/python: required by pi-coding-agent internals
# unzip: bun installer hard dependency
# ripgrep/fd: pi-coding-agent built-in file search tools
RUN pacman -Syu --noconfirm && \
    pacman -S --noconfirm nodejs npm git python ripgrep fd curl make gcc unzip && \
    pacman -Scc --noconfirm

# uv: fast Python package manager
RUN curl -LsSf https://astral.sh/uv/install.sh | sh && \
    ln -s /root/.local/bin/uv /usr/local/bin/uv && \
    ln -s /root/.local/bin/uvx /usr/local/bin/uvx

# bun: fast JavaScript/TypeScript runtime
RUN curl -fsSL https://bun.sh/install | bash && \
    ln -s /root/.bun/bin/bun /usr/local/bin/bun && \
    ln -s /root/.bun/bin/bunx /usr/local/bin/bunx

# /workspace is the agent working dir; healthcheck verifies its existence
RUN mkdir -p /workspace

WORKDIR /app

# .pi-tarballs/ holds npm-packed tarballs produced by
# ../scripts/prepare-pi-tarballs.sh. By default that script clones
# earendil-works/pi from GitHub, then package.docker.json redirects every
# @earendil-works/* dependency to these local tarballs instead of the npm registry.
COPY .pi-tarballs/ .pi-tarballs/
COPY package.docker.json package.json

# devDeps (tsup) are needed for the build step below
RUN npm install --include=dev

COPY src/ src/
COPY tsconfig.json ./
# 0.62 时代因 pi-coding-agent 事件类型不匹配而跳过 --dts；升级到 0.84.4 后
# DTS 生成的严格类型检查已能通过，与 package.json 的 build 脚本保持一致。
RUN npx tsup src/server.ts --format esm --target node22 --dts --clean

ENV NODE_ENV=production

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD test -d /workspace || exit 1

ENTRYPOINT ["node", "dist/server.js"]
