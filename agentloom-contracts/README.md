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

- wire casing 不做转换：Socket 信封为 camelCase，REST 保持 server 现状。
- server 是 canonical 来源；本包不新增 server 没有的字段。
- `src/port-data-type.test.ts` 读取 Rust 与 plugin-sdk 源文件文本做机械同步校验，
  任何一端新增端口类型必须先加入本包。
