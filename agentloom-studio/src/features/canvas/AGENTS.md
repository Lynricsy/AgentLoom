# CANVAS FEATURE 知识库

工作流可视化编辑器。基于 @xyflow/react (ReactFlow)，支持 15 种节点类型和端口兼容性检查。

## 节点类型体系

6 大类 15 种节点，注册在 `types/nodeTypeRegistry.ts`:

| 分类 | 节点类型 | 说明 |
|------|----------|------|
| Agent | llm-agent, chat-agent, llm-model | AI 智能体 |
| Tool | http-tool, code-tool, mcp-tool, sandbox | 工具节点 |
| Trigger | manual-trigger, schedule-trigger | 触发器 |
| Knowledge | knowledge-base | 知识库检索 |
| Output | text-output, json-output | 输出节点 |
| Control | condition, loop, reusable-block | 流程控制 / 可复用块 |

**添加新节点**: 注册 `NODE_TYPE_REGISTRY` → 创建 `nodes/XxxBody.tsx` → 创建 `panels/XxxPanel.tsx`
**动态节点补充**: `reusable-block` 与 `mcp-tool` 一样属于 dynamic-only node type，不会作为静态内置节点直接出现在 palette。

## 端口类型系统

8 种数据类型: `model | text | json | image | audio | tool | sandbox | knowledge`
每种类型有独特视觉形状 (`PORT_DATA_TYPE_META`)。

**兼容性级别**: raw level 仍为 `EXACT | TRANSFORM | PARTIAL | INCOMPATIBLE`；持久化 edge visual 映射为 `EXACT -> L0`、`TRANSFORM/PARTIAL -> L1`、`INCOMPATIBLE -> error`，`checking` 仅用于拖拽/hover 预览态
**当前**: `lib/connectionCompatibility.ts` 负责同步 guard + cache 读取 + 异步权威检查适配；浏览器 runtime/worker 位于 `lib/typeEngine/`

## 组件树

```
WorkflowCanvasPage.tsx
└── WorkflowCanvas.tsx (728L, 核心)
    ├── CanvasNode.tsx (React.memo 包裹)
    │   ├── CanvasNodeShell.tsx (外壳)
    │   ├── CanvasNodeCard.tsx (内容卡片)
    │   ├── TypedPort.tsx (类型化端口，含形状/颜色)
    │   └── nodes/ (每种节点的 Body 组件，含 `ReusableBlockBody`)
    ├── edges/SmartEdge.tsx (粒子动画连线)
    ├── overlays/
    │   ├── CompatibilityPreviewOverlay.tsx (拖拽时兼容性预览)
    │   ├── ConnectionStateOverlay.tsx (连接状态覆盖层)
    │   └── NodeInfoOverlay.tsx
    ├── panels/
    │   ├── WorkflowSettingsPanel.tsx (触发器/介入策略共享设置面板，tabs 容器)
    │   ├── NodeConfigPanel.tsx (节点配置 + 实时输出 + 自定义面板/动态表单分发，含 `ReusableBlockPanel`)
    │   ├── DynamicConfigForm.tsx (schema 驱动表单)
    │   ├── LlmAgentConfigPanel.tsx (lazy Monaco + output schema title)
    │   ├── HttpToolConfigPanel.tsx (method/url)
    │   ├── InterventionPanel.tsx (人工介入面板)
    │   ├── FieldMappingPanel.tsx (字段映射)
│   ├── KnowledgeBaseConfigPanel.tsx
│   ├── McpToolConfigPanel.tsx
│   └── SandboxConfigPanel.tsx
    ├── toolbar/
    │   ├── VersionToolbar.tsx (版本管理)
    │   └── CanvasSearch.tsx
    ├── navigation/CanvasMiniMap.tsx
    ├── status/WorkflowStatusBar.tsx
    └── NodePalette.tsx (节点面板/拖入)
```

## 目录

| 目录 | 职责 |
|------|------|
| `api/` | 画布相关 API 调用 |
| `components/` | 上述组件树，含 `BlockCreateDialog` / `nodes/ReusableBlockBody.tsx` / `panels/ReusableBlockPanel.tsx` |
| `hooks/` | 画布交互 hooks（拖拽/连接/快捷键 + `useLevelOfDetail`） |
| `lib/` | `connectionCompatibility.ts`（同步 guard + cache 读取 + async 适配）、`encapsulation.ts`（多选节点封装分析与 block 替换纯函数）、`typeEngine/`（runtime/worker/fallback/serialize）、`configSchemaToZod.ts`、`nestedFieldTree.ts`（MAX_NESTED_DEPTH=5，buildSchemaTree/buildNestedFieldTree/collectLeafPaths）、`fieldSuggestionEngine.ts`（Levenshtein + token overlap + type compat 三维评分，Top-3 建议 + 0.70 阈值）、`coercionStrategies.ts`（text↔json 转换策略注册表） |
| `stores/` | canvasStore（Zustand，含 `nodeValidationErrors`） |
| `types/` | nodeTypeRegistry.ts, typeSchema.ts |

## 关键类型文件

- `types/typeSchema.ts` — PortDataType, TypeSchema (Scalar|Object|Array)，手动镜像 Rust type-engine
- `types/nodeTypeRegistry.ts` — NODE_TYPE_REGISTRY, PORT_DATA_TYPE_META, createPort(), clonePortDefinitions()
- `types.ts` — RawCompatibilityLevel, CanvasEdgeData, FieldMapping (含可选 coercionConfig), CandidateFieldMapping, NestedFieldNode, MappingSuggestion, CoercionStrategy (10种), TypeCoercionConfig, ConfidenceLevel, BlockPort/BlockDefinition/BlockNodeData
- `autonomy.types.ts` — Agent 自主性配置类型

