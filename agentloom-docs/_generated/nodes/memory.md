<!-- 由 scripts/docs-reference/generate.ts 生成，勿手改；运行 pnpm docs:gen -->

类型 `memory`，分类 Memory。来源：`agentloom-studio/src/features/canvas/types/nodeTypeRegistry.ts`。

**输入端口**

| 端口 ID | 名称 | 数据类型 | 必填 | 多连接 | 说明 |
| --- | --- | --- | --- | --- | --- |
| `exec-in` |  | `exec` |  |  | 执行流入口，前序节点完成后创建记忆会话 |

**输出端口**

| 端口 ID | 名称 | 数据类型 | 必填 | 多连接 | 说明 |
| --- | --- | --- | --- | --- | --- |
| `exec-out` |  | `exec` |  |  | 执行流出口，记忆节点完成后触发下游节点 |
| `memory-out` | 记忆 | `memory` |  |  | Agent 的长期记忆存储，跨对话保留关键信息和用户偏好 |

**配置项**

| 配置键 | 名称 | 类型 | 默认值 | 必填 | 说明 |
| --- | --- | --- | --- | --- | --- |
| `memoryInstanceId` | Memory Instance | `string` |  | 是 |  |
| `role` | 角色 | `string` | `"primary"` |  | 取值：`primary` / `readonly` |
| `fusionPriority` | 融合优先级 | `number` | `1` |  |  |
| `bootUris` | 引导 URIs | `string` |  |  |  |
