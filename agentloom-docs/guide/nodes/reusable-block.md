---
docType: reference
---

# Reusable Block

把一组节点作为一个整体放到画布上复用。块从块文件导入，配置面板显示「块名称」「描述」「内部节点数」「内部连线数」与输入、输出端口，可「查看内部图」。

## 端口与配置

<!--@include: ../../_generated/nodes/reusable-block.md-->

## 使用要点

- Reusable Block 不出现在节点面板的分类列表中。要使用块：在节点面板切换到「My Blocks」标签，点击「导入」选择块文件（`.agentloom-block.json` 或 `.json`），再把块拖到画布上。
- 画布右键菜单中的「封装为可复用块」目前只提示「封装为块功能将在下一步实现」，还不能从已选节点创建块。
- 服务端执行器目前不支持该节点类型：含 Reusable Block 的工作流运行到该节点时，该节点失败，错误信息为 `不支持的节点类型 "reusable-block"`。

## 相关

- [创建工作流](/guide/workflows/creating)
- [使用模板](/guide/workflows/templates)
