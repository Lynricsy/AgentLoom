# Canvas Node Composition

> Workflow Canvas 与 Agent Canvas 必须共享一致的输入节点心智模型；文本常量、系统提示词端口和自定义面板不能在 palette、节点 body、预览与配置面板之间出现分叉。

---

## Scenario: Explicit Text Source Nodes And Agent Input Ports

### 1. Scope / Trigger

- Trigger: 修改 `features/canvas/` 或 `features/agent-canvas/` 的节点注册表、palette、节点 body 或配置面板。
- Trigger: 修改 workflow `agent`、`agent-main`、`sub-agent` 的输入端口集合，尤其是 system prompt / schema / extension 语义。
- Trigger: 新增文本常量、提示词模板、共享 source node 或任何会影响 workflow preview / share preview 的节点类型。

### 2. Signatures

- `NODE_TYPES`
- `NODE_TYPE_REGISTRY`
  - 文件: `agentloom-studio/src/features/canvas/types/nodeTypeRegistry.ts`
- `AGENT_CANVAS_NODE_TYPES`
- `AGENT_CANVAS_NODE_REGISTRY`
  - 文件: `agentloom-studio/src/features/canvas/registry/agent-canvas-registry.ts`
- `CUSTOM_PANEL_REGISTRY`
  - 文件: `agentloom-studio/src/features/canvas/components/panels/customPanelRegistry.tsx`
- `CanvasNode`
  - 文件: `agentloom-studio/src/features/canvas/components/CanvasNode.tsx`
- `TextNodeBody`
  - 文件: `agentloom-studio/src/features/canvas/components/nodes/TextNodeBody.tsx`
- `TextConfigPanel`
  - 文件: `agentloom-studio/src/features/canvas/components/panels/TextConfigPanel.tsx`
- `workflowPreview.ts`
  - 文件: `agentloom-studio/src/features/canvas/lib/workflowPreview.ts`

### 3. Contracts

- `text` 是文本常量 source node，不是输出节点替身。
  - category 仍为 `output`
  - output port 固定为 `text-out`
  - config 结构固定为 `{ text: string }`
- `text-output` / `json-output` 只承担执行结果收口，不得再用于系统提示词配置。
- workflow `agent`、Agent `agent-main` 与 `sub-agent` 的系统提示词输入统一是 `system-prompt-in`。
- `sub-agent` 端口分两类：
  - override: `system-prompt-in`、`model-in`、`schema-in`
  - extension: `tools-in`、`skills-in`、`sub-agents-in`、`knowledge-in`、`memory-in`
  - forbidden: `sandbox-in`
- `text` 节点必须同时出现在：
  - workflow node registry
  - agent canvas registry
  - workflow NodePalette
  - agent AgentNodePalette
  - custom panel registry
  - workflow preview hydration
- `TextConfigPanel` 必须使用 300ms debounce autosave，并在 blur 时立即提交，保证和其它节点表单一致。
- `TextNodeBody` 在空值时显示占位提示，在有值时显示摘要预览；full / compact / minimal LOD 都不能让 `text` 节点退化成无法理解的空卡片。
- 不要在 `NodeConfigPanel` 或 `AgentNodeConfigPanel` 中手写 `switch` 特判 `text`；仍然通过 `CUSTOM_PANEL_REGISTRY` 分发。

### 4. Validation & Error Matrix

| Condition | Expected Behavior | Verification Point |
|-----------|-------------------|--------------------|
| workflow palette 缺少 `text` | 用户无法显式连接 `system-prompt-in`，属于回归 | `NodePalette.test.tsx` |
| agent palette 缺少 `text` | Agent 画布无法配置 graph-native system prompt | `AgentNodePalette.test.tsx` |
| `CanvasNode` 未识别 `text` | 节点 body 退化为空卡片或默认壳 | `TextNodeBody.test.tsx` |
| `CUSTOM_PANEL_REGISTRY` 未注册 `text` | 右侧面板无法编辑文本内容 | 面板交互测试 + 手测 |
| workflow preview 未识别 `text` | 模板 / share / marketplace 预览与正式画布语义分叉 | `workflowPreview.test.ts` |
| `sub-agent` 继续暴露 `text-in/json-in` | 用户仍会沿用旧传参心智模型 | `agent-canvas-registry.test.ts` |

### 5. Good / Base / Bad Cases

- Good:
  - workflow 中新增 `text` 节点并连接 `agent.system-prompt-in`，保存后再次打开仍保留显式连线。
  - Agent 画布中 `text -> sub-agent.system-prompt-in` 与 `llm-model -> sub-agent.model-in` 同时存在，用户能从端口语义直接理解覆盖范围。
  - preview 场景能把 `text` 节点渲染成与正式画布一致的只读卡片。
- Base:
  - 未使用 `text` 的旧图在 hydrate 后仍能正常浏览和保存。
- Bad:
  - 继续把 `text-output` 当作提示词常量节点。
  - 只在一套画布注册 `text`，另一套画布或 preview 忘记同步。
  - 在 `sub-agent` 上暴露 `sandbox-in`，让 UI 暗示可以局部换沙箱。

### 6. Tests Required

- `agentloom-studio/src/features/canvas/types/nodeTypeRegistry.test.ts`
  - 断言 workflow registry 包含 `text` 与 workflow `agent.system-prompt-in`
- `agentloom-studio/src/features/canvas/registry/agent-canvas-registry.test.ts`
  - 断言 agent canvas registry 包含 `text`
  - 断言 `sub-agent` 端口集合符合 override / extension 契约
- `agentloom-studio/src/features/canvas/components/NodePalette.test.tsx`
  - 断言 workflow palette 展示 `text`
- `agentloom-studio/src/features/canvas/components/AgentNodePalette.test.tsx`
  - 断言 agent palette 展示 `text`
- `agentloom-studio/src/features/canvas/components/nodes/TextNodeBody.test.tsx`
  - 断言空态占位与文本预览
- `agentloom-studio/src/features/canvas/lib/workflowPreview.test.ts`
  - 断言 preview 能正确 hydrate/render `text`

### 7. Wrong vs Correct

#### Wrong

```tsx
// 把输出节点当作提示词常量
{
  type: 'text-output'
}

// 继续给 sub-agent 暴露旧传参口
inputPorts: [{ id: 'text-in' }, { id: 'json-in' }]
```

#### Correct

```tsx
{
  type: 'text',
  outputPorts: [{ id: 'text-out' }]
}

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
```
