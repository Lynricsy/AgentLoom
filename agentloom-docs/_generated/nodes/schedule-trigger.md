<!-- 由 scripts/docs-reference/generate.ts 生成，勿手改；运行 pnpm docs:gen -->

类型 `schedule-trigger`，分类 Trigger。来源：`agentloom-studio/src/features/canvas/types/nodeTypeRegistry.ts`。

**输入端口**

无。

**输出端口**

| 端口 ID | 名称 | 数据类型 | 必填 | 多连接 | 说明 |
| --- | --- | --- | --- | --- | --- |
| `exec-out` |  | `exec` |  |  | 执行流出口，定时触发后启动工作流 |
| `payload-out` | 触发数据 | `json` |  |  | 定时触发时的调度信息（触发时间、Cron 表达式等） |

**配置项**

| 配置键 | 名称 | 类型 | 默认值 | 必填 | 说明 |
| --- | --- | --- | --- | --- | --- |
| `cron` | Cron | `string` |  | 是 |  |
| `timezone` | 时区 | `string` | `"UTC"` |  |  |
