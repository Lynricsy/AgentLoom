FROM node:22-bookworm-slim

ENV PNPM_HOME=/pnpm
ENV PATH=${PNPM_HOME}:${PATH}
ENV CI=true

RUN corepack enable

WORKDIR /workspace

COPY agentloom-plugin-sdk ./agentloom-plugin-sdk

WORKDIR /workspace/agentloom-plugin-sdk
RUN pnpm install --frozen-lockfile --config.node-linker=hoisted
RUN pnpm build

WORKDIR /workspace
COPY agentloom-server ./agentloom-server

WORKDIR /workspace/agentloom-server
RUN pnpm install --frozen-lockfile --config.node-linker=hoisted
RUN pnpm build

ENV NODE_ENV=production

EXPOSE 3000

CMD ["node", "dist/src/main.js"]
