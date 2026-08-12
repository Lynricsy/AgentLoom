# CANVAS FEATURE 知识库

工作流可视化编辑器。基于 @xyflow/react (ReactFlow)，支持 workflow / agent 双画布节点注册和端口兼容性检查。

## 节点类型体系

多类节点注册在 `types/nodeTypeRegistry.ts`:

| 分类          | 节点类型                                | 说明                                                                        |
| ------------- | --------------------------------------- | --------------------------------------------------------------------------- |
| Agent         | llm-model, agent                        | AI 智能体（`agent` 为独立 Agent 定义节点）                                  |
| Tool          | http-tool, code-tool, mcp-tool, sandbox | 工具节点                                                                    |
| Trigger       | manual-trigger, schedule-trigger        | 触发器                                                                      |
| Knowledge     | knowledge-base                          | 知识库资源节点；每个节点代表一个具体知识库，连接到 Agent 后形成可访问白名单 |
| Output        | text, text-output, json-output          | `text` 为文本常量 source node；`text-output/json-output` 为执行结果输出节点 |
| Control       | condition, loop, reusable-block         | 流程控制 / 可复用块                                                         |
| Routing       | smart-routing                           | 智能路由（多策略模型选择）                                                  |
| Plugin        | plugin                                  | 插件扩展节点                                                                |
| Preprocessing | input-preprocessor                      | 输入预处理                                                                  |
| Memory        | memory                                  | Agent 记忆节点                                                              |
| Skill         | skill                                   | Skill 注入节点                                                              |

**添加新节点**: 注册 `NODE_TYPE_REGISTRY` → 创建 `nodes/XxxBody.tsx` → 创建 `panels/XxxPanel.tsx`
**动态节点补充**: `reusable-block`、`mcp-tool`、`plugin` 属于 dynamic-only node type，不会作为静态内置节点直接出现在 palette。`plugin` 节点通过 `useActivePlugins()` 查询已安装的活跃插件，动态生成 Plugins 分组显示在 NodePalette 中。

## 端口类型系统

8 种数据类型: `model | text | json | image | audio | tool | sandbox | knowledge`
每种类型有独特视觉形状 (`PORT_DATA_TYPE_META`)。

**兼容性级别**: raw level 仍为 `EXACT | TRANSFORM | PARTIAL | INCOMPATIBLE`；持久化 edge visual 映射为 `EXACT -> L0`、`TRANSFORM/PARTIAL -> L1`、`INCOMPATIBLE -> error`，`checking` 仅用于拖拽/hover 预览态
**当前**: `lib/connectionCompatibility.ts` 负责同步 guard + cache 读取 + 异步权威检查适配；浏览器 runtime/worker 位于 `lib/typeEngine/`

## 组件树

```
WorkflowCanvasPage.tsx
└── WorkflowCanvas.tsx (728L, 核心)
    ├── CanvasNode.tsx (仅 `export { CanvasNodeShell } from './node/CanvasNodeShell'`)
    │   └── node/
    │       ├── CanvasNodeShell.tsx (入口，React.memo + LOD 分发 + 状态/compound 计算)
    │       ├── NodeHeader.tsx (full / compact 两档头部，类别色图标芯片 + 状态徽章)
    │       ├── NodeBodyRenderer.tsx (full LOD 下按 `data.nodeType` 分发 Body)
    │       ├── NodePortRows.tsx (输入/输出端口行 + minimal 连线锚点)
    │       ├── CompoundFrame.tsx (NodeResizer + loop/iteration 内框)
    │       └── nodeVisualMeta.ts (图标表/状态元数据/类别色令牌)
    ├── TypedPort.tsx (类型化端口，含形状/颜色)
    ├── nodes/ (每种节点的 Body 组件，含 `ReusableBlockBody`)
    ├── edges/SmartEdge.tsx (粒子动画连线)
    ├── overlays/
    │   ├── CompatibilityPreviewOverlay.tsx (拖拽时兼容性预览)
    │   ├── ConnectionStateOverlay.tsx (连接状态覆盖层)
    │   └── NodeInfoOverlay.tsx
    ├── panels/
    │   ├── WorkflowSettingsPanel.tsx (触发器/介入策略共享设置面板，tabs 容器)
    │   ├── NodeConfigPanel.tsx (节点配置 + 实时输出 + 自定义面板/动态表单分发，含 `ReusableBlockPanel`)
    │   ├── DynamicConfigForm.tsx (schema 驱动表单)
    │   ├── AgentNodeConfigPanel.tsx (选已发布 Agent + 版本 + 输入映射，含 legacy 内联配置只读区块)
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

WorkflowPreviewCanvas.tsx
└── 只读工作流预览组件，复用 `CanvasNodeShell` / `SmartEdge` 的外观，用于 template / marketplace / share 等非编辑场景
```

