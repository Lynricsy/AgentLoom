<!-- 由 scripts/docs-reference/generate.ts 生成，勿手改；运行 pnpm docs:gen -->

类型 `merge`，分类 Control。来源：`agentloom-studio/src/features/canvas/types/nodeTypeRegistry.ts`。

**输入端口**

| 端口 ID | 名称 | 数据类型 | 必填 | 多连接 | 说明 |
| --- | --- | --- | --- | --- | --- |
| `exec-in` |  | `exec` |  |  | 执行流入口，前序节点完成后触发合并逻辑 |
| `input-0` | 输入 1 | `json` |  |  | 第 1 路输入，等待所有输入就绪后进行合并 |
| `input-1` | 输入 2 | `json` |  |  | 第 2 路输入，等待所有输入就绪后进行合并 |

**输出端口**

| 端口 ID | 名称 | 数据类型 | 必填 | 多连接 | 说明 |
| --- | --- | --- | --- | --- | --- |
| `exec-out` |  | `exec` |  |  | 执行流出口，合并完成后触发下游节点 |
| `merged-out` | 合并结果 | `json` |  |  | 将所有输入路的数据合并为一个 JSON 对象后输出 |

**配置项**

| 配置键 | 名称 | 类型 | 默认值 | 必填 | 说明 |
| --- | --- | --- | --- | --- | --- |
| `mode` | 合并模式 | `string` | `"append"` | 是 | 取值：`append` / `merge-by-key` |
| `mergeKey` | 合并键 | `string` |  |  |  |
| `inputCount` | 输入数量 | `number` | `2` |  |  |
