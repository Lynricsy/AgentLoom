# @agentloom/api-client

AgentLoom REST API 的类型定义，由 `agentloom-server` 的 OpenAPI spec 生成。

`src/models.ts` 是提交到仓库的生成产物，包含 154 个 interface；再生成会整体覆盖，禁止手改。包内不含 fetch runtime，Studio 使用 ky 作为 HTTP 客户端。

## 再生成

```bash
# 仓库根
pnpm contracts:regen
```

等价于：

```bash
pnpm --filter agentloom-server run openapi:export        # 导出 spec（需要 Redis 可达）
pnpm --filter agentloom-server run sdk:generate:models   # 生成纯类型 model
pnpm --filter @agentloom/api-client run sync             # 同步到 src/models.ts
pnpm --filter @agentloom/api-client run build            # tsup 构建
```

生成器配置位于 `agentloom-server/openapitools.json` 的 `typescriptModels` 条目，使用 `typescript-fetch` 与 `withoutRuntimeChecks: true`。

## 检查

```bash
pnpm typecheck
pnpm build
```
