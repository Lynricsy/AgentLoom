<!-- 由 scripts/docs-reference/generate.ts 生成，勿手改；运行 pnpm docs:gen -->

类型 `api-event-trigger`，分类 Trigger。来源：`agentloom-studio/src/features/canvas/types/nodeTypeRegistry.ts`。

**输入端口**

无。

**输出端口**

| 端口 ID | 名称 | 数据类型 | 必填 | 多连接 | 说明 |
| --- | --- | --- | --- | --- | --- |
| `exec-out` |  | `exec` |  |  | 执行流出口，API 事件到达后触发工作流 |
| `payload-out` | 触发数据 | `json` |  |  | 外部 API 事件携带的 JSON 数据（GitHub Webhook、自定义事件等） |

**配置项**

| 配置键 | 名称 | 类型 | 默认值 | 必填 | 说明 |
| --- | --- | --- | --- | --- | --- |
| `eventSource` | 事件来源 | `string` |  | 是 |  |
| `eventType` | 事件类型 | `string` |  | 是 |  |
| `filterExpression` | 过滤表达式 | `string` |  |  |  |
