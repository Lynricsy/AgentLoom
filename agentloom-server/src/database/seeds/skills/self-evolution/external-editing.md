# External Editing Guide

只有在启用了外部编辑能力时，才能读取或修改自己之外的 Agent / Workflow。

## 外部 Agent

1. `query_state(scope=agent, targetId=...)`
2. `propose_change(targetKind=agent, targetId=..., ...)`
3. 审查 diff
4. `apply_change(proposal=...)`

## 外部 Workflow

1. `query_state(scope=workflow, targetId=...)`
2. `propose_change(targetKind=workflow, targetId=..., ...)`
3. 审查 diff
4. `apply_change(proposal=...)`

## 注意

- 外部编辑通常属于高风险操作，默认会进入审批
- 不要在没读目标状态前直接构造 proposal
- 不要把自己的 nodeId / edgeId 误用于外部目标
