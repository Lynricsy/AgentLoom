<!-- 由 scripts/docs-reference/generate.ts 生成，勿手改；运行 pnpm docs:gen -->

类型 `manual-trigger`，分类 Trigger。来源：`agentloom-studio/src/features/canvas/types/nodeTypeRegistry.ts`。

**输入端口**

无。

**输出端口**

| 端口 ID | 名称 | 数据类型 | 必填 | 多连接 | 说明 |
| --- | --- | --- | --- | --- | --- |
| `exec-out` |  | `exec` |  |  | 执行流出口，触发后启动工作流的后续节点 |
| `payload-out` | 触发数据 | `json` |  |  | 手动触发时传入的表单参数数据 |

**配置项**

无静态配置项。
