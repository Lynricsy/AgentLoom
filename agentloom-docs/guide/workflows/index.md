---
docType: index
---

# 工作流

工作流把触发器、Agent、工具和控制节点连成一条可重复运行的链路。整体结构是有向无环图：数据只从上游流向下游；需要重复执行时，使用 [Loop](/guide/nodes/loop) 或 [Iteration](/guide/nodes/iteration) 容器在容器内部循环。

工作流从以下途径之一得到：

- 在工作流列表页点击「新建」从空白画布开始，见 [创建工作流](/guide/workflows/creating)。
- 从模板创建，见 [使用模板](/guide/workflows/templates)。
- 导入 `.agentloom-workflow.json` 或 `.json` 导出文件，或通过分享链接、市场获取，见 [分享与导出](/guide/workflows/sharing) 与 [市场](/guide/collaboration/marketplace)。

| 你要做的事 | 页面 |
| --- | --- |
| 在画布上添加节点、连线、配置 | [创建工作流](/guide/workflows/creating) |
| 让每次运行接收不同的输入 | [输入参数](/guide/workflows/input-parameters) |
| 手动运行、查看执行状态与历史 | [运行与监控](/guide/workflows/running) |
| 找出某个节点失败或输出不对的原因 | [调试工作流](/guide/workflows/debugging) |
| 保存快照、发布、回看历史 | [版本管理](/guide/workflows/versions) |
| 分享、导出、导入工作流 | [分享与导出](/guide/workflows/sharing) |
| 从模板开始 | [使用模板](/guide/workflows/templates) |
| 按定时、Webhook 或 API 事件自动运行 | [触发器与自动化](/guide/triggers/) |
| 查某个节点的端口与行为 | [节点参考](/guide/nodes/) |
