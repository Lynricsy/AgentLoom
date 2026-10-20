---
docType: index
---

# 决策记录

本目录记录改变跨包契约、运行时模型、安全边界或文档体系的架构决策（ADR）。何时写、如何编号、状态如何流转见 [文档维护指南](/dev/docs-maintenance#_7-adr)。

| 编号 | 标题 | 状态 | 日期 |
| --- | --- | --- | --- |
| [0001](/dev/decisions/0001-agent-external-api) | Agent 对外 API：专用 Key + 原生 REST/SSE | 已实施 | 2026-10-01 |
| [0002](/dev/decisions/0002-docs-system) | 文档体系：单站、Diátaxis、生成式参考 | 已实施 | 2026-10-01 |
| [0003](/dev/decisions/0003-dsh-sandbox-runtime) | sandbox 运行态切换为 DeepSeek Harness 并开放 runtime 插件 | 已实施 | 2026-10-07 |
| [0004](/dev/decisions/0004-team-runtime) | 受控团队运行时：成员即对话、回合边界递送、team_messages 即 Outbox | 已实施 | 2026-10-15 |
| [0005](/dev/decisions/0005-a2a-inbound) | A2A 入站适配：复用 Agent 对外 API 的薄协议层 | 已实施 | 2026-10-15 |
| [0006](/dev/decisions/0006-evidence-driven-optimization) | 证据驱动配置优化：提案 → 回放评测 → 审批发布 → 回滚 | 已实施 | 2026-10-16 |
| [0007](/dev/decisions/0007-generated-app-spec-generation) | 生成应用 v2：模型生成 AppSpec、按规格渲染表单、绑定真实工作流/Agent、Playwright 验收 | 提议 | 2026-10-20 |
| [0008](/dev/decisions/0008-sandbox-stdio-mcp-in-guest) | 有沙箱 Agent 的 stdio MCP 在 guest 内启动 | 已实施 | 2026-10-20 |
| [0009](/dev/decisions/0009-plugin-billing-ledger-by-value) | 插件计费账本按值引用插件，新版本就地发布 | 已实施 | 2026-10-20 |

## 模板

新建 `NNNN-<kebab-标题>.md`，编号取现有最大号加一，复制以下结构：

```markdown
---
docType: explanation
---

# NNNN 标题

- 状态：提议
- 日期：YYYY-MM-DD

## 背景

（决策时的事实与约束，带源码位置；只写当时为真的事）

## 决策

（选了什么；被否决的方案各自为什么不选）

## 后果

（变容易的事、变困难的事、需要遵守的新约束）

## 确认方式

（怎样验证决策已被执行：测试、检查命令、可观察的系统行为）
```

状态取值：提议、已接受、已实施、已废弃（被 NNNN 取代）。已接受的 ADR 不改正文，只在「状态」行追加变化。
