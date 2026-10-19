---
docType: reference
---

# Agent

在工作流中调用一个已发布的 Agent：把上游文本作为输入交给该 Agent，等它完成后把回复交给下游节点。Agent 的模型、系统提示词、工具、知识库、记忆与子 Agent 在 Agent 自己的画布上配置；工作流里的 Agent 节点负责绑定和调用，并可以通过输入端口为本次调用覆盖模型、系统提示词与输出 Schema，或追加知识库、Skill 与 MCP 工具。

## 端口与配置

<!--@include: ../../_generated/nodes/agent.md-->

## 使用要点

- 在配置面板「选择 Agent」中搜索并选择一个已发布的 Agent（列表为空时显示「暂无已发布的 Agent」），再在「版本」中选择具体版本；不选版本时占位文案为「使用最新发布版本」。
- 节点必须绑定已发布的 Agent。没有绑定时运行会失败，错误信息为 `agent 节点必须绑定已发布的 Agent Definition；画布上的内联 Agent 配置已不再支持`。旧工作流中残留的内联配置会在面板中以「旧版内联 Agent 配置（已废除，不再参与执行）」只读显示：把其中的系统提示词复制到一个 [Text](/guide/nodes/text) 节点，再连到本节点的「系统提示词」端口。
- Agent 列表中每一项带有「有沙箱」或「无沙箱」标记，对应 Agent 的运行模式 `sandbox` / `no_sandbox`。选择「无沙箱」的 Agent 后，面板提示「输入端口将移除 `sandbox-in`」，节点不再显示「沙箱」端口。运行模式的选择见 [创建 Agent](/guide/agents/creating)。
- 无沙箱 Agent 不能调用有沙箱的子 Agent，运行时报错 `无 sandbox Agent 不支持调用有 sandbox 的子 Agent`；有沙箱的 Agent 可以调用无沙箱子 Agent。
- 「模型」端口接 [LLM 模型](/guide/nodes/llm-model) 的「模型」或 [智能路由](/guide/nodes/smart-routing) 的「选定模型」，本次调用改用该模型：Agent 自己画布上的模型与智能路由都不再生效，也不记录 Agent 侧的路由决策；思考强度按「默认」处理（Agent 画布上 LLM 模型节点设置的强度不随之生效）。不连时使用 Agent 自己的模型配置。
- 「知识库」端口接一个或多个 [Knowledge Base](/guide/nodes/knowledge-base) 节点的「知识库」端口，与 Agent 自己画布上的知识库合并（同一知识库只算一次），Agent 运行时通过 `search_knowledge` 工具检索。
- 「扩展工具」端口只接 [MCP Tool](/guide/nodes/mcp-tool) 节点的「工具」端口。工作流里的 [HTTP Request](/guide/nodes/http-tool)、[Code Executor](/guide/nodes/code-tool) 是按顺序执行的步骤，输出的是数据而不是工具，不能连到这里；要让 Agent 把它们当工具调用，在 Agent 画布上把它们连到 Agent Main 的「工具」端口。
- 工作流 Agent 节点没有「子 Agent」端口：工作流里没有节点能产出子 Agent，子 Agent 在被调用 Agent 的画布上连到 Agent Main。旧工作流中连到 `sub-agents-in` 的连线会让发布失败（422），错误信息为 `工作流 Agent 节点 <节点名> 不支持「子 Agent」端口 (sub-agents-in)：子 Agent 请在被调用 Agent 的 Agent 画布上连接到 Agent Main`，删除该连线后再发布。
- 「回复」端口输出 Agent 的文本回复。「Schema」端口（或 Agent 定义里的输出 Schema）会被追加到系统提示词中，要求模型按 Schema 回复 JSON；配置了 Schema 时，节点结束后服务端把回复解析为 JSON（包住整段回复的 ```` ```json ```` 围栏会被去掉）并按 Schema 校验，通过后从「结构化」端口输出该对象。回复不是合法 JSON 或不符合 Schema 时节点失败，错误信息以 `Agent 回复不是合法 JSON` 或 `Agent 回复不符合输出 Schema` 开头。没有配置 Schema 时「结构化」端口没有值。
- 节点暂停等待人工干预后，「批准」采用的原回复和「修改」提交的内容都会按同一 Schema 重新校验，通过后写入「结构化」端口；修改后的内容不符合 Schema 时节点失败。
- 组织的 [自治策略](/guide/collaboration/autonomy-policy) 为人工确认模式，或 Agent 主动请求干预时，节点会暂停在等待干预状态，处理后再继续，而不是直接完成。
- 有沙箱的 Agent 运行结束（成功或失败）后，沙箱中的工作区会被归档。

## 相关

- [Agent 概述](/guide/agents/)
- [在工作流中使用 Agent](/guide/agents/in-workflows)
- [Skill](/guide/nodes/skill)
- [MCP Tool](/guide/nodes/mcp-tool)
- [Sandbox](/guide/nodes/sandbox)
