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
| `不支持的节点类型 "reusable-block"` | [Reusable Block](/guide/nodes/reusable-block) | 服务端暂不执行可复用块，改用块内的节点 |

错误信息以 `https://agentloom.dev/errors/` 开头时，对照 [错误参考](/guide/troubleshooting/errors)。

## 节点成功但结果不对

1. 打开执行调试页：在画布页点击「查看执行记录」，点击这次执行。
2. 在「调试面板」中间的时间线中依次点击上游节点，在右侧详情中查看它们的输出，找到第一个输出与预期不符的节点。
3. 对 Agent 节点，点击「打开 Agent 运行视图」查看它收到的输入与完整回复。

几种常见情况：

- **下游收到空值**：检查连线是否接在正确的端口上。[Code Executor](/guide/nodes/code-tool) 的「返回值」「stdout」端口当前不会向下游传值。
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

## 下一步

- [版本管理](/guide/workflows/versions)：修改前保存快照，必要时回看历史版本。
- [错误参考](/guide/troubleshooting/errors)：按错误类型查找含义与处理方法。
