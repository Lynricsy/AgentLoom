---
docType: reference
---

# Knowledge Base

把一个知识库绑定给 Agent，使 Agent 回答时能检索其中的文档。节点本身不做检索，它通过「知识库」端口输出知识库绑定信息，检索由 Agent 在对话中进行。

## 端口与配置

<!--@include: ../../_generated/nodes/knowledge-base.md-->

## 使用要点

- 在配置面板中「选择知识库」；可选的知识库来自侧边栏「资源 → 知识库」。未选择时面板提示「此字段为必填项」，运行时节点失败，错误信息为 `Knowledge Base node requires knowledgeBaseId`。
- 「知识库」端口连接到 Agent 画布中 Agent Main 的「知识库」端口（可连接多个知识库）。工作流画布上的 [Agent](/guide/nodes/agent) 节点没有知识库输入端口，使用所绑定 Agent 自己画布上的知识库。
- Agent 画布中该节点名称显示为「知识库」。

## 相关

- [知识库概述](/guide/knowledge-base/)
- [在工作流中使用知识库](/guide/knowledge-base/in-workflows)
- [检索配置](/guide/knowledge-base/retrieval)
