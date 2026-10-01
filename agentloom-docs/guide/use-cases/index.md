---
docType: index
---

# 用例

每个用例把几个基础功能组合起来解决一个具体问题。用例只写本场景特有的配置；节点、Agent、知识库与触发器的通用操作链接到各自的页面。

| 用例 | 解决的问题 | 用到的功能 |
| --- | --- | --- |
| [智能客服](/guide/use-cases/customer-support) | 基于 FAQ 文档回答外部系统转来的问题 | 知识库、无沙箱 Agent、输入预处理器、Webhook 触发 |
| [文档分析](/guide/use-cases/document-analysis) | 定期从一组文档中提取结构化结论 | 知识库、Agent 的 Schema 端口、定时触发 |
| [代码审查](/guide/use-cases/code-review) | GitHub Pull Request 事件到达后自动审查 | 有沙箱 Agent、内置技能 code-review、Webhook 触发 |
| [多 Agent 协作](/guide/use-cases/multi-agent) | 让多个 Agent 依次接力完成一项任务 | 多个 Agent 节点、共享 Sandbox、智能路由 |

## 共同前提

- 组织角色为 owner、admin 或 creator，能创建 Agent、知识库与工作流。
- 至少有一份可用的 LLM 模型配置，或手头有一个模型服务商的 API Key，用于在 Agent 画布上创建「LLM 模型」节点，见[创建 Agent](/guide/agents/creating)。
- 用到「有沙箱」Agent 的用例（代码审查、多 Agent 协作）要求部署启用了沙箱运行时，见 [Firecracker 沙箱](/deploy/firecracker)。

## 相关

- [创建工作流](/guide/workflows/creating)
- [在工作流中使用 Agent](/guide/agents/in-workflows)
- [节点参考](/guide/nodes/)
- [触发器与自动化](/guide/triggers/)
