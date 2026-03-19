FROM node:22-bookworm-slim AS build

ENV PNPM_HOME=/pnpm
ENV PATH=${PNPM_HOME}:${PATH}
ENV CI=true

RUN corepack enable

WORKDIR /workspace

COPY agentloom-type-engine/pkg ./agentloom-type-engine/pkg
COPY agentloom-studio ./agentloom-studio

WORKDIR /workspace/agentloom-studio
RUN pnpm install --frozen-lockfile --config.node-linker=hoisted

ARG VITE_API_BASE_URL=__VITE_API_BASE_URL__
ARG VITE_AUTOSAVE_DEBOUNCE_MS=__VITE_AUTOSAVE_DEBOUNCE_MS__

ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
ENV VITE_AUTOSAVE_DEBOUNCE_MS=${VITE_AUTOSAVE_DEBOUNCE_MS}

RUN pnpm build

FROM nginx:1.27-alpine

COPY --from=build /workspace/agentloom-studio/dist /usr/share/nginx/html

RUN rm -f /etc/nginx/conf.d/default.conf && printf '%s\n' \
  'server {' \
  '  listen 8080;' \
  '  server_name _;' \
  '  root /usr/share/nginx/html;' \
  '  index index.html;' \
  '' \
  '  location / {' \
  '    try_files $uri $uri/ /index.html;' \
  '  }' \
  '}' > /etc/nginx/conf.d/default.conf

RUN printf '%s\n' \
  '#!/bin/sh' \
  'set -eu' \
  '' \
  'escape_sed() {' \
  "  printf '%s' \"\$1\" | sed 's/[\\/&]/\\\\&/g'" \
  '}' \
  '' \
  'api_base_url=$(escape_sed "${VITE_API_BASE_URL:-/api/v1}")' \
  'autosave_debounce=$(escape_sed "${VITE_AUTOSAVE_DEBOUNCE_MS:-500}")' \
  '' \
  'find /usr/share/nginx/html -type f \( -name "*.html" -o -name "*.js" -o -name "*.css" \) -exec sed -i -e "s/__VITE_API_BASE_URL__/${api_base_url}/g" -e "s/__VITE_AUTOSAVE_DEBOUNCE_MS__/${autosave_debounce}/g" {} +' \
  > /docker-entrypoint.d/40-runtime-env.sh && chmod +x /docker-entrypoint.d/40-runtime-env.sh

EXPOSE 8080
