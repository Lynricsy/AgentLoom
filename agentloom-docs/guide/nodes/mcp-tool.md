---
docType: reference
---

# MCP Tool

把一个已接入的 MCP Server 中选定的工具注册给 Agent。节点本身不调用工具，它通过「工具」端口输出工具描述，由 Agent 在对话中按需调用。

## 端口与配置

<!--@include: ../../_generated/nodes/mcp-tool.md-->

## 使用要点

- 在配置面板中先「选择 MCP Server」，再从该 Server 已激活的工具中勾选（支持「全选」/「取消全选」与「搜索工具」）。可选的 Server 来自侧边栏「资源 → MCP 服务」，接入方法见 [MCP 工具](/guide/integrations/mcp-tools)。
- 未选择 Server 或工具时节点**不会失败**：它以完成状态结束，输出中带 `warning` 字段。Agent 调不到工具时先检查该节点的输出。
- 「工具」端口连接到 [Agent](/guide/nodes/agent) 节点的「扩展工具」端口，或 Agent 画布中 Agent Main 的「工具」端口。Agent 画布中该节点名称显示为「MCP 工具」。

## 相关

- [MCP 工具](/guide/integrations/mcp-tools)
- [Agent](/guide/nodes/agent)
