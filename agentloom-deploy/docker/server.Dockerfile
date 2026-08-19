# Build context: project root (-f agentloom-deploy/docker/server.Dockerfile .)
# 依赖安装在仓库根的 pnpm workspace 上完成，再用 --filter 只装 server 子图。

# ── Stage 1: deps ─────────────────────────────────────────────────
FROM node:22-bookworm-slim AS deps

ENV PNPM_HOME=/pnpm
ENV PATH=${PNPM_HOME}:${PATH}
ENV CI=true

RUN corepack enable

WORKDIR /build

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY agentloom-contracts/package.json   ./agentloom-contracts/
COPY agentloom-api-client/package.json  ./agentloom-api-client/
COPY agentloom-plugin-sdk/package.json  ./agentloom-plugin-sdk/
COPY agentloom-server/package.json      ./agentloom-server/

RUN pnpm install --frozen-lockfile --config.node-linker=hoisted \
    --filter agentloom-server... --filter agentloom-server^...

COPY agentloom-contracts/  ./agentloom-contracts/
COPY agentloom-api-client/ ./agentloom-api-client/
COPY agentloom-plugin-sdk/ ./agentloom-plugin-sdk/

RUN pnpm --filter @agentloom/contracts --filter @agentloom/api-client --filter @agentloom/plugin-sdk run build

WORKDIR /build/agentloom-server

# ── Stage 2: builder ──────────────────────────────────────────────
FROM deps AS builder

COPY agentloom-server/src/         ./src/
COPY agentloom-server/drizzle/     ./drizzle/
COPY agentloom-server/scripts/     ./scripts/
COPY agentloom-server/tsconfig*.json agentloom-server/nest-cli.json agentloom-server/drizzle.config.ts ./

RUN pnpm build

# ── Stage 2b: migrator (has devDeps like drizzle-kit) ────────────
FROM builder AS migrator

ENV PNPM_HOME=/pnpm
ENV PATH=${PNPM_HOME}:${PATH}
ENV COREPACK_ENABLE_AUTO_INSTALL=1

WORKDIR /build/agentloom-server
CMD ["pnpm", "db:migrate"]

# ── Stage 3: production (pruned, no devDeps) ─────────────────────
FROM builder AS builder-pruned
RUN pnpm prune --prod --config.node-linker=hoisted
FROM node:22-bookworm-slim AS production

ENV NODE_ENV=production
ENV PNPM_HOME=/pnpm
ENV PATH=${PNPM_HOME}:${PATH}
ENV COREPACK_ENABLE_AUTO_INSTALL=1

RUN corepack enable

WORKDIR /app

# workspace 布局整体搬运：contracts / api-client / plugin-sdk 由根 node_modules 的
# 符号链接指向各自源目录，拆分复制会断链，因此保留同一相对结构。
COPY --from=builder-pruned /build/ ./

WORKDIR /app/agentloom-server

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD ["node", "-e", "require('http').get('http://127.0.0.1:3000/api/v1/health', (res) => process.exit(res.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"]

CMD ["node", "dist/src/main.js"]
