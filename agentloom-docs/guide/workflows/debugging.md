---
docType: howto
---

# 调试工作流

本页说明工作流运行失败或输出不符合预期时，如何找到出问题的节点和原因。前提：工作流至少运行过一次，相关操作见 [运行与监控](/guide/workflows/running)。

## 找到失败的节点

1. 在画布上找到状态为失败的节点，点击它，在配置面板切换到「输出」标签。
2. 「实时执行」区域中的「执行错误」区块显示错误信息。

常见错误信息与对应节点：

| 错误信息（片段） | 节点 | 原因与处理 |
| --- | --- | --- |
| `agent 节点必须绑定已发布的 Agent Definition` | [Agent](/guide/nodes/agent) | 节点未选择 Agent，在「选择 Agent」中选一个已发布的 Agent |
| `无 sandbox Agent 不支持调用有 sandbox 的子 Agent` | [Agent](/guide/nodes/agent) | 无沙箱 Agent 挂了有沙箱的子 Agent，改用无沙箱子 Agent 或把主 Agent 改为有沙箱 |
| `HTTP Tool 节点缺少 URL 配置` | [HTTP Request](/guide/nodes/http-tool) | 填写 URL |
| `HTTP <方法> <URL> 返回 <状态码>` | [HTTP Request](/guide/nodes/http-tool) | 目标接口返回非 2xx；检查地址、认证与请求体，或关闭「非 2xx 视为失败」 |
| `代码执行超时 (30s)` | [Code Executor](/guide/nodes/code-tool) | 代码超过超时时间；调大「超时时间」或缩短代码运行时间 |
| `Code Tool 节点缺少 code 配置` | [Code Executor](/guide/nodes/code-tool) | 填写代码 |
| `InputPreprocessor: expression 不能为空` | [输入预处理器](/guide/nodes/input-preprocessor) | 填写转换表达式 |
| `LLM 模型节点缺少 llmModelConfigId` | [LLM 模型](/guide/nodes/llm-model) | 选择或创建模型配置 |
| `Workspace node requires workspaceId` | [Workspace](/guide/nodes/workspace) | 选择工作区 |
| `Knowledge Base node requires knowledgeBaseId` | [Knowledge Base](/guide/nodes/knowledge-base) | 选择知识库 |

错误信息以 `https://agentloom.dev/errors/` 开头时，对照 [错误参考](/guide/troubleshooting/errors)。

## 节点成功但结果不对

1. 打开执行调试页：在画布页点击「查看执行记录」，点击这次执行。
2. 在「调试面板」中间的时间线中依次点击上游节点，在右侧详情中查看它们的输出，找到第一个输出与预期不符的节点。
3. 对 Agent 节点，点击「打开 Agent 运行视图」查看它收到的输入与完整回复。

几种常见情况：

- **下游收到空值**：检查连线是否接在正确的端口上。[Code Executor](/guide/nodes/code-tool) 的「返回值」为空时，确认代码把结果赋给了 `output` 变量。
- **文本连到 JSON 端口，下游收到的仍是字符串**：跨类型连线会在运行时转换数据，转换失败时下游收到原值，该节点步骤的 `checkpointData.warnings` 中有一条 `port-value-transform-failed` 告警，说明哪条连线、哪个变换函数失败。常见原因是上游文本不是合法 JSON（例如 Agent 回复带有说明文字）。
- **节点没有运行，状态为已跳过**：它只连在 [Condition](/guide/nodes/condition) 未命中的分支后面，或它的所有上游都被跳过。在执行调试页对照 Condition 节点的输入检查条件规则。
- **Skill 或 MCP Tool 节点完成了但 Agent 没用上**：这两个节点缺少配置时不会失败，只在输出中带 `warning` 字段，检查它们的输出。
- **输入预处理器结果为空对象**：表达式的输入以端口 ID 为键，应写 `"json-in".field` 这类路径，见 [输入预处理器](/guide/nodes/input-preprocessor)。

## 处理等待干预的节点

节点状态为「等待干预」时，执行暂停。点击该节点，在配置面板的「介入」标签中「需要人工干预」区块查看决策理由、置信度与建议内容，然后选择：

- 「批准」：按建议继续执行。
- 「修改」：编辑「修改内容」并可填写反馈，点击「提交修改」后继续。
- 「拒绝」：可填写拒绝原因，点击「确认拒绝」。

节点何时需要人工干预由组织的 [自治策略](/guide/collaboration/autonomy-policy) 和工具栏「介入策略」面板中的设置决定。

## 从失败处恢复

失败的执行可以在原执行上恢复，不必从头重新运行。Studio 目前没有恢复入口，通过 API 调用 `POST /api/v1/executions/{executionId}/resume`（需要执行控制权限），请求体可带 `fromNodeId` 指定起点节点：

```json
{ "fromNodeId": "agent" }
```

- **哪些执行可以恢复**：只有失败的执行。已取消、已完成和运行中的执行返回 409 `execution-not-resumable`；等待干预（暂停）的执行先在「介入」标签处理。
- **运行的是哪份定义**：恢复按这次执行启动时保存的定义快照运行。执行失败后再修改画布或发布新版本，对恢复不生效；要用修改后的定义，重新运行工作流。
- **不带 `fromNodeId`**：重跑所有失败和被取消的步骤，已完成步骤保留输出。
- **带 `fromNodeId`**：该节点及其全部下游重跑（包括已完成的），其余失败和被取消的步骤也一起重跑。节点失败时，同一执行中尚未开始的其他分支会被一并取消，这些分支在恢复时同样会重新运行；不在这两类中的已完成步骤保留输出。节点 ID 不在这次执行的图中时返回 422 `execution-resume-node-not-found`。
- **只能从顶层节点恢复**：`fromNodeId` 不能是 [Loop](/guide/nodes/loop) 或 [Iteration](/guide/nodes/iteration) 容器内部的节点，否则返回 422 `execution-resume-node-inside-container`，响应的 `containerNodeId` 给出应改用的容器节点。从容器恢复时容器整体重跑：Iteration 从第一项开始，Loop 从第一轮开始，之前已处理的项或轮次不保留。

执行的步骤计数（执行页进度、`totalSteps` / `completedSteps`、恢复接口的响应、「遥测」标签的步骤数）只统计顶层节点：一个 Loop 或 Iteration 容器算一个步骤，容器内部节点不计入；已完成与已跳过的步骤都计为完成。

## 下一步

- [版本管理](/guide/workflows/versions)：修改前保存快照，必要时回看历史版本。
- [错误参考](/guide/troubleshooting/errors)：按错误类型查找含义与处理方法。
