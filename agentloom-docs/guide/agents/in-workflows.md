---
docType: howto
---

# 在工作流中使用 Agent

本页说明如何在工作流中调用一个 Agent，并把上游数据交给它、把它的回复交给下游。前提：Agent 已发布。

## 添加并绑定 Agent 节点

1. 在工作流画布中，从节点面板 Agent 分组把「Agent」拖到画布上。
2. 点击节点，在「选择 Agent」中搜索并选择 Agent（每项带「有沙箱」或「无沙箱」标记）；在「版本」中选择版本，不选则「使用最新发布版本」。

没有绑定 Agent 的节点在运行时失败。

## 连接输入与输出

| 端口 | 方向 | 接什么 |
| --- | --- | --- |
| 文本 | 输入（必填） | 交给 Agent 的输入，如 [Text](/guide/nodes/text) 节点或上游节点的文本输出 |
| 系统提示词 | 输入 | 一个 Text 节点，为本次调用覆盖 Agent 的系统提示词 |
| 上下文 | 输入 | 附加的 JSON，例如触发器的「触发数据」 |
| Skills / 扩展工具 / 子 Agent | 输入 | 为本次调用额外挂载 [Skill](/guide/nodes/skill)、[MCP Tool](/guide/nodes/mcp-tool) 或子 Agent |
| Schema | 输入 | 一个 JSON Schema，约束「结构化」输出 |
| 沙箱 | 输入 | 一个 [Sandbox](/guide/nodes/sandbox) 节点（仅有沙箱 Agent 显示该端口） |
| 回复 | 输出 | Agent 的文本回复，常接 [Text Output](/guide/nodes/text-output) |
| 结构化 | 输出 | 按 Schema 生成的 JSON，常接 [JSON Output](/guide/nodes/json-output) 或 [Condition](/guide/nodes/condition) |

模型、知识库和记忆由所绑定 Agent 自己的画布决定，工作流里的 Agent 节点没有这些端口。

## 运行时行为

- 组织的 [自治策略](/guide/collaboration/autonomy-policy) 为人工确认模式，或 Agent 请求人工干预时，节点进入「等待干预」，在节点配置面板的「介入」标签中处理后继续，见 [调试工作流](/guide/workflows/debugging)。
- 执行调试页中选中 Agent 节点后点击「打开 Agent 运行视图」，可以查看这次调用的完整消息。

完整端口与配置见 [Agent 节点](/guide/nodes/agent)。
