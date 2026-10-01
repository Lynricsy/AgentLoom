# @agentloom/api-client

由 `agentloom-server` 的 OpenAPI spec 生成的 REST 类型定义（纯 TypeScript interface，不含 fetch runtime）。`src/models.ts` 是提交到仓库的生成产物，再生成会整体覆盖，禁止手改。

## 开发命令

再生成在仓库根运行（需要 Redis 可达，因为 server 构建后导出 spec 时会启动应用）：

```bash
pnpm contracts:regen
```

它依次执行 server `openapi:export`、server `sdk:generate:models`、本包 `sync`、本包 `build`。生成器配置是 `agentloom-server/openapitools.json` 的 `typescriptModels` 条目。

本包内：

```bash
pnpm sync        # 把 server 生成的 models 同步到 src/models.ts
pnpm typecheck
pnpm build       # tsup
```

## 文档

- 类型流与再生成：`agentloom-docs/dev/contracts.md`
- REST 参考：`agentloom-docs/api/rest.md`
