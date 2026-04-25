# Workflow Graph Normalization

> 工作流图在存储、返回、发布和执行前都必须收敛为同一套 canonical 结构，避免 Studio 渲染层和 runtime 调度层出现分叉语义。

---

## Scenario: Workflow Graph Canonical Normalization

### 1. Scope / Trigger

- Trigger: 修改 `workflow-definition` 保存/回滚/发布/导出/详情序列化链路，或修改 `execution` 基于草稿/发布版构建 `definitionSnapshot` 的逻辑。
- Trigger: 修改自进化 external editing、导入导出、兼容旧 graph 结构的适配逻辑。
- Trigger: 发现工作流节点在 UI 中退化为黑色默认方块、端口缺失、连线丢失，或 runtime 因 legacy handle 名称无法正确传参。

### 2. Signatures

- `normalizeWorkflowNodesAndEdges(graph)`:
  - 文件: `agentloom-server/src/modules/workflow-definition/utils/normalize-workflow-graph.utils.ts`
- `serializeWorkflowDefinitionDetail(result)`:
  - 文件: `agentloom-server/src/modules/workflow-definition/dto/workflow-definition-response.dto.ts`
- `WorkflowVersionService.updateDefinition()`
- `WorkflowVersionService.rollback()`
- `WorkflowVersionService.publish()`
- `WorkflowVersionService.exportWorkflow()`
- `WorkflowVersionService.buildSnapshot()`
- `WorkflowVersionService.toResponseDto()`
- `ExecutionService.buildDraftExecutionSnapshot()`
- `ExecutionService.runWorkflow()`
- `NodeSchedulerService.scheduleNode()`
- `NodeSchedulerService.executeTextNode()`
  - 文件: `agentloom-server/src/modules/execution/node-scheduler.service.ts`
- 自进化 Skill 约束文档:
  - `agentloom-server/src/database/seeds/skills/self-evolution/external-editing.md`

### 3. Contracts

- `node.type` 必须是 ReactFlow 壳类型，不是业务节点种类本身。
  - `manual-trigger` / `schedule-trigger` / `webhook-trigger` / `api-event-trigger` → `trigger`
  - `agent` / `llm-model` / `smart-routing` / `skill` → `agent`
  - `http-tool` / `code-tool` / `mcp-tool` / `sandbox` / `input-preprocessor` / `workspace` → `tool`
  - `knowledge-base` → `knowledge`
  - `text` / `text-output` / `json-output` → `output`
  - `condition` / `loop` / `iteration` / `loop-start` / `iteration-start` / `loop-state` / `result` / `break` / `continue` / `reusable-block` / `merge` → `control`
  - `plugin` → `plugin`
  - `memory` → `memory`
- 真实业务节点种类写在 `node.data.nodeType`，不能把 `workflow-node` 当成外层 `type` 长期存活。
- 兼容 legacy graph 时，服务端必须把 snake_case 字段归一化为 camelCase 后再对外暴露和再持久化，至少包含：
  - `node_type -> nodeType`
  - `node_category -> category`
  - `input_ports -> inputPorts`
  - `output_ports -> outputPorts`
  - `selected_agent_id -> selectedAgentId`
  - `agent_version_id -> agentVersionId`
  - `agent_name -> agentName`
  - `transform_type -> transformType`
  - `output_format -> outputFormat`
- 端口定义本身也必须 canonicalize，不能只保留 `{ id }` 半残结构。
  - 已知节点端口要补齐 `label/direction/dataType/required/multiple/maxConnections/schema`
  - 未知或动态端口至少要补齐 `direction/dataType/schema`，保证 UI / type-engine 读取 `port.schema.kind` 时不会崩溃
  - 端口字段也要收敛到 camelCase，例如 `data_type -> dataType`、`max_connections -> maxConnections`、`accepts_any_data_type -> acceptsAnyDataType`
- edge handle 必须使用 canonical 端口 id，不能继续保存 legacy 简写别名。
  - `payload -> payload-out`
  - `json -> json-in`
  - `text -> text-in` 或 `text-out`（按方向判定）
  - `agent -> agent-out`
  - `content -> content-in`
- workflow `agent` 节点的系统提示词 canonical 结构是显式 `text` 节点连接 `system-prompt-in`。
  - legacy `node.data.systemPrompt` / `node.data.config.systemPrompt` 只能作为迁移输入，不再是持久化后的权威来源
  - 规范化或预迁移后，`workflow agent` 的 `inputPorts` 必须包含 `system-prompt-in`
- workflow `text` 节点在运行时是同步文本常量 source node，不允许落到“未知节点按 agent 处理”的默认分支。
  - `scheduleNode()` 必须显式分发到 `executeTextNode()`
  - `executeTextNode()` 产出固定结果 `{ content, text, 'text-out' }`
  - 文本解析优先级：`config.text` -> `config.value` / `config.content` -> root-level `text/value/content`
  - 显式空字符串是合法配置，不能因为 fallback 逻辑把旧 root-level 文本“复活”
- 规范化必须同时覆盖两个方向：
  - ingest: 保存草稿、回滚草稿、从 proposal/apply 生成新图时，先转 canonical 再落库。
  - egress: 返回工作流详情、版本列表、已发布版本、导出、发布快照、执行快照时，确保读取旧数据也会被修正。
