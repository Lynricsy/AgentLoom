---
docType: reference
---

# Agent

在工作流中调用一个已发布的 Agent：把上游文本作为输入交给该 Agent，等它完成后把回复与结构化结果交给下游节点。Agent 的模型、系统提示词、工具、知识库与记忆在 Agent 自己的画布上配置，工作流里的 Agent 节点只负责绑定和调用。

## 端口与配置

<!--@include: ../../_generated/nodes/agent.md-->

## 使用要点

- 在配置面板「选择 Agent」中搜索并选择一个已发布的 Agent（列表为空时显示「暂无已发布的 Agent」），再在「版本」中选择具体版本；不选版本时占位文案为「使用最新发布版本」。
- 节点必须绑定已发布的 Agent。没有绑定时运行会失败，错误信息为 `agent 节点必须绑定已发布的 Agent Definition；画布上的内联 Agent 配置已不再支持`。旧工作流中残留的内联配置会在面板中以「旧版内联 Agent 配置（已废除，不再参与执行）」只读显示：把其中的系统提示词复制到一个 [Text](/guide/nodes/text) 节点，再连到本节点的「系统提示词」端口。
- Agent 列表中每一项带有「有沙箱」或「无沙箱」标记，对应 Agent 的运行模式 `sandbox` / `no_sandbox`。选择「无沙箱」的 Agent 后，面板提示「输入端口将移除 `sandbox-in`」，节点不再显示「沙箱」端口。运行模式的选择见 [创建 Agent](/guide/agents/creating)。
- 无沙箱 Agent 不能调用有沙箱的子 Agent，运行时报错 `无 sandbox Agent 不支持调用有 sandbox 的子 Agent`；有沙箱的 Agent 可以调用无沙箱子 Agent。
- 「回复」端口输出 Agent 的文本回复；「结构化」端口输出按「Schema」端口约束生成的 JSON。
- 组织的 [自治策略](/guide/collaboration/autonomy-policy) 为人工确认模式，或 Agent 主动请求干预时，节点会暂停在等待干预状态，处理后再继续，而不是直接完成。
- 有沙箱的 Agent 运行结束（成功或失败）后，沙箱中的工作区会被归档。

## 相关

- [Agent 概述](/guide/agents/)
- [在工作流中使用 Agent](/guide/agents/in-workflows)
- [Skill](/guide/nodes/skill)
- [MCP Tool](/guide/nodes/mcp-tool)
- [Sandbox](/guide/nodes/sandbox)
