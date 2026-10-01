---
docType: reference
---

# LLM 模型

为 Agent 或智能路由提供一份模型配置（Provider、模型与推理参数）。节点本身不调用模型，只把选定的模型配置通过「模型」端口交给下游。

## 端口与配置

<!--@include: ../../_generated/nodes/llm-model.md-->

## 使用要点

- 配置面板标题为「LLM 模型配置」，可「选择已有配置」或「创建新配置」；新建时需要填写配置名称、选择 Provider 与模型，可选 Temperature（0–2）、Max Tokens、Top P（0–1）、Frequency Penalty / Presence Penalty（-2–2）与超时时间（5000–600000 ms）。保存后的配置在侧边栏「资源 → LLM 模型」中统一管理。
- 执行时节点读取所绑定的模型配置 ID，并把它作为「模型」端口的输出；未绑定配置时节点失败，错误信息为 `LLM 模型节点缺少 llmModelConfigId`。
- 「模型」端口可同时连接多个下游，常见目标是 Agent 画布中 Agent Main 节点的「模型」端口，或 [智能路由](/guide/nodes/smart-routing) 的「模型 1 / 模型 2」端口。工作流画布上的 [Agent](/guide/nodes/agent) 节点没有模型输入端口，它使用所绑定 Agent 自己的模型配置。

## 相关

- [智能路由](/guide/nodes/smart-routing)
- [创建 Agent](/guide/agents/creating)
