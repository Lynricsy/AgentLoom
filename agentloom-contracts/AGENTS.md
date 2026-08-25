# Repository Guidelines

## Project Overview

`@agentloom/contracts` 是 AgentLoom 跨端 wire 契约包。它以 Zod 4 schema 同时提供运行时校验和 TypeScript 推导类型，供 server、Studio 与共享 fixture 使用；mobile 以 Dart 模型镜像同一 wire 形状。

本包只描述线上实际传输或持久化边界，不承载业务服务、兼容转换或 UI 模型。跨包总体契约与 monorepo 约定见根 `AGENTS.md`。

## Architecture & Data Flow

```text
server canonical 形状
        ↓ 校准
src/*.ts Zod schema → src/index.ts → tsup ESM + CJS + .d.ts
        ↓                              ↓
fixtures/*.json                  server / Studio
        ↓
contracts / server / Studio / mobile contract tests
```

- Socket.IO 执行事件信封与载荷保持 camelCase；不要套用 REST 的大小写转换。
- `ExecutionEventEnvelopeSchema` 校验信封骨架；`parseExecutionEvent()` 再按 `event` 选择对应 payload schema，未知事件或非法载荷直接抛出 Zod 错误。
- server 的既有模块路径会再导出部分 contracts 类型与 schema；定义源仍是本包，不要在 server 再声明同名契约。
- Studio 通过 workspace 依赖直接消费类型、runtime config 与 fixture；mobile 无法导入 TypeScript，使用 Dart/Freezed 模型和共享 JSON fixture 保持镜像同步。

## Key Directories

| 路径 | 用途 |
| --- | --- |
| `src/port-data-type.ts` | 14 个端口类型全集、`PortDataTypeSchema`、输入/输出方向 |
| `src/workflow-graph.ts` | React Flow node、edge、position、viewport 与完整 graph schema |
| `src/agent-events.ts` | Agent 事件、工具调用状态与权限、PTY 事件、子代理信封 |
| `src/execution-events.ts` | 10 个执行事件、payload 映射、事件信封、回放快照与精确解析器 |
| `src/agent-runtime-config.ts` | model、tool、knowledge、routing、sandbox、policy 与递归 sub-agent 配置 |
| `src/index.ts` | 包唯一公开 barrel；所有公共 schema 和类型均从这里导出 |
| `fixtures/` | 跨端读取的合法 server wire JSON；`execution-events/` 每个事件一个 payload |
| `src/fixtures.test.ts` | fixture 覆盖率、精确解析与 canonical 字段断言 |
| `src/port-data-type.test.ts` | 四处下游端口类型镜像的机械同步闸门 |

## Development Commands

在 `agentloom-contracts/` 执行：

```bash
pnpm typecheck   # tsc --noEmit，严格类型检查
pnpm test        # vitest run，仅匹配 src/**/*.test.ts
pnpm build       # tsup 构建 dist/
```

在仓库根执行定向命令：

```bash
pnpm --filter @agentloom/contracts typecheck
pnpm --filter @agentloom/contracts test
pnpm --filter @agentloom/contracts build
pnpm contracts:regen
```

`contracts:regen` 执行 server OpenAPI 导出、TypeScript models 生成、api-client 同步与构建；它不会自动更新 Dart 模型、端口类型镜像或本包 fixture。

## Code Conventions & Common Patterns

- 文件使用 kebab-case；常量数组使用 `UPPER_SNAKE_CASE` 并配合 `as const`，schema 使用 `PascalCaseSchema`，类型用 `z.infer<typeof ...Schema>`。
- 先定义可复用的 Zod schema，再由 schema 推导类型；不要维护一份可漂移的手写 interface，递归 sub-agent 类型除外。
- wire 对象用 `z.object()` 明确字段；枚举值用 `z.enum()` 或 literal discriminated union。未知输入必须在边界解析，不使用类型断言绕过校验。
- 可选、可空和必填是不同契约。例：workflow `viewport` 可选且可为 `null`；snapshot 的 `result`、`checkpointData`、`lastEventId` 必须存在。
- `agent-runtime-config.ts` 的 canonical 名称包括 `similarityThreshold`、`candidateModelIds`、`fallbackModelId`、`cpu`、`memory`；输入别名归一属于 server 边界。
- 工具绑定按 `toolType` 区分 `mcp`、`http`、`code`；无 `toolType` 的存量形状由 `LegacyAgentToolBindingSchema` 表达。
- 新的公共模块或导出必须加入 `src/index.ts`；消费者只从 `@agentloom/contracts` 公共入口导入。

### PortDataType Mechanical Sync

`PORT_DATA_TYPES` 是 14 值全集：`model | text | json | array | image | audio | tool | sandbox | knowledge | skill | agent | memory | exec | volume`。

`src/port-data-type.test.ts` 直接读取并解析四处源码镜像：

- `agentloom-type-engine/src/types/port.rs`
- `agentloom-plugin-sdk/src/types/port.ts`
- `agentloom-studio/src/features/canvas/types/typeSchema.ts`
- `agentloom-server/src/modules/workflow-definition/utils/normalize-workflow-graph.utils.ts`

测试要求每端集合都是 contracts 全集的子集，且四端并集恰好等于全集。修改端口字面量时必须同批同步所有适用镜像；不要只放宽测试提取规则。

## Important Files

- `tsup.config.ts`：以 `src/index.ts` 为入口，生成 ESM、CJS、声明文件和 sourcemap，并在构建前清理 `dist/`。
- `package.json`：`import` 指向 `dist/index.js`，`require` 指向 `dist/index.cjs`，并通过 `./fixtures/*` 暴露 fixture。
- `fixtures/execution-event-envelope.json`：完整事件信封样例。
- `fixtures/execution-state-snapshot.json`：断线回放快照样例。
- `fixtures/agent-runtime-config.json`：runtime config canonical 字段样例。
- `fixtures/execution-events/*.json`：与 `EXECUTION_EVENT_NAMES` 一一对应的 10 个 payload。

## Runtime/Tooling Preferences

- 使用 Node 22、pnpm workspace、TypeScript strict mode、Vitest 4、tsup 8 与 catalog 中的 Zod 4。
- 包同时服务 ESM 与 CJS 消费者；新增依赖或导出时必须保持两种入口可用。
- `fixtures` 属于发布文件和稳定测试输入；路径调整会影响通过 package export 或仓库相对路径读取它们的消费者。
- `@agentloom/plugin-sdk` 使用 Zod 3；端口字面量需要同步，但不要让 plugin SDK 依赖本包的 Zod runtime。

## Testing & QA

- 契约字段变化时更新 schema、推导类型、barrel、相关 fixture 和 `fixtures.test.ts`；新增执行事件还需同步事件名数组、payload 映射及同名 JSON fixture。
- 检查 server 再导出与 producer、Studio 直接消费者、mobile Dart/Freezed 镜像及其 contract tests；mobile fixture 测试从 `agentloom-contracts/fixtures/` 读取文件。
- 涉及 REST/OpenAPI 输出时，再从根运行 `pnpm contracts:regen` 并检查生成的 api-client；仅 Socket 或内部 runtime 契约不应假定该命令会完成同步。
- fixture 应来自合法 server wire 形状，保留真实 casing、必填键和 nullability；不要为让 schema 通过而制造客户端不会收到的简化对象。
- 最小校验顺序为 `pnpm typecheck`、`pnpm test`、`pnpm build`；跨端改动还应运行受影响消费者的定向 contract test。
