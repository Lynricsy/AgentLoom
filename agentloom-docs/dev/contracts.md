---
docType: reference
---

# 契约与代码生成

跨端共享的 wire 形状有两条来源：Socket.IO 事件、画布图、Agent 运行时配置等由 `agentloom-contracts/`（`@agentloom/contracts`）用 Zod schema 手写定义；REST DTO 由 server 的 OpenAPI 文档生成到 `agentloom-api-client/`（`@agentloom/api-client`）。插件 SDK `agentloom-plugin-sdk/` 不依赖这两个包，只镜像端口类型字面量。

## `@agentloom/contracts` 内容

包的唯一公开入口是 `agentloom-contracts/src/index.ts`，消费者只从 `@agentloom/contracts` 导入；构建由 tsup 输出 ESM、CJS 与 `.d.ts`。依赖使用 workspace catalog 中的 Zod 4。

| 用途 | 文件 | 内容 |
| --- | --- | --- |
| 端口类型 | `agentloom-contracts/src/port-data-type.ts` | `PORT_DATA_TYPES`、`PortDataTypeSchema`、`PORT_DIRECTIONS` |
| 端口类型 | `agentloom-contracts/src/port-compatibility.ts` | `PORT_DATA_TYPE_TRANSFORM_RULES`、`isPortDataTypeCompatible`，见 [类型引擎](/dev/type-engine) |
| 画布 | `agentloom-contracts/src/workflow-graph.ts` | 节点、边、位置、视口与完整画布图 schema |
| 实时事件 | `agentloom-contracts/src/execution-events.ts` | `/execution` 与 `/agent-conversation` namespace 的事件名 `EXECUTION_EVENT_NAMES`、载荷 schema、事件信封、回放快照、`parseExecutionEvent()` |
| 实时事件 | `agentloom-contracts/src/agent-events.ts` | Agent 运行时事件、工具调用状态与权限请求 |
| 实时事件 | `agentloom-contracts/src/conversation-events.ts` | 对话断线兜底事件 `conversation.state.snapshot` |
| Agent 配置 | `agentloom-contracts/src/agent-runtime-config.ts` | `AGENT_RUNTIME_MODES`（`sandbox` \| `no_sandbox`）、模型、工具、知识库、路由、沙箱配置与递归子 Agent |
| 对外 API | `agentloom-contracts/src/agent-api-events.ts` | `/api/v1/agent-api/**` 的 run 资源与 SSE 事件，见 [Agent API](/api/agent-api) |
| 权限 | `agentloom-contracts/src/rbac.ts` | `ORG_ROLES`、`OrgRole`、`RBAC_PERMISSION_MATRIX`、`Permission`、`PERMISSIONS`、`hasPermission()`、`parsePlatformApiScopes()`；server 的 `@RequirePermission` / `RolesGuard` / `ApiScopeGuard` 与 Studio 导航过滤共用这一份矩阵，平台 API Token 的 `scopes` 取值也是这里的权限名 |
| fixtures | `agentloom-contracts/fixtures/` | 合法 server wire JSON，随包发布（`./fixtures/*` 导出），供 contracts、server、Studio、mobile 的契约测试读取 |

Socket 事件信封与载荷保持 camelCase，不套用 REST 的大小写转换。server 的部分模块路径会再导出 contracts 的类型；定义源只在本包，不要在 server 再声明同名契约。

### 测试

| 测试文件 | 校验内容 |
| --- | --- |
| `agentloom-contracts/src/port-data-type.test.ts` | 读取四处源码镜像，断言各端取值都属于 `PORT_DATA_TYPES`，且四端并集恰好等于全集 |
| `agentloom-contracts/src/port-compatibility.test.ts` | 从 Rust `CompatibilityChecker::default()` 提取转换规则，断言与 `PORT_DATA_TYPE_TRANSFORM_RULES` 逐条相等（含顺序），并校验 `isPortDataTypeCompatible` 全矩阵 |
| `agentloom-contracts/src/fixtures.test.ts` | 事件信封与回放快照 fixture 精确解析；`fixtures/execution-events/` 的文件集合与 `EXECUTION_EVENT_NAMES` 一一对应，且每个载荷通过对应 schema；runtime config fixture 保持 canonical 字段名，旧别名（如 `scoreThreshold`）不被接受 |
| `agentloom-contracts/src/agent-api-events.test.ts` | `fixtures/agent-api/` 下的 SSE 事件 fixture |
| `agentloom-contracts/src/callback-header.test.ts` | 沙箱回调令牌头名在 guest、runtime-manager、server 三端一致，见 [Firecracker 沙箱运行时](/dev/firecracker-runtime) |

