# Repository Guidelines

## 概述

server OpenAPI 生成的 REST 类型包（`typescript-fetch` + `withoutRuntimeChecks: true`，纯 interface，无请求客户端、无运行时校验）。跨包规则见根 `AGENTS.md`。
类型流与再生成：`agentloom-docs/dev/contracts.md`。

## 本包硬规则

- 禁止手改 `src/models.ts`；类型错误或缺失在 server DTO/Swagger schema 修正后走 `pnpm contracts:regen`。
- 生成器配置在 `agentloom-server/openapitools.json` 的 `typescriptModels` 条目，必须保留 `withoutRuntimeChecks: true`。
- 消费者只从 `@agentloom/api-client` 导入，不依赖 `src/models.ts` 或 server SDK 内部路径。
- `src/index.ts` 保持窄 barrel：不加入 envelope 转换、认证、重试、请求封装或手写 DTO；传输适配放消费端 shared API 层。

## 命令

见本包 `README.md`。

## 改动时更新

无需手动更新文档：REST 参考页由 `agentloom-server/sdk/openapi.json` 在文档站构建时同步。
