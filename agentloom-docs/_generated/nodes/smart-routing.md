<!-- 由 scripts/docs-reference/generate.ts 生成，勿手改；运行 pnpm docs:gen -->

类型 `smart-routing`，分类 Agent。来源：`agentloom-studio/src/features/canvas/types/nodeTypeRegistry.ts`。

**输入端口**

| 端口 ID | 名称 | 数据类型 | 必填 | 多连接 | 说明 |
| --- | --- | --- | --- | --- | --- |
| `exec-in` |  | `exec` |  |  | 执行流入口，前序节点完成后触发智能路由决策 |
| `model-in-0` | 模型 1 | `model` | 是 |  | 第一个候选模型，路由策略将从候选模型中选择最优项 |
| `model-in-1` | 模型 2 | `model` | 是 |  | 第二个候选模型，路由策略将从候选模型中选择最优项 |

**输出端口**

| 端口 ID | 名称 | 数据类型 | 必填 | 多连接 | 说明 |
| --- | --- | --- | --- | --- | --- |
| `exec-out` |  | `exec` |  |  | 执行流出口，智能路由完成后触发下游节点 |
| `model-out` | 选定模型 | `model` |  | 最多 5 | 根据路由策略（如成本优先、质量优先）选出的模型实例 |

**配置项**

| 配置键 | 名称 | 类型 | 默认值 | 必填 | 说明 |
| --- | --- | --- | --- | --- | --- |
| `strategy` | 路由策略 | `string` | `"random"` | 是 | 取值：`random` / `round_robin` / `rules` / `llm_as_router` / `fallback_chain` / `knn` / `mlp` / `elo` / `memory_bank` / `wasm_plugin` |