- runtime 侧不得直接消费未规范化 graph。`execution.definitionSnapshot` 必须与 Studio 详情返回保持同一套 canonical 结构。

### 4. Validation & Error Matrix

| Condition | Expected Behavior | Verification Point |
|-----------|-------------------|--------------------|
| 历史草稿中的 `node.type` 被写成 `workflow-node` | 详情接口返回时自动映射回正确壳类型，Studio 能显示真实节点卡片与端口 | `serializeWorkflowDefinitionDetail()` 单测 + 浏览器打开坏样本 |
| 历史草稿中 `data.node_type/input_ports/output_ports` 为 snake_case | 返回前与再次保存前都转为 camelCase | detail/update 单测 |
| 历史 edge 使用 `payload/json/text/agent/content` 简写 handle | 详情接口与 execution snapshot 都输出 canonical handle id | `workflow-version.service.spec.ts` + `execution.service.spec.ts` |
| 历史 `workflow_versions.snapshot` 的端口只剩 `{id}` | 版本列表 / 已发布版本接口返回完整 canonical 端口定义，历史记录页不会因 `schema.kind` 崩溃 | `workflow-version.service.spec.ts` + browser 复现 |
| 历史 workflow `agent` 把 `systemPrompt` 直接写在节点 config 上 | 预迁移或规范化后自动 materialize 成 `text` 节点 + `system-prompt-in` 连线，节点 config 不再保留权威提示词正文 | migration util 单测 + browser 打开旧草稿 |
| 已发布版本 snapshot 仍是 legacy graph | `runWorkflow()` 执行前规范化，运行成功且端口数据能正确流转 | execution 回归测试 + 线上 manual QA |
| runnable workflow 使用 `text -> agent/text-output`，但调度器没有 `text` 节点执行分支 | runtime 必须同步完成 `text` 节点并把 `'text-out'` 传给下游，而不是把它误当成 agent 节点 | `node-scheduler.service.spec.ts` + live QA 复现 |
| 自进化 external editing 生成了 `workflow-node` 或 handle 简写 | Skill 文档明确禁止；服务端 ingest 仍做兜底规范化 | skill 文档审查 + 兼容单测 |
| 未知 `node.data.nodeType` 无法归类 | 保留原 `node.type`，不要瞎映射到错误壳类型 | 规范化工具单测 |

### 5. Good / Base / Bad Cases

- Good:
  - 存量 legacy workflow 详情页打开后显示正确节点、端口、连线。
  - legacy workflow `agent.config.systemPrompt` 打开后被展示为独立 `text` 节点，并连接到 `system-prompt-in`。
  - 点击运行后，`manual-trigger -> input-preprocessor -> agent -> text-output` 四步全部完成，`text-output.result.content` 为预期文本。
- Base:
  - 已经是 canonical 的 graph 经过规范化后不发生语义变化，也不应被重复改坏。
- Bad:
  - 只修 Studio 渲染适配，不修保存/发布/执行链路，导致页面看起来恢复，但新发布版本或 execution snapshot 仍携带 legacy handles。
  - 只修 `node.type`，不修 `data.nodeType` / `sourceHandle` / `targetHandle`，导致 runtime 调度继续吃错端口。

### 6. Tests Required

- `agentloom-server/src/modules/workflow-definition/utils/normalize-workflow-graph.utils.spec.ts`
  - 断言 legacy `workflow-node + snake_case + 简写 handle` 会被完整归一化。
  - 断言 `text` 节点与 `workflow agent.system-prompt-in` 会被补齐 canonical category / 端口语义。
  - 断言 canonical graph 不被误改。
- `agentloom-server/src/modules/workflow-definition/__tests__/workflow-version.service.spec.ts`
  - `findDefinitionDetailById()` 返回归一化后的 graph。
  - `updateDefinition()` 在持久化前归一化 graph。
  - `listVersions()` / `getPublishedVersion()` 返回的 `snapshot.nodes[*].data.inputPorts/outputPorts` 也要是完整 canonical 端口定义。
- `agentloom-server/src/modules/execution/__tests__/execution.service.spec.ts`
  - `runWorkflow()` 对 legacy published snapshot 归一化后再写入 execution。
- `agentloom-server/src/modules/execution/__tests__/node-scheduler.service.spec.ts`
  - 断言 `text` 节点会经由 `executeTextNode()` 同步完成，不进入 `agent-task` 队列。
  - 断言 `text-out` 能把文本常量传给下游。
  - 断言显式空字符串配置不会被 legacy root-level 文本覆盖。
- Manual/browser E2E:
  - 打开真实 legacy workflow 页面，确认节点不是黑色默认块，端口和连线可见。
  - 从页面直接运行该 workflow。
  - 确认新 execution 为 `completed`。
  - 确认 `text-output` 节点 `result.content` 与预期一致。

### 7. Wrong vs Correct

#### Wrong

```ts
{
  type: 'workflow-node',
  data: { node_type: 'text-output' }
}

{
  sourceHandle: 'agent',
  targetHandle: 'content'
}
```

#### Correct

```ts
{
  id: 'agent__system-prompt',
  type: 'output',
  data: { nodeType: 'text' }
}

{
  source: 'agent__system-prompt',
  sourceHandle: 'text-out',
  target: 'agent',
  targetHandle: 'system-prompt-in'
}
```
