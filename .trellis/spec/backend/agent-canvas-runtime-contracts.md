# Agent Canvas Runtime Contracts

> Agent 定义图、workflow `agent` 节点与 `sub-agent` 运行时必须共享同一套输入节点语义；system prompt、schema 与局部能力覆盖不能在 Studio、持久化、编译和执行之间发生分叉。

---

## Scenario: Agent Input Node Canonicalization And Sub-Agent Overrides

### 1. Scope / Trigger

- Trigger: 修改 `agent-definition` 的图编译、runtime config 组装、Agent 发布快照或 share import 链路。
- Trigger: 修改 `agent-execution`、`workflow-agent-adapter` 或 nested sub-agent 的运行时合并逻辑。
- Trigger: 修改 Agent / Workflow 的系统提示词建模方式，或新增/调整 `sub-agent` 可覆盖与可扩展的输入端口。
- Trigger: 发布前需要一次性预迁移旧的 `systemPrompt` 字段与 legacy `text/json` 句柄。

### 2. Signatures

- `AgentDefinitionService.buildRuntimeConfigFromNodes(nodes, edges)`
  - 文件: `agentloom-server/src/modules/agent-definition/agent-definition.service.ts`
- `AgentDefinitionService.resolveSystemPromptFromNodes(nodes, edges, targetNodeId?)`
  - 文件: `agentloom-server/src/modules/agent-definition/agent-definition.service.ts`
- `mergeRuntimeConfigWithSubAgentRef(runtimeConfig, subAgentRef?)`
- `appendOutputSchemaToSystemPrompt(systemPrompt, outputSchema)`
- `resolveSubAgentSystemPrompt(baseSystemPrompt, subAgentRef?)`
  - 文件: `agentloom-server/src/modules/agent-definition/agent-runtime-config.utils.ts`
- `migrateAgentCanvasGraph({ nodes, edges, systemPrompt })`
- `migrateAgentVersionSnapshot(snapshot)`
  - 文件: `agentloom-server/src/modules/agent-definition/agent-input-node-migration.util.ts`
- `WorkflowAgentAdapter.execute({ ..., subAgentRef? })`
  - 文件: `agentloom-server/src/modules/execution/workflow-agent-adapter.ts`
- `AgentExecutionWorker.executeSubAgent(...)`
  - 文件: `agentloom-server/src/modules/agent-execution/agent-execution.worker.ts`
- `scripts/migrate-agent-input-nodes.ts`

### 3. Contracts

- Agent 画布和 workflow `agent` 的 system prompt canonical 来源都是显式 `text` source node 连接 `system-prompt-in`。
  - `agent-main`、`sub-agent`、workflow `agent` 都使用 `system-prompt-in`
  - 顶层 `systemPrompt` 持久化字段只作为兼容导入 / 迁移兜底，不再是权威来源
- `sub-agent` 的输入端口固定为：
  - override: `system-prompt-in`、`model-in`、`schema-in`
  - extension: `tools-in`、`skills-in`、`sub-agents-in`、`knowledge-in`、`memory-in`
  - forbidden: `sandbox-in`
- `sub-agent` 编译结果固定拆成两部分：
  - `overrides { systemPrompt, modelConfig, routingConfig, outputSchema }`
  - `extensions { tools, knowledgeBindings, subAgents, memoryInstanceIds, skillIds }`
- `modelConfig` override 生效时，必须先清空继承来的 `routingConfig`。原因是 concrete model 与 routing 不能同时成为权威来源；只有显式提供新的 `routingConfig` 时，才允许在 override 后重新写入。
- `extensions` 合并必须去重：
  - tools: 以 `mcpServerConfigId + toolName` 或 `toolType + toolId` 去重
  - knowledge: 以 `knowledgeBaseId` 去重
  - subAgents: 以 `alias` 去重
  - memory / skill: 以字符串值去重
- `schema-in` 与其它输出 schema 输入会编译到 `runtimeConfig.outputSchema`；执行前必须通过 `appendOutputSchemaToSystemPrompt()` 把 JSON Schema 约束附加到最终 system prompt。
- nested `sub-agent` 必须递归编译、递归校验，不能只校验第一层 `agentDefinitionId/versionId`。
- sub-agent 永远继承父 Agent 的 sandbox 与 runtimeMode；child 不能通过节点图局部覆盖沙箱边界。
- share import 与预迁移脚本必须复用同一 migration util，避免数据库、导入结果与运行时接受不同图语义。
- workflow `agent` 在执行时会把 `system-prompt-in` / `schema-in` 从普通 prompt 输入字典里剥离，避免把结构化 override 错当作用户消息内容。
- legacy Agent canvas MCP 节点别名必须在保存草稿、应用 self-evolution 快照、detail/version 响应与 runtime 编译链路里统一 canonicalize：
  - `nodeType='mcp'` → `mcp-tool`
  - `sourceHandle='tools-out'` → `tool-out`
  - 运行时 tools 编译必须把 legacy alias 与 canonical 节点都视为同一类 MCP tool binding
- Agent 画布在 legacy alias 归一化之后，若仍出现未知或缺失的 `nodeType`，必须在写路径与运行时 fail-closed，而不是静默落库或忽略：
  - `saveCanvas()`
  - `applyCanvasSnapshot()`
  - `buildSnapshot()`（版本创建 / 发布）
  - `buildRuntimeConfigFromNodes()`（direct conversation / workflow-agent runtime）
  - share import
  - 错误统一为 `AgentCanvasUnknownNodeTypeException`