`port-data-type.test.ts` 比对的四个镜像：

- `agentloom-type-engine/src/types/port.rs`：`pub enum PortDataType` 的变体，转小写；
- `agentloom-plugin-sdk/src/types/port.ts`：`const portDataTypes = [...]`；
- `agentloom-studio/src/features/canvas/types/typeSchema.ts`：`export const PORT_DATA_TYPES = [...]`；
- `agentloom-server/src/modules/workflow-definition/utils/normalize-workflow-graph.utils.ts`：`type PortDataType = ...` 联合类型。

测试用正则读取源码文本，改端口类型字面量时同批修改所有镜像；不要放宽提取规则让测试通过。

在 `agentloom-contracts/` 下运行这三个测试文件（2026-10-01 实跑）：

```bash
npx vitest run src/port-data-type.test.ts src/fixtures.test.ts src/port-compatibility.test.ts
```

```text
 Test Files  3 passed (3)
      Tests  222 passed (222)
```

包内命令：`pnpm typecheck`、`pnpm test`（`vitest run`）、`pnpm build`（tsup）；从仓库根运行时加 `--filter @agentloom/contracts`。

## `@agentloom/api-client` 与 `pnpm contracts:regen`

`agentloom-api-client/src/models.ts` 是生成产物，禁止手改；类型错误应在 server 的 DTO / Swagger schema 处修正，再重新生成。`agentloom-api-client/src/index.ts` 只重新导出 `./models`，本包不含请求客户端，也没有 OpenAPI runtime；Studio 的 HTTP 传输层在 `agentloom-studio/src/shared/api/client.ts`。

根 `package.json` 的 `contracts:regen` 依次执行：

| 步骤 | 命令 | 产出 |
| --- | --- | --- |
| 1 | `pnpm --filter agentloom-server run openapi:export` | 先 `pnpm build` 构建 server，再由 `agentloom-server/scripts/export-openapi-spec.mjs` 写出 `agentloom-server/sdk/openapi.json` |
| 2 | `pnpm --filter agentloom-server run sdk:generate:models` | openapi-generator（`agentloom-server/openapitools.json` 的 `typescriptModels`，`typescript-fetch` + `withoutRuntimeChecks: true`）输出 `agentloom-server/sdk/typescript-models/src/models/index.ts` |
| 3 | `pnpm --filter @agentloom/api-client run sync` | `agentloom-api-client/scripts/sync-models.mjs` 原样复制到 `agentloom-api-client/src/models.ts` |
| 4 | `pnpm --filter @agentloom/api-client run build` | tsup 输出 `dist/` |

第 1 步需要 Redis 可达：导出脚本用 `NestFactory.create(AppModule)` 启动完整应用，`agentloom-server/src/common/redis/redis-pubsub.service.ts` 的 `onModuleInit` 会订阅缓存失效频道。脚本为未设置的变量填入导出用默认值，其中 `APP_REDIS_URL` 默认 `redis://127.0.0.1:6379/0`。导出脚本还会修正 OpenAPI 3.0 不支持的形状：通配路由参数改名、Zod 元组降级为 `items` + `minItems`/`maxItems`、纯标量 `anyOf` 改为 `oneOf`。

`sync-models.mjs` 在复制前拒绝三种输入：源文件不存在、内容含 `from '../runtime'`（说明 `withoutRuntimeChecks` 未生效）、没有任何 `export interface`。

`contracts:regen` 不会更新 `@agentloom/contracts`、mobile 的 Dart 模型、端口类型镜像或 fixtures；只改 Socket 或内部契约时它不起作用。

## `@agentloom/plugin-sdk` 的 Zod 3 边界

`agentloom-plugin-sdk/package.json` 直接依赖 `zod: ^3.23.0`，不使用 workspace catalog 中的 Zod 4（`pnpm-workspace.yaml` 中注明了这一例外）。SDK 发布给外部插件作者，运行时 schema 与类型推导要与 Zod 3 生态兼容，因此它不依赖 `@agentloom/contracts` 的 Zod runtime；端口类型字面量靠 `port-data-type.test.ts` 保持同步。插件开发见 [插件开发](/api/plugins/)。
