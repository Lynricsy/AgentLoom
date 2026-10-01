# Repository Guidelines

## 概述

跨端 wire 契约包：Zod 4 schema 同时提供运行时校验与推导类型，只描述线上传输或持久化边界，不承载业务服务、兼容转换或 UI 模型。跨包规则见根 `AGENTS.md`。
内容清单、再生成与同步测试：`agentloom-docs/dev/contracts.md`。

## 本包硬规则

- 文件 kebab-case；常量数组 `UPPER_SNAKE_CASE` + `as const`；schema 命名 `PascalCaseSchema`，类型用 `z.infer<typeof ...Schema>`。
- 先定义可复用 schema 再推导类型，不维护可漂移的手写 interface（递归 sub-agent 类型除外）。
- wire 对象用 `z.object()` 明确字段；枚举用 `z.enum()` 或 literal discriminated union；未知输入在边界解析，不用类型断言绕过校验。
- 可选、可空、必填是三种不同契约，按 server 实际输出选择。
- `agent-runtime-config.ts` 只写出 canonical 名称（`similarityThreshold`、`candidateModelIds`、`fallbackModelId`、`cpu`、`memory`）；输入别名归一属于 server 边界。
- 工具绑定按 `toolType` 区分 `mcp`、`http`、`code`；无 `toolType` 的存量形状由 `LegacyAgentToolBindingSchema` 表达。
- 新公共模块或导出必须加入 `src/index.ts`；消费者只从 `@agentloom/contracts` 入口导入。
- `PORT_DATA_TYPES` 是端口类型全集；`src/port-data-type.test.ts` 读取 type-engine、plugin-sdk、Studio、server 四处镜像做机械校验。改端口字面量必须同批同步所有镜像，不得放宽测试提取规则。
- 端口变换规则先改 Rust（`agentloom-type-engine/src/checker/compatibility.rs`），再改 `src/port-compatibility.ts`。
- `fixtures/` 是 server 实际输出形状，路径稳定（Dart 侧按相对路径读取）。

## 命令

见本包 `README.md`。

## 改动时更新

端口类型或 Socket 事件变化 → 仓库根 `pnpm docs:gen`；契约结构变化 → 更新 `agentloom-docs/dev/contracts.md` 与相关 `dev/server/realtime.md`。