### 4. Validation & Error Matrix

| Condition | Expected Behavior | Verification Point |
|-----------|-------------------|--------------------|
| `agent_definitions.systemPrompt` 仍存有 legacy 文本，图上没有 prompt edge | 预迁移把文本 materialize 成 `text` 节点 + `system-prompt-in` 连线，并把持久化字段清空为 `null` | migration script dry-run/apply + util 单测 |
| 已发布 Agent snapshot 的 `sub-agent` 仍使用 `text-in/json-in` | 迁移后 input port 集合切到固定新端口，连线句柄改成 `system-prompt-in/schema-in` | `agent-input-node-migration.util.spec.ts` |
| workflow `agent` 上游传入 `system-prompt-in` | `WorkflowAgentAdapter` 使用上游文本覆盖基础 system prompt | `workflow-agent-adapter.spec.ts` |
| workflow / sub-agent 上游传入非法 JSON 字符串到 `schema-in` | `coerceAgentOutputSchema()` 返回 `undefined`，忽略 schema 追加，不阻断执行 | util 单测 + adapter 单测 |
| `sub-agent` 只覆盖 `modelConfig`，未提供新 routing | 继承 routing 被移除，child 使用 concrete model | `agent-runtime-config.utils.spec.ts` |
| nested sub-agent 扩展里重复 alias / tool / knowledge / memory / skill | 合并结果去重，避免 runtime 工具与资源重复挂载 | `agent-runtime-config.utils.spec.ts` |
| 已发布 Agent 快照仍含 `nodeType='mcp'` / `sourceHandle='tools-out'` | detail/version response 与 runtime 编译都应恢复为 `mcp-tool` / `tool-out` | `agent-input-node-migration.util.spec.ts`, `agent-definition-response.dto.spec.ts`, `agent-definition.service.spec.ts` |
| Agent graph 在 migration 后仍含 `legacy-node` 或缺失 `nodeType` | save/apply/share import/buildSnapshot/runtime compile 必须抛 `AgentCanvasUnknownNodeTypeException`，不能静默忽略 | `agent-definition.service.spec.ts` + import path 回归 |

### 5. Good / Base / Bad Cases

- Good:
  - `text -> agent-main.system-prompt-in` 编译出 Agent 基础 system prompt。
  - `text -> sub-agent.system-prompt-in`、`llm-model -> sub-agent.model-in`、`json -> sub-agent.schema-in` 同时存在时，child 的 prompt / model / output schema 都被局部覆盖。
  - workflow `agent` 接到上游 `system-prompt-in` 与 `schema-in` 时，只影响当前执行实例，不会回写被引用 Agent Definition。
- Base:
  - 已经是 canonical 结构的 graph 经过迁移与编译后不发生语义变化。
- Bad:
  - 继续把 prompt 正文只存到顶层 `systemPrompt` 字段，导致 Studio 图与 runtime 配置分叉。
  - 给 `sub-agent` 暴露 `sandbox-in`，让 child 绕开父 Agent 的沙箱边界。
  - 把 `system-prompt-in` / `schema-in` 当成普通用户输入拼进 prompt payload。

### 6. Tests Required

- `agentloom-server/src/modules/agent-definition/agent-definition.service.spec.ts`
  - 断言 `resolveSystemPromptFromNodes()` 能解析 `text -> system-prompt-in`
  - 断言 `sub-agent` 会编译出完整的 overrides / extensions
- `agentloom-server/src/modules/agent-definition/agent-runtime-config.utils.spec.ts`
  - 断言 sub-agent merge 去重行为
  - 断言 `outputSchema` 会被追加到最终 system prompt
- `agentloom-server/src/modules/agent-definition/agent-input-node-migration.util.spec.ts`
  - 断言 legacy `mcp` 节点与 `tools-out` 句柄会迁移为 canonical `mcp-tool/tool-out`
- `agentloom-server/src/modules/agent-definition/agent-definition.service.spec.ts`
  - 断言未知 `nodeType` 会在 `saveCanvas()` 与 `buildRuntimeConfigFromNodes()` 阶段 fail-closed
- `agentloom-server/src/modules/execution/__tests__/workflow-agent-adapter.spec.ts`
  - 断言 workflow `agent` 的 `system-prompt-in` / `schema-in` override
  - 断言 nested `subAgentRef` merge
- `agentloom-server/src/modules/agent-definition/agent-input-node-migration.util.spec.ts`
  - 断言 draft Agent、published Agent snapshot、workflow graph 的预迁移结果
- Manual / browser QA:
  - 打开历史 Agent / Workflow，确认 prompt 被展示为独立 `text` 节点
  - 执行带 nested sub-agent 的案例，确认 child 使用局部 prompt / model / schema，且未出现 sandbox override

### 7. Wrong vs Correct

#### Wrong

```ts
{
  systemPrompt: '你是一个代码审查助手'
}

{
  nodeType: 'sub-agent',
  inputPorts: [{ id: 'text-in' }, { id: 'json-in' }]
}
```

#### Correct

```ts
{
  source: 'main__system-prompt',
  sourceHandle: 'text-out',
  target: 'main',
  targetHandle: 'system-prompt-in'
}

{
  nodeType: 'sub-agent',
  inputPorts: [
    { id: 'system-prompt-in' },
    { id: 'model-in' },
    { id: 'schema-in' },
    { id: 'tools-in' },
    { id: 'skills-in' },
    { id: 'sub-agents-in' },
    { id: 'knowledge-in' },
    { id: 'memory-in' }
  ]
}
```
