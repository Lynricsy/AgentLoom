# Build context: project root (-f agentloom-deploy/docker/server.Dockerfile .)
# 依赖安装在仓库根的 pnpm workspace 上完成，再用 --filter 只装 server 子图。

# ── Stage 1: deps ─────────────────────────────────────────────────
FROM node:22-bookworm-slim AS deps

ENV PNPM_HOME=/pnpm
ENV PATH=${PNPM_HOME}:${PATH}
ENV CI=true

RUN corepack enable

WORKDIR /build

# workspace 内部包必须在 install 之前完整落盘：它们声明了 prepare 脚本，
# pnpm 会在 workspace install 期间执行，只有 package.json 时会因缺少源码而失败。
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY agentloom-contracts/  ./agentloom-contracts/
COPY agentloom-api-client/ ./agentloom-api-client/
COPY agentloom-plugin-sdk/ ./agentloom-plugin-sdk/
COPY agentloom-server/package.json ./agentloom-server/

RUN pnpm install --frozen-lockfile --config.node-linker=hoisted \
    --filter agentloom-server... --filter agentloom-server^...

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
# --ignore-scripts：prune 会重跑 workspace 包的 prepare，而此时 tsup 已随 devDeps 被移除；
# 各包的 dist/ 已在 deps 阶段构建完成，无需再次构建。
RUN pnpm prune --prod --config.node-linker=hoisted --ignore-scripts
FROM node:22-bookworm-slim AS production

ENV NODE_ENV=production
ENV PNPM_HOME=/pnpm
ENV PATH=${PNPM_HOME}:${PATH}
ENV COREPACK_ENABLE_AUTO_INSTALL=1

RUN corepack enable

# Code Executor（code-tool）的 Python 语言以子进程 `python3` 运行，与 node / bash 同一套约束：
# node 用户、只继承白名单环境变量、按节点超时终止（agentloom-server/src/modules/agent/code-execution.service.ts）。
# 只装解释器与标准库，不带 pip。
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 \
    && rm -rf /var/lib/apt/lists/*

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

# ── Stage 4: browser-runner（Gate 5 浏览器验收，ADR-0007 §6） ─────
# 与 production 同一套依赖与构建产物，只多一层 Chromium（headless shell）及其系统库，
# 入口换成只消费 generated-app-browser-acceptance 队列的 runner。production 目标不含 /ms-playwright。
FROM production AS browser-runner

USER root

ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
# 只读根文件系统下 Chromium 的配置与缓存目录落到 tmpfs /tmp
ENV XDG_CONFIG_HOME=/tmp/.chromium-config
ENV XDG_CACHE_HOME=/tmp/.chromium-cache

# 版本由 lockfile 中的 playwright 决定，浏览器修订号与之匹配；--with-deps 安装 Chromium 所需系统库
RUN node /app/node_modules/playwright/cli.js install --with-deps --only-shell chromium \
    && rm -rf /var/lib/apt/lists/* \
    && chmod -R a+rX /ms-playwright

USER node

# runner 不监听 HTTP 端口，不继承 production 的健康检查
HEALTHCHECK NONE

CMD ["node", "dist/src/generated-app-browser-runner.main.js"]
