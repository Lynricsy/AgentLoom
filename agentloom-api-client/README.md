# @agentloom/api-client

AgentLoom REST API 的类型定义，**由 `agentloom-server` 的 OpenAPI spec 生成，手改无效**。

`src/models.ts` 是生成产物，重新生成会整体覆盖。

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

生成器配置位于 `agentloom-server/openapitools.json` 的 `typescriptModels` 条目，
使用 `withoutRuntimeChecks: true`，产物为纯 interface，不含 fetch runtime —— Studio
继续使用 ky 作为 HTTP 客户端，本包只提供载荷类型。
