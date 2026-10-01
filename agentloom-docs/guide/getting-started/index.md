---
docType: explanation
---

# 什么是 AgentLoom

> 本页回答：AgentLoom 由哪些部分组成，它们之间如何配合？

AgentLoom 是一个在浏览器中使用的 AI Agent 与工作流编排平台，生产环境地址为 [https://agentloom.ling.plus/](https://agentloom.ling.plus/)。你在 Studio 中做两类事情：

- **构建 Agent**：在 Agent 画布上为一个 Agent 连接模型、系统提示词、工具、知识库、记忆、技能、沙箱与子 Agent，发布后可以直接与它对话，也可以在工作流中调用，或通过 API 让外部系统调用。
- **构建工作流**：在工作流画布上用节点和连线描述一个流程：由触发器启动，经过 Agent、HTTP 请求、代码、条件分支、循环等节点，最后由输出节点给出结果。工作流可以手动运行，也可以按定时、Webhook 或 API 事件自动运行。

Agent 与工作流并列存在：Agent 负责“一次推理任务怎么做”，工作流负责“多个步骤按什么顺序、在什么条件下做”。工作流中的 [Agent 节点](/guide/nodes/agent) 只引用一个已发布的 Agent，不在工作流里重复配置 Agent 的模型与提示词。

在此之上，Studio 还提供：

- **资源**：LLM 模型、MCP 服务、技能、知识库、记忆、工作区、沙箱、插件，在侧边栏「资源」分组中统一管理，供 Agent 与工作流引用。
- **生成应用**：用自然语言描述生成一个可预览、可公开访问的应用，见 [生成应用](/guide/generated-apps/)。
- **协作**：组织、角色、市场与开发者控制台，见 [团队协作](/guide/collaboration/)。

## 节点与端口

画布上的每个功能单元是一个节点，节点通过端口连线传递数据。每个端口有一个数据类型，只有类型兼容的端口才能连线；有些类型之间可以通过转换连接。端口类型与兼容关系如下：

<!--@include: ../../_generated/port-data-types.md-->

`exec` 类型的端口（节点上没有名称的执行流端口）表示执行顺序：上游节点完成后才触发下游节点。全部节点及其端口见 [节点参考](/guide/nodes/)。

## 接下来读什么

- [快速开始](/guide/getting-started/quickstart)：创建一个 Agent 和一个调用它的工作流，并看到输出。
- [核心概念](/guide/getting-started/core-concepts)：工作流、执行、版本、Agent 等概念的准确含义。
- [界面导览](/guide/getting-started/interface-overview)：侧边栏与设置页中每个入口的位置。
