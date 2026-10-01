---
docType: reference
---

# Memory

把一个图谱记忆实例绑定给 Agent，让 Agent 跨对话保留关键信息。节点运行时为该实例创建记忆会话，并通过「记忆」端口输出。

## 端口与配置

<!--@include: ../../_generated/nodes/memory.md-->

## 使用要点

- 在配置面板中「选择 Memory 实例」（来自侧边栏「资源 → 记忆」），再「选择角色」：「primary（可读写）」或「readonly（只读）」。「引导 URIs」可逐条输入后按 Enter 添加。
- 未选择实例时面板提示「此字段为必填项」，运行时创建记忆会话失败，节点随之失败。
- 「记忆」端口连接到 Agent 画布中 Agent Main 的「记忆」端口（可连接多个）。工作流画布上的 [Agent](/guide/nodes/agent) 节点没有记忆输入端口，使用所绑定 Agent 自己画布上的记忆。

## 相关

- [Agent 记忆](/guide/agents/memory)
- [Agent](/guide/nodes/agent)
