---
docType: reference
---

# Text

提供一段固定文本，常用于系统提示词、固定说明或其他需要在多个节点间复用的文字。节点没有输入端口，「文本」端口可同时连到多个下游。

## 端口与配置

<!--@include: ../../_generated/nodes/text.md-->

## 使用要点

- 在配置面板的文本框中填写内容（占位文案为「输入系统提示词、固定说明或其他可复用文本...」）。
- 执行时节点原样输出配置的文本；未填写时输出空字符串，不会失败。
- 常见用法：连到 [Agent](/guide/nodes/agent) 节点的「系统提示词」端口，为本次工作流调用注入局部角色约束；或连到 Agent 画布中 Agent Main 的「系统提示词」端口。
- 需要在运行时由用户提供文本时，不要用本节点，改为在 [Manual Trigger](/guide/nodes/trigger) 中声明参数。

## 相关

- [Text Output](/guide/nodes/text-output)
- [Agent](/guide/nodes/agent)
