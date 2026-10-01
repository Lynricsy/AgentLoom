<!-- 由 scripts/docs-reference/generate.ts 生成，勿手改；运行 pnpm docs:gen -->

类型 `webhook-trigger`，分类 Trigger。来源：`agentloom-studio/src/features/canvas/types/nodeTypeRegistry.ts`。

**输入端口**

无。

**输出端口**

| 端口 ID | 名称 | 数据类型 | 必填 | 多连接 | 说明 |
| --- | --- | --- | --- | --- | --- |
| `exec-out` |  | `exec` |  |  | 执行流出口，Webhook 请求到达后触发工作流 |
| `payload-out` | 触发数据 | `json` |  |  | Webhook 请求携带的 JSON Body 数据 |

**配置项**

| 配置键 | 名称 | 类型 | 默认值 | 必填 | 说明 |
| --- | --- | --- | --- | --- | --- |
| `authMode` | 鉴权模式 | `string` | `"simple"` |  | 取值：`simple` / `signed` |
| `ipWhitelist` | IP 白名单 | `string` |  |  |  |
