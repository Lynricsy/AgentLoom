---
docType: explanation
---

# 技能

> 本页回答：技能是什么，Agent 什么时候会用到它？

技能（Skill）是可复用的提示词与文件包：一份 `SKILL.md` 正文（可带 YAML frontmatter）加上可选的附件。技能本身不会自动生效；只有把 [Skill 节点](/guide/nodes/skill) 连到 Agent 画布中 Agent Main 的「Skills」端口，或连到工作流中 [Agent 节点](/guide/nodes/agent) 的「Skills」端口，Agent 运行时才会加载这些技能的内容。

技能分两类：

- **内置技能**：平台为所有组织预置，带「内置」标记，不能删除。清单见 [内置技能](/guide/skills/built-in)。
- **自定义技能**：组织成员创建，可编辑、归档与删除，见 [管理技能](/guide/skills/managing)。

技能在侧边栏「资源」组的「技能」入口（`/resources/skills`，页面标题「技能管理」）中管理。
