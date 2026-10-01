<!-- 由 scripts/docs-reference/generate.ts 生成，勿手改；运行 pnpm docs:gen -->

类型 `code-tool`，分类 Tool。来源：`agentloom-studio/src/features/canvas/types/nodeTypeRegistry.ts`。

**输入端口**

| 端口 ID | 名称 | 数据类型 | 必填 | 多连接 | 说明 |
| --- | --- | --- | --- | --- | --- |
| `exec-in` |  | `exec` |  |  | 执行流入口，前序节点完成后触发代码执行 |
| `input-in` | 参数 | `json` |  |  | 以 JSON 形式传入代码的输入参数，在代码中通过 input 变量访问 |

**输出端口**

| 端口 ID | 名称 | 数据类型 | 必填 | 多连接 | 说明 |
| --- | --- | --- | --- | --- | --- |
| `exec-out` |  | `exec` |  |  | 执行流出口，代码执行完成后触发下游节点 |
| `result-out` | 返回值 | `json` |  |  | 代码赋值给 output 变量的值（JavaScript / TypeScript / Python）；Bash 取 stdout 最后一行 JSON |
| `stdout-out` | stdout | `text` |  |  | 代码执行过程中 console.log / print 输出的文本内容 |

**配置项**

| 配置键 | 名称 | 类型 | 默认值 | 必填 | 说明 |
| --- | --- | --- | --- | --- | --- |
| `language` | 语言 | `string` |  | 是 | 取值：`typescript` / `javascript` / `python` / `bash` |
| `code` | 代码 | `string` | `""` |  |  |
| `description` | 描述 | `string` |  |  |  |
| `timeout` | 超时时间 | `number` | `30` |  |  |
