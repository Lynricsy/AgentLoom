---
docType: index
---

# Agent

Agent 是一个可以独立完成推理任务的智能体。它的能力在 Agent 画布上配置：画布中心是自动创建的 Agent Main 节点，LLM 模型、Text（系统提示词）、工具、知识库、记忆、Skill、沙箱与子 Agent 等节点连到它的端口上。Agent 发布后才能被对话、工作流和外部 API 使用。

| 你要做的事 | 页面 |
| --- | --- |
| 新建 Agent，选择运行形态，连接模型与能力，发布 | [创建 Agent](/guide/agents/creating) |
| 在 Studio 中与 Agent 对话、上传文件、查看沙箱 | [与 Agent 对话](/guide/agents/conversations) |
| 让 Agent 跨对话保留信息 | [Agent 记忆](/guide/agents/memory) |
| 在工作流中调用 Agent | [在工作流中使用 Agent](/guide/agents/in-workflows) |
| 让外部系统通过 API 调用 Agent | [通过 API 调用 Agent](/guide/agents/api-access) |

Agent 画布可用的节点：Agent Main（自动创建）、[LLM 模型](/guide/nodes/llm-model)、[智能路由](/guide/nodes/smart-routing)、[HTTP Request](/guide/nodes/http-tool)、[Code Executor](/guide/nodes/code-tool)、[MCP Tool](/guide/nodes/mcp-tool)、[Knowledge Base](/guide/nodes/knowledge-base)、[Text](/guide/nodes/text)、[Memory](/guide/nodes/memory)、子 Agent、[输入预处理器](/guide/nodes/input-preprocessor)、[Skill](/guide/nodes/skill)、[Sandbox](/guide/nodes/sandbox)、[Workspace](/guide/nodes/workspace)。
