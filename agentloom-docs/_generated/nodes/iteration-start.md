<!-- 由 scripts/docs-reference/generate.ts 生成，勿手改；运行 pnpm docs:gen -->

类型 `iteration-start`，分类 Control。来源：`agentloom-studio/src/features/canvas/types/nodeTypeRegistry.ts`。

**输入端口**

无。

**输出端口**

| 端口 ID | 名称 | 数据类型 | 必填 | 多连接 | 说明 |
| --- | --- | --- | --- | --- | --- |
| `exec-out` |  | `exec` |  |  | 每个数组项开始时触发内部子图 |
| `item` | 当前项 | `json（接受任意类型）` |  |  | 当前迭代项 |
| `index` | 索引 | `json（接受任意类型）` |  |  | 当前项索引（从 0 开始） |

**配置项**

| 配置键 | 名称 | 类型 | 默认值 | 必填 | 说明 |
| --- | --- | --- | --- | --- | --- |
| `exposeTotal` | 暴露总数 | `boolean` | `false` |  |  |
| `exposeIsFirst` | 暴露首项标记 | `boolean` | `false` |  |  |
| `exposeIsLast` | 暴露末项标记 | `boolean` | `false` |  |  |
