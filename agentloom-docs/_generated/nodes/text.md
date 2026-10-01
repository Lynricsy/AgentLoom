<!-- 由 scripts/docs-reference/generate.ts 生成，勿手改；运行 pnpm docs:gen -->

类型 `text`，分类 Output。来源：`agentloom-studio/src/features/canvas/types/nodeTypeRegistry.ts`。

**输入端口**

无。

**输出端口**

| 端口 ID | 名称 | 数据类型 | 必填 | 多连接 | 说明 |
| --- | --- | --- | --- | --- | --- |
| `text-out` | 文本 | `text` |  | 不限 | 输出文本常量，可复用到多个下游节点 |

**配置项**

| 配置键 | 名称 | 类型 | 默认值 | 必填 | 说明 |
| --- | --- | --- | --- | --- | --- |
| `text` | 文本内容 | `string` | `""` |  |  |