## 目录

| 目录          | 职责                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `api/`        | 画布相关 API 调用；含 `mcpToolQueries.ts` / `mcpToolKeys.ts` 兼容适配层（复用 `features/mcp/` 的 shared query key，违反单一归属原则但保证 NodePalette 与 ToolLibrary 同步刷新）                                                                                                                                                                                                                                                                                               |
| `components/` | 上述组件树，含 `BlockCreateDialog` / `nodes/ReusableBlockBody.tsx` / `panels/ReusableBlockPanel.tsx`                                                                                                                                                                                                                                                                                                                                                                          |
| `hooks/`      | 画布交互 hooks（拖拽/连接/快捷键 + `useLevelOfDetail`）                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `lib/`        | `connectionCompatibility.ts`（同步 guard + cache 读取 + async 适配）、`encapsulation.ts`（多选节点封装分析与 block 替换纯函数）、`typeEngine/`（runtime/worker/fallback/serialize）、`configSchemaToZod.ts`、`nestedFieldTree.ts`（MAX_NESTED_DEPTH=5，buildSchemaTree/buildNestedFieldTree/collectLeafPaths）、`fieldSuggestionEngine.ts`（Levenshtein + token overlap + type compat 三维评分，Top-3 建议 + 0.70 阈值）、`coercionStrategies.ts`（text↔json 转换策略注册表） |
| `stores/`     | canvasStore（Zustand，含 `nodeValidationErrors`）                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `types/`      | nodeTypeRegistry.ts, typeSchema.ts                                                                                                                                                                                                                                                                                                                                                                                                                                            |

## 关键类型文件

- `types/typeSchema.ts` — PortDataType, TypeSchema (Scalar|Object|Array)，手动镜像 Rust type-engine
- `types/nodeTypeRegistry.ts` — NODE_TYPE_REGISTRY, PORT_DATA_TYPE_META, createPort(), clonePortDefinitions()
- `types.ts` — RawCompatibilityLevel, CanvasEdgeData, FieldMapping (含可选 coercionConfig), CandidateFieldMapping, NestedFieldNode, MappingSuggestion, CoercionStrategy (10种), TypeCoercionConfig, ConfidenceLevel, BlockPort/BlockDefinition/BlockNodeData
- `autonomy.types.ts` — Agent 自主性配置类型

## 注意事项

