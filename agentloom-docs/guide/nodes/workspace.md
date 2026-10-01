---
docType: reference
---

# Workspace

把一个持久化工作区作为存储卷交给沙箱，让沙箱中的文件跨多次执行保留。

## 端口与配置

<!--@include: ../../_generated/nodes/workspace.md-->

## 使用要点

- 在配置面板中「选择工作区」；可选的工作区来自侧边栏「资源 → 工作区」。
- 未选择工作区时节点失败，错误信息为 `Workspace node requires workspaceId`。
- 「工作区」端口只能连接到 [Sandbox](/guide/nodes/sandbox) 节点的「工作区」端口，不能直接连到 Agent。
- Agent 画布中该节点名称显示为「工作区」，每个 Agent 画布最多一个。

## 相关

- [Sandbox](/guide/nodes/sandbox)
- [Agent](/guide/nodes/agent)
