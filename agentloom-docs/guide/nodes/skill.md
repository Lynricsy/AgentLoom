---
docType: reference
---

# Skill

把一个技能（Skill）的指令内容交给 Agent，作为提示词增强。节点在运行时按配置的技能 ID 解析技能内容，并通过「Skill」端口输出。

## 端口与配置

<!--@include: ../../_generated/nodes/skill.md-->

## 使用要点

- 配置面板列出当前组织处于激活状态的技能，可搜索后点选；选中后显示技能名称与描述，「清除」取消选择。未选择技能，或所选技能已被删除、停用时，面板提示「该 Skill 已删除或停用，运行时会被跳过，请重新选择」，节点标记为配置错误。
- 执行时节点按技能 ID 查找当前组织可用且处于激活状态的技能，输出其名称、描述与内容。
- 技能 ID 为空、技能不存在或未激活时，节点**不会失败**：它以完成状态结束，输出中带 `warning` 字段且技能列表为空。运行结果看起来正常但 Agent 没有用上技能时，先检查该节点的输出。
- 「Skill」端口连接到 [Agent](/guide/nodes/agent) 节点或 Agent 画布中 Agent Main 的「Skills」端口，可连接多个 Skill 节点。
- Agent 拿到技能的方式取决于运行形态：无沙箱时技能内容写入系统提示词，技能正文合计超过 50 KiB 时只写名称与描述，Agent 调用 `load_skill` 工具加载完整正文；有沙箱时技能文件写入沙箱会话目录，Agent 用文件读取工具读取。`load_skill` 只能加载连到本 Agent 的技能。详见 [创建 Agent](/guide/agents/creating#新建-agent-并选择运行形态)。

## 相关

- [技能概述](/guide/skills/)
- [内置技能](/guide/skills/built-in)
- [管理技能](/guide/skills/managing)
