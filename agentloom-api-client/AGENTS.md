# Repository Guidelines

## Project Overview

`@agentloom/api-client` 是 AgentLoom REST API 的生成类型包。它把 server OpenAPI 暴露的 DTO 提供给 TypeScript 消费端，不维护业务逻辑，也不提供请求客户端。

生成器使用 `typescript-fetch` 的 `withoutRuntimeChecks: true` 模式；主体是纯 TypeScript interface/type（枚举会生成字面量常量），不依赖 OpenAPI runtime，不执行运行时校验。

## Architecture & Data Flow

```text
agentloom-server DTO / Swagger schema
  → agentloom-server/sdk/openapi.json
  → agentloom-server/sdk/typescript-models/src/models/index.ts
  → scripts/sync-models.mjs
  → src/models.ts
  → src/index.ts
  → dist/index.{js,cjs,d.ts}
```

完整跨包契约生成流程以根 `AGENTS.md` 和根命令 `pnpm contracts:regen` 为准。本包的 `sync` 只搬运 server 已生成的 models，不导出 OpenAPI，也不运行生成器。

本包没有 fetch/ky runtime。Studio 的 HTTP transport 位于 `agentloom-studio/src/shared/api/client.ts`，负责认证、401 refresh 和 REST 大小写转换；这些职责不得移入本包。

## Key Directories

| 路径 | 用途 |
|---|---|
| `src/models.ts` | 已提交的 OpenAPI 生成产物；重新生成时整体覆盖 |
| `src/index.ts` | 公共 barrel，仅重新导出 `./models` |
| `scripts/sync-models.mjs` | 校验并复制 server models |
| `tsup.config.ts` | ESM、CJS、声明文件和 sourcemap 构建配置 |
| `tsconfig.json` | ES2022、Bundler resolution、strict typecheck 配置 |

## Development Commands

在本包目录运行：

```bash
pnpm sync       # 同步已存在的 server 生成产物
pnpm typecheck  # tsc --noEmit
pnpm build      # tsup，输出 ESM/CJS/d.ts
```

需要从 server 契约完整再生成时，在仓库根运行：

```bash
pnpm contracts:regen
```

该根命令依次执行 server OpenAPI 导出、`sdk:generate:models`、本包 `sync` 和本包 `build`；OpenAPI 导出会构建 server，并要求 Redis 可达。

## Code Conventions & Common Patterns

- **禁止手改 `src/models.ts`**。类型错误或缺失应在 server DTO/Swagger schema 修正，再走完整生成流程。
- 生成器配置在 `agentloom-server/openapitools.json` 的 `typescriptModels` 条目；必须保留 `withoutRuntimeChecks: true`。
- 公共导入使用 `@agentloom/api-client`，不要让消费者依赖 `src/models.ts` 或 server SDK 内部路径。
- `src/index.ts` 保持窄 barrel；不要在这里加入 envelope 转换、认证、重试、请求封装或手写 DTO。
- 新增手写运行时代码通常不属于此包；传输与响应适配应放在消费端相应 shared API 层。

## Important Files

- `agentloom-server/openapitools.json`：models 生成器及 `withoutRuntimeChecks` 配置。
- `agentloom-server/sdk/typescript-models/src/models/index.ts`：`pnpm sync` 的唯一输入。
- `agentloom-studio/src/shared/api/client.ts`：Studio 的 ky transport，不属于本包产物。
- 根 `package.json`：`contracts:regen` 的实际编排顺序。

## Runtime/Tooling Preferences

- Node 22 + pnpm（workspace 成员，依赖由根 lockfile 管理）。
- tsup 输出 ESM + CJS + `.d.ts`；TypeScript ES2022 / Bundler resolution / strict / noEmit typecheck。
- 生成器为 openapi-generator-cli 7.9.0，由 `agentloom-server/openapitools.json` 驱动；本包不直接调用生成器。

## Testing & QA

本包没有独立测试套件。变更生成链或导出边界时，至少执行 `pnpm typecheck` 与 `pnpm build`；契约内容变更使用根 `pnpm contracts:regen` 验证端到端生成。

`sync-models.mjs` 会在复制前 fail-fast：源文件不存在则提示先运行 server models 生成；检测到 `from '../runtime'` 则拒绝同步；找不到任何 `export interface` 也拒绝同步。校验通过后，它创建目标目录并原样复制文件，不做文本改写。