- `WorkflowPreviewCanvas` / `lib/workflowPreview.ts` 是非编辑场景工作流预览的单一事实源：会根据 `data.nodeType` 还原真实节点 category、对端口定义做与正式画布一致的 hydration，并把预览 edge 统一映射为只读 `smart` edge；只有在 `nodeType` 无法识别时才会 fallback 为 React Flow 默认节点，避免 template / marketplace / share 预览普遍退化成黑色矩形
- `WorkflowPreviewCanvas` 默认开启只读平移/缩放：允许拖动画布和滚轮/触控缩放，但节点、连线、handle 继续通过 `.workflow-preview-canvas` 关闭命中，保证“可浏览，不可编辑”
- `text` 是 workflow / agent 双画布共享的文本常量 source node；系统提示词统一通过 `text -> system-prompt-in` 表达，`text-output` / `json-output` 只承担执行结果收口，不要继续拿来承载提示词常量
- workflow `agent`、`agent-main` 与 `sub-agent` 都暴露 `system-prompt-in`；其中 `sub-agent` 额外固定 `model-in` / `schema-in` 作为 override，以及 `tools-in` / `skills-in` / `sub-agents-in` / `knowledge-in` / `memory-in` 作为 extension，不提供 `sandbox-in`
- Agent Canvas 中 React Flow 的 `node.type` 只是渲染类别（`agent/tool/knowledge/...`），真正的业务节点类型必须读 `node.data.nodeType`；凡是 `agent-main` / `sandbox` / `workspace` 这类单例节点的 hydrate、补齐、去重与运行时模式裁剪，都不能拿 `node.type` 当判定依据，否则会把已有主节点误判成缺失并重复补节点
- Agent / workflow 历史快照里若仍带有 legacy MCP 别名 `nodeType='mcp'` 或旧输出句柄 `sourceHandle='tools-out'`，hydrate / safe lookup / 持久化前都必须先 canonicalize 成 `mcp-tool` / `tool-out`；不能把坏快照直接交给 `getNodeTypeConfig()` 或 ReactFlow 渲染
- `CanvasNode` / `NodeInfoCard` / `NodeConfigPanel` 现在必须通过 `getResolvedNodeTypeConfig()` 读取持久化 graph 的节点类型；未知 `nodeType` 统一降级为“未知节点类型”通用展示，保留原始端口与配置数据，禁止单个坏节点触发整页 `Unknown node type` 崩溃
- `agentCanvasStore` / `canvasStore` 在 hydrate 自进化或历史快照时，若节点缺少 `inputPorts/outputPorts`，必须先收敛为 `[]` 再按注册表补齐；`text` 节点若仍带 legacy root-level `text/value/content`，要先回填到 `config.text`，否则 `TextNodeBody` / `TextConfigPanel` 和整页画布都可能被坏快照拖垮
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
- `canvasStore.applyServerSnapshot()` 会在落地服务端快照前修复不完整的 `PortDefinition`：对已知端口按注册表回填 `direction/dataType/schema` 等 canonical 字段，对未知端口则按现有 `dataType/schema` 推导默认 schema，避免历史快照或 API 直改留下的半残端口在 UI / type-engine 中触发 `port.schema.kind` 崩溃
- `canvasStore` 自动清理：删除 edge 时同步清理 binding mapping
- `canvasStore` 现在同时维护 `selectedNodeId`（向后兼容单选）与 `selectedNodeIds`（多选 Set）；涉及 `selectNode/selectEdge/openFieldMapping/onNodesChange(reset/applyServerSnapshot)` 时需保持两者同步
- `canvasStore.nodeValidationErrors` 记录节点级表单校验状态；删除节点和 `onNodesChange(remove)` 都需要同步清理
- `WorkflowCanvasPage` 左上角设置区现使用共享 `WorkflowSettingsPanel`：toolbar 的“触发器 / 介入策略”两个按钮会打开同一个 settings panel 并切换 tabs，而不是渲染两个独立 overlay；实现时不要用会卸载内容的 `TabsContent` 破坏 `TriggerTab` / `InterventionPolicyTab` 本地状态
- `workflowFlowRegistry.ts` 统一导出 workflow 画布与只读预览共用的 `WORKFLOW_NODE_TYPES` / `WORKFLOW_EDGE_TYPES`；其中 `plugin` category 也必须注册到 `CanvasNodeShell`，否则 preview 或正式画布都会退回 React Flow 默认矩形
- `WorkflowCanvas` 现使用自定义 Portal `CanvasContextMenu`（禁止使用 Radix ContextMenu）；多选封装相关的纯函数分析/替换逻辑位于 `lib/encapsulation.ts`，创建前确认表单位于 `components/BlockCreateDialog.tsx`
- `CanvasNode` 使用 `React.memo` 避免重渲染
- `CanvasNode` 现在有 3 档 LOD：`full (>=0.7)` / `compact (0.4–0.7)` / `minimal (<0.4)`；minimal 模式应保持图标方块 + 可连线 handles，不渲染 body、port row 与 execution overlay
- 节点渲染层已拆到 `components/node/`：`CanvasNodeShell.tsx` 只负责数据/状态计算与 LOD 分发，视觉分别落在 `NodeHeader` / `NodeBodyRenderer` / `NodePortRows` / `CompoundFrame`。`components/CanvasNode.tsx` 只剩 re-export，导出名 `CanvasNodeShell` 与 `NodeProps<CanvasNode>` 契约不能改（`workflowFlowRegistry.ts` / `AgentCanvas.tsx` / 只读预览都依赖它）
- 节点主色统一走 `node/nodeVisualMeta.ts` 的 `getNodeAccentToken(nodeType, category)`：基础取 `--color-node-<category>`，`smart-routing` / `input-preprocessor` / `skill` 三个 nodeType 有类别外覆盖；`llm-model` 的 unconfigured / warning 仍降级为 muted / warning。`NodeConfigPanel` 头部芯片与该函数共用同一套色，禁止另建映射
- 节点外壳的边框 / 阴影 / 选中 ring / running conic 描边全在 `index.css` 的 `.canvas-node-shell` 段，组件只通过内联 `--node-color` 传色；`NodeExecutionOverlay` 常驻卡片右上角，头部徽章区靠 `pr-8` 让位，改任一侧都要同步另一侧
- `text-output` / `json-output` 节点在 full LOD 下使用可点击的轻量预览卡；点击后通过 Radix Dialog 打开完整输出详情。手机端详情为全屏弹层，桌面端为大尺寸对话框。`text-output` 详情复用 `MarkdownRenderer`（含 LaTeX / Mermaid / 代码块），`json-output` 详情优先使用结构化 JSON 树，流式或非法 JSON 回退为原文代码视图
- `compoundLayout.ts` 是 `loop / iteration` 内框布局的单一事实源：负责容器最小尺寸、frame insets、child extent 与 resize 下限。这里的 `child extent` 表示**内框本身**，不要在 `buildCompoundChildExtent()` 里提前扣掉子节点宽高；`@xyflow/react` 在真实拖拽时会再按 `node.measured.width/height` 做一次 clamp，所以尺寸扣减必须放在 `clampPositionToExtent()` 阶段完成。compound 子节点仍需按节点 `measured.width/height`（回退到内部默认尺寸）计算最终可达位置，且 `expandParent` 必须保持 `false`，因为父容器本身就是权威拖拽边界。另一个易错点是：ReactFlow 的 `dimensions` 变更会更新 `measured/width/height`，但不会同步刷新 `style.width/height`，所以 resize 相关逻辑必须优先读取 live `measured/width/height`，不能优先信任 `style`
- `SmartEdge` 的描边颜色是**源端口 → 目标端口的数据类型渐变**：`CanvasEdgeData` 里没有端口类型字段，颜色必须靠 `useStore` 从 `nodeLookup` 的 `outputPorts/inputPorts` 按 `sourceHandleId/targetHandleId` 现场解析，取 `PORT_DATA_TYPE_META[type].colorToken`；任一侧解析不到就退回 `--color-primary` 单色。组件只写 `--edge-stroke` / `--edge-glow` 两个自定义属性，具体 `stroke` 声明留在 `index.css`，这样 `.react-flow__edge.dep-active` 之类的高特异性执行态覆盖才不会被内联样式压掉
- `SmartEdge` 粒子只在**目标节点 `status === 'running'`** 时挂载（与 `useExecutionHighlight` 的 dep-active 语义一致），空闲画布上的边一律静止；`error` / `checking` 任何时候都不出粒子
- 边的中点 pill：`L1` / `error` 常驻显示（`L1` 为 `Shuffle` 图标 + 「转换」，点击照旧打开 `FieldMappingPanel`），`L0` / `checking` 仍是 hover / 选中才出现；删除按钮 `edge-delete-*` 只在 `selected` 时渲染
- `NodeConfigPanel` 现在是「头部 chrome + tabs」结构：头部为类别色图标芯片（`getNodeAccentToken`）+ 可编辑标题（直接 `updateNodeData({ label })`）+ 关闭按钮；下接「配置」/「输出」两 tab，节点 `status === 'waiting_intervention'` 时追加「介入」tab 内嵌 `InterventionPanel` 并自动切过去，干预结束后退回「配置」。tab 内容常驻挂载、只切 `hidden`——自定义面板持有 Monaco / 草稿等本地状态，用会卸载的 `TabsContent` 会丢编辑上下文。所需数据仍由 executionStore 的实时事件和 snapshot 恢复共同驱动；「输出」tab 复用 `components/output/OutputContentRenderer`，与 `text-output` / `json-output` 节点详情弹层保持同一套渲染语义
- `NodeConfigPanel` 左缘 4px 拖柄可调宽：默认 360px、夹取区间 `[320, 560]`，宽度持久化在 `localStorage['agentloom-config-panel-width']`，读写全部包 try/catch。面板贴右缘，所以「向左拖 = 变宽」；拖柄同时支持方向键微调。注意 Node 22 的实验性 `localStorage` 全局会遮蔽 jsdom 实现且为 `undefined`，相关测试需自行装内存版 Storage
- 画布侧栏表单统一形态：`@/shared/ui/form`（`DynamicConfigForm` 已接 rhf `Form` provider）+ `@/shared/ui/select` 的 Radix `Select`；`components/` 下不存在原生 `<select>` / `NativeSelect`，新代码也禁止引入。Radix 的 `SelectItem` 不接受空串 value，「未选择 / 继承默认」一律靠 `SelectValue` 的 placeholder 表达；选项集合来自运行时数据（上游端口、策略清单、Agent 版本列表）时，空列表要禁用 trigger 并在 placeholder 里给出空态文案。空串由 `@/shared/ui/select` 的 `Select` 原语统一拦下（隐藏的 `SelectBubbleInput` 会在 `SelectItem` 登记完成前回吐一次空串），调用点无需自行守卫，直接 `onValueChange={setX}` / `onValueChange={field.onChange}`；需要用户可主动选回的「无 / 使用默认」用哨兵常量承载并在调用点映射回 `null` / `undefined`。`SelectContent` 常驻挂载但关闭态挂在游离 fragment 上，测试要先展开（`fireEvent.keyDown(trigger, { key: 'Enter' })`）才能拿到 `role="option"`，选中值只能读 trigger 文案。未接 rhf 的面板不要为了用 `FormLabel` 强行引入 rhf，改用原生 `<label htmlFor>` + `<p className="text-xs font-medium text-error">`，字段容器统一 `flex flex-col gap-1.5`
- `NodeConfigPanel` 配置分发规则：先命中自定义面板（llm-model/mcp-tool/knowledge-base/sandbox/agent/http-tool/reusable-block），否则走 `DynamicConfigForm`，空 schema 显示“该节点无需额外配置”。查表用的是 `getResolvedNodeTypeConfig()` 归一化后的 `nodeConfig.type` 而非原始 `node.data.nodeType`——legacy 别名要靠它才能命中 canonical 面板
- `loop-start / iteration-start` 的配置面板不会把固定上下文端口做成任意增删；固定输出始终由运行时提供，额外透传端口与标签的真实单一事实源仍是父 `loop / iteration` 容器输入，但 start 面板现在也允许直接编辑这些透传端口，并会同步回父容器与当前 start 节点输出
- `llm-model` 节点在 full LOD 下的展示层级固定为：header title 显示配置名称（`config.name`），subtitle 显示 Provider 名称，body 第一行显示模型 ID（`config.modelName`）与状态 badge；不要在 subtitle 或 body 再拼接 `provider:modelId` 这类重复文案
- `knowledge-base` 节点不再直接向运行时展开成独立工具；连接到 Agent 的这些节点会汇总成统一 `search_knowledge` 工具的可选 `knowledgeBaseIds` 白名单，模型调用时必须显式选择知识库 ID
- `DynamicConfigForm` 使用 react-hook-form + Zod；任一字段 blur 后会触发整表校验，以满足多必填字段同时报错
- `AgentNodeConfigPanel` 是 workflow `agent` 节点的配置面板：选择已发布的 Agent Definition + 版本 + 输入映射。节点 data 上若残留 legacy 内联字段（`systemPrompt` / `system_prompt` / `model`，顶层优先、`data.config` 兜底），面板会在 Agent 选择器之后渲染一个只读的「旧版内联 Agent 配置」区块（`data-testid="agent-legacy-inline-config"`，warning 令牌配色，提示词可复制），并指引用户改用 `text` 节点接 `system-prompt-in`。该区块只读——不写回 config、不删除、不改写
- `resolveLegacyNodeTypeAlias`（`types/nodeTypeRegistry.ts`）是前端 legacy 节点类型别名表：`mcp -> mcp-tool`、`llm-agent -> agent`。它只做读取兼容，使存量节点在画布上可识别、可配置；服务端 `normalize-workflow-graph.utils.ts` 的归一化与发布时的 Agent 绑定 422 校验是同一契约的另两个环节
- 端口兼容性检查在拖拽连线时实时触发
- `lib/typeEngine/runtime.worker.ts` 实质上是平台级服务（WASM 加载 + Web Worker 通信），寄存在 feature `lib/` 下而非 `shared/`
- 小屏（`useMediaQuery(LG_QUERY)` 为 false）画布进入**只读浏览**：`WorkflowCanvas` 用 `isEditingDisabled = isReadOnly(归档) || isMobileReadOnly` 统一关掉快捷键删除、右键菜单、连线、拖放、`onMoveEnd` 持久化与 `nodesDraggable/nodesConnectable/connectOnClick`，另加 `elementsSelectable={!isMobileReadOnly}`；但 `onViewportChange` 只受**归档**限制——`viewport` 是受控 prop，小屏一起冻结就连平移缩放都做不了。`onNodeClick` 在 `elementsSelectable=false` 下仍会触发（React Flow 的 `hasPointerEvents` 把 `onClick` 也算进去），底部只读弹层就靠它选中节点
- 小屏只读的三个组件在 `components/readonly/`：`ReadOnlyCanvasBanner`（`pointer-events-none`，由**页面**的顶部 overlay 统一挂载，画布容器不要重复挂，否则会和 breadcrumb / 工具条叠在一起）、`ReadOnlyNodeSheet`（`Sheet side="bottom"`，只读展示 `configSchema` 标题 + 值，schema 之外的历史字段追加在末尾；`showOutput` 才挂 `OutputContentRenderer`，agent 画布无执行态所以不传）、`ReadOnlyWorkflowToolbar`（只有状态徽章 / 历史 / 导出——`VersionToolbar` 的保存快照 / 归档 / 发布不受 props 控制，小屏必须整条换掉）。Agent 侧走 `AgentVersionToolbar` 的 `isReadOnly` prop
- jsdom 没有 `matchMedia`，`useMediaQuery` 一律返回 false，画布测试会**默认落进小屏只读分支**。所有断言编辑行为的用例必须先 `stubViewportWidth(DESKTOP_WIDTH)`（`features/canvas/testing/viewport.ts`），小屏用例用 `MOBILE_WIDTH`，`afterEach` 里 `restoreViewport()`
