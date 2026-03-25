# Build context: project root. Call with: -f agentloom-deploy/docker/docs.Dockerfile .
# scripts/sync-openapi.mjs falls back to a stub spec when agentloom-server/sdk/openapi.json
# is absent — no COPY needed for the build to succeed.

FROM node:22-bookworm-slim AS build

ENV PNPM_HOME=/pnpm
ENV PATH=${PNPM_HOME}:${PATH}
ENV CI=true

RUN apt-get update && apt-get install -y --no-install-recommends git && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@10.6.2 --activate

WORKDIR /workspace

COPY agentloom-docs ./agentloom-docs

WORKDIR /workspace/agentloom-docs
RUN pnpm install --frozen-lockfile

# git is installed but .git is excluded by .dockerignore — init a dummy repo
# so VitePress lastUpdated doesn't crash on missing git
RUN git init && git add -A && git -c user.name=build -c user.email=build@local commit -m "build" --allow-empty
RUN pnpm build

# ─────────────────────────────────────────────────────────────────────────────
# Stage 2: Runtime (轻量 nginx 替代 openresty)
# ─────────────────────────────────────────────────────────────────────────────
FROM nginx:1.27-alpine

COPY --from=build /workspace/agentloom-docs/.vitepress/dist /usr/share/nginx/html/documentation

RUN rm -f /etc/nginx/conf.d/default.conf && printf '%s\n' \
  'server {' \
  '  listen 8081;' \
  '  server_name _;' \
  '' \
  '  location /documentation/ {' \
  '    root /usr/share/nginx/html;' \
  '    try_files $uri $uri/ /documentation/index.html;' \
  '  }' \
  '}' > /etc/nginx/conf.d/default.conf

EXPOSE 8081

CMD ["nginx", "-g", "daemon off;"]