## 注意事项

- `connectionCompatibility.ts`：`isValidConnection()` 只读同步 guard/cache，不发起慢检查
- `WorkflowCanvas` 在 `onConnectStart` / hover 采用 cache-first + async evaluate，必要时展示 `checking`
- `onConnect` 必须先 await 最终兼容性再落边，`checking` 不得持久化进 `edge.data`；若 cache miss 后最终结果为 `INCOMPATIBLE`，仍需通过持久化错误反馈（当前为 toast）展示 canonical reason，不能只依赖瞬时 preview
- `canvasStore.updateNodeData()` 仅在 `inputPorts/outputPorts` 契约签名变化时触发相邻边重算；`refreshEdgeCompatibility()` 会更新 `edge.data` 并标脏供 autosave 保存
- `canvasStore` 在 async compatibility refresh 落地前必须重新基于最新 live `edge.data` merge，避免旧 snapshot 结果覆盖用户并发编辑的 `fieldMapping`
- `TypeEngineRuntime.handleFatalError()` 必须在 worker crash / timeout / init fatal 后同步清空 `readyPromise`、compatibility cache 与 `inFlightCompatibility`，避免恢复路径命中 stale 结果
- `FieldMappingPanel` 的摘要与“必填未映射”统计必须直接消费 canonical `edge.data.missingFields` / `mappingSummary`，不要从 target schema 重新推导兼容性差异
- `FieldMappingPanel.acceptAllCandidates()` 需要先按 `targetPath` 择优去重（优先 `autoRecommended`，其次更高 `confidence`），保证同一 target 最多接受一条推荐映射
- `FieldMappingPanel` 已升级为 L2：使用 `NestedFieldTree` 树形展示（取代 flat list），集成 `generateSuggestions()` 智能建议（Top-3、≥0.70 可自动应用）+ `MappingSuggestionCard` + `CoercionConfigPopover`（text↔json 类型不匹配时展示）+ Ctrl/Cmd 批量多选拖拽 + undo 支持（`canvasStore.saveMappingSnapshot/undoFieldMapping`）
- `fieldSuggestionEngine.ts` 的 Levenshtein / token overlap 需支持 Unicode，类型兼容性需区分 `json:object` 与 `json:array`；`FieldMappingPanel` 对 coercible 映射必须先进入确认流、取消时回滚快照，不兼容目标需显示禁止态并 toast 拒绝；批量拖拽匹配顺序为“精确名称 → 归一化名称 → 顺序兜底”，apply-all 需过滤 incompatible 并展示确认摘要与撤销提示
- `NestedFieldTree` 组件支持 `suggestedPaths`/`onFieldDragOver`/`onFieldDrop`/`renderFieldSuffix`/`disableLeafInteraction` 5 个可选 backward-compat props
- `agentloom-studio/vite.config.ts` 通过 `server.fs.allow = [path.resolve(__dirname, '..')]` 放行 sibling `agentloom-type-engine/pkg` wasm，避免 Vite dev 下 `@fs/...agentloom_type_engine_bg.wasm` 被 403 拒绝
- `canvasStore` 自动清理：删除 edge 时同步清理 binding mapping
- `canvasStore` 现在同时维护 `selectedNodeId`（向后兼容单选）与 `selectedNodeIds`（多选 Set）；涉及 `selectNode/selectEdge/openFieldMapping/onNodesChange(reset/applyServerSnapshot)` 时需保持两者同步
- `canvasStore.nodeValidationErrors` 记录节点级表单校验状态；删除节点和 `onNodesChange(remove)` 都需要同步清理
- `WorkflowCanvasPage` 左上角设置区现使用共享 `WorkflowSettingsPanel`：toolbar 的“触发器 / 介入策略”两个按钮会打开同一个 settings panel 并切换 tabs，而不是渲染两个独立 overlay；实现时不要用会卸载内容的 `TabsContent` 破坏 `TriggerTab` / `InterventionPolicyTab` 本地状态
- `WorkflowCanvas` 现使用自定义 Portal `CanvasContextMenu`（禁止使用 Radix ContextMenu）；多选封装相关的纯函数分析/替换逻辑位于 `lib/encapsulation.ts`，创建前确认表单位于 `components/BlockCreateDialog.tsx`
- `CanvasNode` 使用 `React.memo` 避免重渲染
- `CanvasNode` 现在有 3 档 LOD：`full (>=0.7)` / `compact (0.4–0.7)` / `minimal (<0.4)`；minimal 模式应保持图标方块 + 可连线 handles，不渲染 body、port row 与 execution overlay
- SmartEdge 有粒子动画效果
- `NodeConfigPanel` 会在节点状态为 `waiting_intervention` 时嵌入 `InterventionPanel`；所需数据由 executionStore 的实时事件和 snapshot 恢复共同驱动
- `NodeConfigPanel` 配置分发规则：先命中自定义面板（llm-model/mcp-tool/knowledge-base/sandbox/llm-agent/http-tool/reusable-block），否则走 `DynamicConfigForm`，空 schema 显示“该节点无需额外配置”
- `DynamicConfigForm` 使用 react-hook-form + Zod；任一字段 blur 后会触发整表校验，以满足多必填字段同时报错
- `LlmAgentConfigPanel` 使用 `@monaco-editor/react` lazy import，编辑器内容必须能在 mount 后响应外部 config 更新
- 端口兼容性检查在拖拽连线时实时触发
