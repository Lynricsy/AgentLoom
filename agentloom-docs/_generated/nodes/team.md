<!-- 由 scripts/docs-reference/generate.ts 生成，勿手改；运行 pnpm docs:gen -->

类型 `team`，分类 Agent。来源：`agentloom-studio/src/features/canvas/types/nodeTypeRegistry.ts`。

**输入端口**

| 端口 ID | 名称 | 数据类型 | 必填 | 多连接 | 说明 |
| --- | --- | --- | --- | --- | --- |
| `exec-in` |  | `exec` |  |  | 执行流入口，前序节点完成后启动团队任务 |
| `task-in` | 任务 | `text` | 是 |  | 团队要完成的任务描述 |
| `context-in` | 上下文 | `json` |  |  | 可选的补充上下文，原样提供给全部成员 |

**输出端口**

| 端口 ID | 名称 | 数据类型 | 必填 | 多连接 | 说明 |
| --- | --- | --- | --- | --- | --- |
| `exec-out` |  | `exec` |  |  | 执行流出口，负责人提交结果后触发下游节点 |
| `result-out` | 结果 | `json` |  |  | 负责人提交的结果：summary、artifact、knownLimitations、members、usage |
| `summary-out` | 摘要 | `text` |  |  | 结果摘要文本 |

**配置项**

无静态配置项。
