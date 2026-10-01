<!-- 由 scripts/docs-reference/generate.ts 生成，勿手改；运行 pnpm docs:gen -->

类型 `input-preprocessor`，分类 Tool。来源：`agentloom-studio/src/features/canvas/types/nodeTypeRegistry.ts`。

**输入端口**

| 端口 ID | 名称 | 数据类型 | 必填 | 多连接 | 说明 |
| --- | --- | --- | --- | --- | --- |
| `exec-in` |  | `exec` |  |  | 执行流入口，前序节点完成后触发预处理 |
| `text-in` | 文本 | `text` |  |  | 接收待预处理的原始文本，如用户输入或上游节点的文本输出 |
| `json-in` | JSON | `json` |  |  | 接收待预处理的原始 JSON 数据 |

**输出端口**

| 端口 ID | 名称 | 数据类型 | 必填 | 多连接 | 说明 |
| --- | --- | --- | --- | --- | --- |
| `exec-out` |  | `exec` |  |  | 执行流出口，预处理完成后触发下游节点 |
| `text-out` | 文本 | `text` |  | 不限 | 经过预处理规则转换后的文本，可连接多个下游节点 |
| `json-out` | JSON | `json` |  | 不限 | 经过预处理规则转换后的 JSON 数据，可连接多个下游节点 |

**配置项**

| 配置键 | 名称 | 类型 | 默认值 | 必填 | 说明 |
| --- | --- | --- | --- | --- | --- |
| `transformType` | 转换类型 | `string` | `"jmespath"` | 是 | 取值：`jmespath` / `jsonata` / `template` / `script` |
| `expression` | 转换表达式 | `string` |  | 是 |  |
| `outputFormat` | 输出格式 | `string` |  |  |  |
