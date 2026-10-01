<!-- 由 scripts/docs-reference/generate.ts 生成，勿手改；运行 pnpm docs:gen -->

类型 `mcp-tool`，分类 Tool。来源：`agentloom-studio/src/features/canvas/types/nodeTypeRegistry.ts`。

**输入端口**

| 端口 ID | 名称 | 数据类型 | 必填 | 多连接 | 说明 |
| --- | --- | --- | --- | --- | --- |
| `exec-in` |  | `exec` |  |  | 执行流入口，前序节点完成后暴露 MCP 工具描述符 |

**输出端口**

| 端口 ID | 名称 | 数据类型 | 必填 | 多连接 | 说明 |
| --- | --- | --- | --- | --- | --- |
| `exec-out` |  | `exec` |  |  | 执行流出口，MCP 工具节点完成后触发下游节点 |
| `tool-out` | 工具 | `tool` |  |  | 连接后该 MCP 工具将注册到 Agent，Agent 可在对话中按需调用 |

**配置项**

无静态配置项。
