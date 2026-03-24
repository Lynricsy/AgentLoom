# PREREQUISITE: Run scripts/prepare-pi-tarballs.sh first
# Build context: project root (-f agentloom-deploy/docker/server.Dockerfile .)

# ── Stage 1: deps ─────────────────────────────────────────────────
FROM node:22-bookworm-slim AS deps

ENV PNPM_HOME=/pnpm
ENV PATH=${PNPM_HOME}:${PATH}
ENV CI=true

RUN corepack enable

WORKDIR /build

COPY agentloom-plugin-sdk/ ./plugin-sdk/
WORKDIR /build/plugin-sdk
RUN pnpm install --frozen-lockfile --config.node-linker=hoisted && pnpm build

WORKDIR /build/server

COPY agentloom-deploy/docker/.pi-tarballs/pi-agent-core.tgz ./.pi-tarballs/
COPY agentloom-deploy/docker/.pi-tarballs/pi-ai.tgz          ./.pi-tarballs/

COPY agentloom-server/package.json agentloom-server/pnpm-lock.yaml ./

RUN sed -i \
    -e 's|"file:../agentloom-plugin-sdk"|"file:../plugin-sdk"|' \
    -e 's|"file:../../../GitHub/pi-mono/packages/agent"|"file:./.pi-tarballs/pi-agent-core.tgz"|' \
    -e 's|"file:../../../GitHub/pi-mono/packages/ai"|"file:./.pi-tarballs/pi-ai.tgz"|' \
    package.json

RUN pnpm install --no-frozen-lockfile --config.node-linker=hoisted

# ── Stage 2: builder ──────────────────────────────────────────────
FROM deps AS builder

COPY agentloom-server/src/         ./src/
COPY agentloom-server/drizzle/     ./drizzle/
COPY agentloom-server/scripts/     ./scripts/
COPY agentloom-server/tsconfig*.json agentloom-server/nest-cli.json ./

RUN pnpm build

RUN pnpm prune --prod --config.node-linker=hoisted || true

# ── Stage 3: production ──────────────────────────────────────────
FROM node:22-bookworm-slim AS production

ENV NODE_ENV=production

WORKDIR /app

COPY --from=builder /build/server/dist/        ./dist/
COPY --from=builder /build/server/node_modules/ ./node_modules/
COPY --from=builder /build/server/package.json  ./
COPY --from=builder /build/plugin-sdk/dist/     ./plugin-sdk-dist/

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD ["node", "-e", "require('http').get('http://127.0.0.1:3000/api/v1/health', (res) => process.exit(res.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"]

CMD ["node", "dist/src/main.js"]
