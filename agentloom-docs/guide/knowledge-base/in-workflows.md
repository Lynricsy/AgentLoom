---
docType: howto
---

# 在工作流中使用知识库

本页说明如何让 Agent 检索知识库，并在工作流中使用这个 Agent。前提：知识库中至少有一个状态为「已就绪」的文档。

知识库是挂在 Agent 上的：工作流画布中的 [Agent 节点](/guide/nodes/agent) 没有知识库输入端口，它使用所绑定 Agent 自己画布上的知识库。

## 把知识库连到 Agent

1. 打开目标 Agent 的画布，从节点面板「知识」分组把「知识库」节点拖到画布上。
2. 在配置面板中「选择知识库」。
3. 把它的「知识库」端口连到 Agent Main 的「知识库」端口。一个 Agent 可以连接多个知识库。
4. 保存画布并发布 Agent。

运行时 Agent 通过 `search_knowledge` 工具检索，只能检索连接到它的知识库节点所指向的知识库。

## 在工作流中调用

在工作流中添加 Agent 节点并选择上述 Agent，把问题连到它的「文本」端口，把「回复」连到 [Text Output](/guide/nodes/text-output)。运行后可在执行调试页中点击「打开 Agent 运行视图」，查看 Agent 的检索调用与结果。

知识库节点的端口与运行时行为见 [Knowledge Base 节点](/guide/nodes/knowledge-base)。完整示例见 [RAG 文档分析](/guide/use-cases/document-analysis)。
