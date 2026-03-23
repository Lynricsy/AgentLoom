FROM archlinux:latest

# nodejs/npm: runtime + build toolchain
# git/python: required by pi-coding-agent internals
# ripgrep/fd: pi-coding-agent built-in file search tools
RUN pacman -Syu --noconfirm && \
    pacman -S --noconfirm nodejs npm git python ripgrep fd curl && \
    pacman -Scc --noconfirm

# /workspace is the agent working dir; healthcheck verifies its existence
RUN mkdir -p /workspace

WORKDIR /app

# .pi-tarballs/ holds npm-packed tarballs of local pi-mono packages (produced by
# build.sh). package.docker.json adds npm `overrides` that redirect every
# @mariozechner/* dep to these local tarballs instead of the npm registry.
COPY .pi-tarballs/ .pi-tarballs/
COPY package.docker.json package.json

# devDeps (tsup) are needed for the build step below
RUN npm install --include=dev

COPY src/ src/
COPY tsconfig.json ./
# Skip --dts: this is a runtime entrypoint, not a library; DTS generation
# triggers strict type-checking that hits pi-coding-agent event-type mismatches.
RUN npx tsup src/server.ts --format esm --target node22 --clean

ENV NODE_ENV=production

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD test -d /workspace || exit 1

ENTRYPOINT ["node", "dist/server.js"]
