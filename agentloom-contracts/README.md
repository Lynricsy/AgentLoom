# @agentloom/contracts

AgentLoom 跨端契约层：server / studio / mobile 共享的 wire 格式唯一来源。

## 内容

|模块|内容|canonical 来源|
|---|---|---|
|`src/port-data-type.ts`|`PORT_DATA_TYPES` 全集与 `PortDirection`|server / studio / type-engine / plugin-sdk 实际取值并集|
|`src/workflow-graph.ts`|画布节点 / 边 / viewport|`agentloom-server/src/database/schema/workflow-definitions.schema.ts`|
|`src/agent-events.ts`|`AgentEvent` 家族、工具调用状态机、子代理信封|`agentloom-server/src/modules/agent/types/`|
|`src/execution-events.ts`|Socket 事件名、事件信封、10 个载荷、回放快照|`agentloom-server/src/modules/execution/types/execution-event.types.ts`|
|`src/agent-runtime-config.ts`|Agent 运行时配置与沙箱配置|`agentloom-server/src/modules/agent-definition/agent-runtime-config.interface.ts`|

## fixtures

`fixtures/` 是三端 contract test 的共享输入，内容为 server 实际输出形状（Socket 信封为
camelCase，字段值真实合法）。路径稳定，供 Dart 侧以相对路径读取。

## 约定

- wire casing 不做转换：Socket 信封为 camelCase，REST 保持 server 输出形状。
- server、Studio 与 mobile 的同名 wire 类型都从本包消费，不在各端重复声明。
- `PORT_DATA_TYPES` 为 14 值全集：`model|text|json|array|image|audio|tool|sandbox|knowledge|skill|agent|memory|exec|volume`。
- `src/port-data-type.test.ts` 读取 Rust、plugin-sdk、Studio 与 server 源文件，断言各端集合是全集子集且各端并集等于全集。
- Agent runtime config 写出 canonical 字段 `similarityThreshold`、`candidateModelIds`、`fallbackModelId`、`cpu`、`memory`；旧 alias 由 server 读入边界归一。

## 命令

```bash
pnpm typecheck
pnpm test
pnpm build
```
