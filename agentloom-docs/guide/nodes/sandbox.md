---
docType: reference
---

# Sandbox

为 Agent 提供一个隔离的代码执行环境。节点运行时创建（或恢复）沙箱会话，通过「沙箱」端口交给 Agent，Agent 在其中运行代码和终端命令。

## 端口与配置

<!--@include: ../../_generated/nodes/sandbox.md-->

## 使用要点

- 配置面板的「生命周期模式」有「临时」与「持久」两种：「临时」按本次执行创建会话，可设置 CPU（0.5–4 核）、Memory、Disk 与 Timeout（`0` 表示不超时，上限 168 小时），也可选用预设；「持久」需要「选择持久沙箱」，复用侧边栏「资源 → 沙箱」中已存在的持久沙箱。
- 「工作区」输入端口可连接 [Workspace](/guide/nodes/workspace) 节点，让沙箱内的文件读写保存到该工作区。
- 「沙箱」端口连接到 [Agent](/guide/nodes/agent) 节点的「沙箱」端口（只能连一个）。只有运行模式为「有沙箱」的 Agent 才有该端口。
- 沙箱由部署中的 Firecracker 运行时提供；部署未启用该运行时时，创建会话会失败，节点随之失败。部署要求见 [Firecracker 沙箱](/deploy/firecracker)。
- Agent 画布中该节点名称显示为「沙箱环境」，每个 Agent 画布最多一个。

## 相关

- [Workspace](/guide/nodes/workspace)
- [Agent](/guide/nodes/agent)
- [创建 Agent](/guide/agents/creating)
