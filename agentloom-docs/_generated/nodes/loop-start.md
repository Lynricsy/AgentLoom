<!-- 由 scripts/docs-reference/generate.ts 生成，勿手改；运行 pnpm docs:gen -->

类型 `loop-start`，分类 Control。来源：`agentloom-studio/src/features/canvas/types/nodeTypeRegistry.ts`。

**输入端口**

无。

**输出端口**

| 端口 ID | 名称 | 数据类型 | 必填 | 多连接 | 说明 |
| --- | --- | --- | --- | --- | --- |
| `exec-out` |  | `exec` |  |  | 每轮开始时触发内部子图 |
| `round` | 轮次 | `json（接受任意类型）` |  |  | 当前循环轮次（从 0 开始） |
| `state` | 当前状态 | `json（接受任意类型）` |  |  | 当前循环轮次可见的 state |

**配置项**

| 配置键 | 名称 | 类型 | 默认值 | 必填 | 说明 |
| --- | --- | --- | --- | --- | --- |
| `exposePreviousResult` | 暴露上一轮结果 | `boolean` | `false` |  |  |
| `exposeIsFirst` | 暴露首轮标记 | `boolean` | `false` |  |  |
