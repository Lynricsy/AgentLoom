---
docType: reference
aside: false
outline: false
---

# REST 参考

下面的规范由 `agentloom-server/sdk/openapi.json` 渲染，它是 server 控制器与 DTO 导出的 OpenAPI 3 文档（server 中运行 `pnpm openapi:export` 重新生成）。服务器地址已包含 `/api/v1`，因此下方路径省略该前缀（`/health` 即 `https://agentloom.ling.plus/api/v1/health`）；构建时 `agentloom-docs/scripts/sync-openapi.mjs` 负责去掉前缀，地址可用 `DOCS_OPENAPI_SERVER_URL` 覆盖。地址、凭证、字段命名、错误与限流的共同约定见 [API 约定](/api/)。

<OASpec />
