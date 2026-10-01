---
docType: howto
---

# Agent 记忆

本页说明如何让 Agent 跨对话保留信息：创建一个记忆实例，并把它绑定到 Agent。前提：你可以编辑目标 Agent。

## 创建记忆实例

1. 在侧边栏「资源」组点击「记忆」，进入「记忆实例」页面（`/resources/memory-instances`）。
2. 点击「创建记忆实例」，在对话框中填写：
   - 「名称」（必填）与「描述」。
   - 「有效域」：输入域名后按 Enter 添加。
   - 「核心记忆 URI」：输入 URI 后按 Enter 添加。
   - 「系统提示词覆盖」：可选，覆盖 Agent 默认系统提示词。
3. 点击「创建」。

提示「已创建」，新实例出现在列表中，状态为「活跃」。

## 绑定到 Agent

1. 打开 Agent 画布，从节点面板「记忆」分组把「Memory」拖到画布上。
2. 在配置面板「选择 Memory 实例」，再「选择角色」：「primary（可读写）」或「readonly（只读）」。
3. 把 Memory 的「记忆」端口连到 Agent Main 的「记忆」端口，保存并发布 Agent。

一个 Agent 可以连接多个 Memory 节点。各配置项见 [Memory 节点](/guide/nodes/memory)。

## 查看与维护记忆

- 在记忆实例卡片上点击「浏览」，查看实例中的记忆内容（`/resources/memory-instances/:instanceId/browse`）。
- 卡片的「更多操作」菜单提供「编辑」（修改域、核心记忆 URI 与系统提示词覆盖）、「归档」/「激活」和「删除」。
