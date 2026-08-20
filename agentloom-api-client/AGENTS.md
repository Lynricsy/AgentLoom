# @agentloom/api-client 知识库

## 职责

`@agentloom/api-client` 提供从 `agentloom-server` OpenAPI specification 生成的 REST DTO interface。该包没有 fetch runtime；Studio 使用 ky 发起 HTTP 请求，并从本包导入载荷类型。

## 目录

| 路径 | 职责 |
| --- | --- |
| `src/models.ts` | 提交到仓库的 OpenAPI 生成产物；再生成时整体覆盖 |
| `src/index.ts` | 公开 barrel |
| `scripts/sync-models.mjs` | 将 `agentloom-server/sdk/typescript-models/src/models/index.ts` 同步为 `src/models.ts` |
| `tsup.config.ts` | ESM、CJS 与类型声明构建配置 |

生成器配置位于 `agentloom-server/openapitools.json` 的 `typescriptModels` 条目，使用 `typescript-fetch` 与 `withoutRuntimeChecks: true`。生成结果是纯 interface，不包含请求客户端或运行时校验。

## 关键约定

- 禁止手改 `src/models.ts`；API 类型差异必须在 server OpenAPI 暴露源修正后再生成。
- `src/index.ts` 只导出生成 models；网络、认证、重试与大小写转换留在消费端。
- 根命令 `pnpm contracts:regen` 是规范再生成入口。OpenAPI 导出会构建 server，并需要 Redis 可达。
- Studio 的 envelope 类型可保留在 Studio shared 层；OpenAPI model payload 从本包导入。

## 命令

```bash
pnpm typecheck
pnpm build
pnpm sync  # 仅同步已经生成的 server models
```

完整再生成从仓库根运行：

```bash
pnpm contracts:regen
```
