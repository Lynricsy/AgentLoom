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

### Workflow 图结构硬约束

- 永远先以 `query_state` 返回的现有节点/连线为准，不要凭空发明一套新的节点壳结构。
- Workflow 节点的外层 `node.type` 必须是画布壳分类，而不是真实节点种类：
  - `manual-trigger / schedule-trigger / webhook-trigger / api-event-trigger` → `trigger`
  - `agent / llm-model / smart-routing / skill` → `agent`
  - `http-tool / code-tool / mcp-tool / sandbox / input-preprocessor / workspace` → `tool`
  - `knowledge-base` → `knowledge`
  - `text-output / json-output` → `output`
  - `condition / loop / iteration / loop-start / iteration-start / loop-state / result / break / continue / reusable-block / merge` → `control`
  - `plugin` → `plugin`
  - `memory` → `memory`
- 真实节点种类写在 `node.data.nodeType`；不要把所有节点都写成 `workflow-node`。
- edge 的 `sourceHandle / targetHandle` 必须使用**精确的 canonical 端口 id**，不要使用简写别名。

### 常见 canonical 端口示例

- `manual-trigger`: `exec-out`, `payload-out`
- `text`: `text-out`
- `input-preprocessor`: `exec-in`, `text-in`, `json-in`, `exec-out`, `text-out`, `json-out`
- `agent`: `text-in`, `system-prompt-in`, `sandbox-in`, `context-in`, `skills-in`, `tools-in`, `sub-agents-in`, `schema-in`, `agent-out`, `structured-out`
- `text-output`: `exec-in`, `content-in`
- `json-output`: `exec-in`, `content-in`

### 严禁的错误写法

- 不要把节点写成 `type=workflow-node`
- 不要把 `payload-out` 简写成 `payload`
- 不要把 `text-out / text-in` 简写成 `text`
- 不要把 `content-in` 简写成 `content`
- 不要把 `agent-out` 简写成 `agent`

## 注意

- 外部编辑通常属于高风险操作，默认会进入审批
- 不要在没读目标状态前直接构造 proposal
- 不要把自己的 nodeId / edgeId 误用于外部目标
