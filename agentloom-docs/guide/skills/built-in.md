---
docType: reference
---

# 内置技能

内置技能由平台在初始化数据库时写入，所有组织都能在「技能管理」页面看到它们（带「内置」标记，类型筛选选「内置技能」）。内置技能不能删除；使用方法与自定义技能相同：在 Agent 画布中添加 [Skill 节点](/guide/nodes/skill)，选择技能后连到 Agent Main 的「Skills」端口。

<!--@include: ../../_generated/builtin-skills.md-->

## 使用 self-evolution 的前提

`self-evolution` 让 Agent 检查并调整自己的编排与资源。除了连接该技能，还需要在 Agent Main 配置面板的「自进化」区域打开「启用自进化」；「资源管理」「外部编辑」「沙箱管理」三个开关分别决定 Agent 能否创建并接入新的模型、Skill、MCP 等资源，能否编辑当前 Agent 之外的 Agent 与 Workflow，能否调整自身沙箱规格、工作区绑定与恢复配置。见 [创建 Agent](/guide/agents/creating)。
