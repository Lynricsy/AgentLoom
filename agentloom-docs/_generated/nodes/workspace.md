<!-- 由 scripts/docs-reference/generate.ts 生成，勿手改；运行 pnpm docs:gen -->

类型 `workspace`，分类 Tool。来源：`agentloom-studio/src/features/canvas/types/nodeTypeRegistry.ts`。

**输入端口**

| 端口 ID | 名称 | 数据类型 | 必填 | 多连接 | 说明 |
| --- | --- | --- | --- | --- | --- |
| `exec-in` |  | `exec` |  |  | 执行流入口，前序节点完成后暴露工作区卷 |

**输出端口**

| 端口 ID | 名称 | 数据类型 | 必填 | 多连接 | 说明 |
| --- | --- | --- | --- | --- | --- |
| `exec-out` |  | `exec` |  |  | 执行流出口，工作区节点完成后触发下游节点 |
| `volume-out` | 工作区 | `volume` |  |  | 持久化存储卷，可跨多次执行保留文件，需连接到沙箱节点使用 |

**配置项**

| 配置键 | 名称 | 类型 | 默认值 | 必填 | 说明 |
| --- | --- | --- | --- | --- | --- |
| `workspaceId` | Workspace ID | `string` |  | 是 |  |
| `workspaceName` | 工作区名称 | `string` |  |  |  |
