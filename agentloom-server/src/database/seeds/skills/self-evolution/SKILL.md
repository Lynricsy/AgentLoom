---
name: self-evolution
description: Allow an Agent to inspect and evolve its own orchestration, manage eligible resources, edit external orchestration when permitted, and adjust sandbox-related configuration through explicit low-level tools.
---

# Self Evolution

这个 Skill 用于让 Agent 在明确权限边界内执行“自进化”操作。

## 先读这份入口文件的场景

- 你需要判断自己是否可以修改编排或资源
- 你需要知道有哪些低层工具可用
- 你不确定该读哪份细分说明

## 操作前必须遵守

1. 先调用 `query_state` 读取当前 Agent / 目标编排状态。
2. 先调用 `query_resource_pool` 确认现有资源，再决定是���需要新建资源。
3. 修改编排前必须先调用 `propose_change`，拿到 `proposal` 和 diff。
4. 真正落地编排修改时必须调用 `apply_change`，并直接传入 `proposal`。
5. 创建资源时必须调用 `create_resource`，不要假设任何资源已经存在。
6. 如果 `apply_change` 或 `create_resource` 触发审批，等待主人决定，不要重复发起相同请求。
7. 被拒绝时，向主人说明没有执行变更，并给出更安全的替代方案。

## 可用低层工具

- `query_state`
  用途：读取自身 / 外部 Agent / Workflow 当前编排状态与版本。
- `query_resource_pool`
  用途：查看当前租户现有的 skill、mcp、model、agent、workflow、workspace 资源。
- `propose_change`
  用途：基于节点 / 连线级操作生成结构化变更提案和 diff。
- `apply_change`
  用途：应用 `propose_change` 返回的 `proposal`。
- `create_resource`
  用途：创建新的 skill、mcp、model、workspace、agent、workflow 资源。

## 按需阅读的细分文件

- 如果你要修改自己的编排或外部编排：读 `orchestration.md`
- 如果你要创建或绑定资源：读 `resources.md`
- 如果你要编辑外部 Agent / Workflow：读 `external-editing.md`
- 如果你要改 sandbox / workspace / CPU / memory / disk / timeout：读 `sandbox.md`
- 如果你要理解已发布 Agent 的发布与重启语义：读 `publishing.md`

## 高风险边界

- 新增资源、编辑外部 Agent、编辑 Workflow、调整 sandbox 规格，通常都需要主人审批。
- 自己的普通编排改动通常可以直接应用，但仍要先 `propose_change`，不要盲改。
- 主模型、工作区这类单实例资源的切换，必须通过正式 proposal/apply 流程完成。

## 失败处理

- proposal 生成失败：先重新 `query_state`，确认版本与节点 ID 没漂移。
- apply 失败：把错误信息原样告诉主人，并重新读取目标状态。
- 创建资源失败：不要假设重试一定安全，先说明失败原因，再决定是否重试。
