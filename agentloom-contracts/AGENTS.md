# @agentloom/contracts 知识库

## 职责

`@agentloom/contracts` 是 server、Studio 与 mobile 共享 wire 格式的唯一来源。包使用 Zod 4 定义运行时 schema，并通过 tsup 输出 ESM、CJS 与类型声明。插件生态包 `@agentloom/plugin-sdk` 保持 Zod 3，不依赖本包的 Zod runtime。

## 目录

| 路径 | 职责 |
| --- | --- |
| `src/port-data-type.ts` | `PORT_DATA_TYPES` 14 值全集、schema 与方向类型 |
| `src/workflow-graph.ts` | workflow node、edge、viewport schema |
| `src/agent-events.ts` | Agent event、工具调用状态与子代理信封 |
| `src/execution-events.ts` | 10 个执行事件名、信封、payload schema、回放快照、`parseExecutionEvent()` |
| `src/agent-runtime-config.ts` | Agent runtime、routing、retrieval、sandbox 与 policy 配置 |
| `src/index.ts` | 公开 barrel |
| `fixtures/` | server wire 形状的三端 contract-test JSON |
| `src/fixtures.test.ts` | fixtures 对 schema 的解析测试 |
| `src/port-data-type.test.ts` | Rust、plugin-sdk、Studio、server 端口类型集合的机械同步测试 |

## 关键约定

- wire 字段使用 server 实际输出形状；Socket 执行事件为 camelCase。
- `PORT_DATA_TYPES` 固定为 `model|text|json|array|image|audio|tool|sandbox|knowledge|skill|agent|memory|exec|volume`。各端集合必须是全集子集，各端并集必须等于全集。
- 执行协议包含 10 个事件名、`ExecutionEventEnvelopeSchema`、10 个 payload schema 与 `ExecutionStateSnapshotSchema`。解析未知事件或不合法 payload 使用 `parseExecutionEvent()` 的 fail-closed 行为。
- Agent runtime config 的 canonical 字段为 `similarityThreshold`、`candidateModelIds`、`fallbackModelId`、`cpu`、`memory`。旧 alias 只在 server 读入边界归一，不进入本包 schema 的写出形状。
- 修改 schema 时同步更新公开 barrel、fixtures、三端消费者与 contract tests；不要在 server 或客户端重新声明同名 wire 类型。

## 命令

```bash
pnpm typecheck
pnpm test
pnpm build
```

从仓库根运行 `pnpm test:all`、`pnpm typecheck:all` 与 `pnpm build:all` 可覆盖 workspace 对应检查。
