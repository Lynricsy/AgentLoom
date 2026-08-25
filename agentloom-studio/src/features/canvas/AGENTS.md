# Repository Guidelines

## Project Overview

`src/features/canvas/` 提供工作流可视化编辑器、只读预览和可复用的画布原语，渲染层基于 `@xyflow/react`。
本 feature 负责节点/端口模型、连接兼容性、DAG 约束、编辑草稿、字段映射与工作流画布 UI；服务端 Workflow 实体和执行实时状态仍由各自 feature 管理。
跨 feature 使用时从 `@/features/canvas` 的 `index.ts` 导入。新增公开能力前先确认它确实需要跨 feature 使用，不要为内部便利扩大 barrel。

## Architecture & Data Flow

编辑链路如下：

1. `WorkflowCanvasPage.tsx` 获取 Workflow、执行与权限数据，并装配编辑器周边面板。
2. `WorkflowCanvas.tsx` 从 `canvasStore` 读取草稿，将 surface、overlay、快捷键、拖放和连接 hooks 组合起来。
3. `CanvasSurface.tsx` 将节点/边传给 React Flow；`WORKFLOW_NODE_TYPES` 和 `WORKFLOW_EDGE_TYPES` 是 React Flow 渲染注册表。
4. palette/drop 生成 `AddNodeInput`，`canvasStore.actions.addNode()` 按节点注册表克隆默认端口并写入草稿。
5. `useAutoSave.ts` 订阅 dirty 草稿，向 workflow mutation 提交 `nodes`、`edges`、`viewport` 与 OCC `version`。

节点业务类型必须读取 `node.data.nodeType`；React Flow 的 `node.type` 只是 `agent | tool | trigger | knowledge | output | control | plugin | memory` 渲染类别。所有类别目前都映射到 `CanvasNodeShell`，边类型 `smart` 映射到 `SmartEdge`。

只读链路由 `WorkflowPreviewCanvas.tsx` 与 `lib/workflowPreview.ts` 负责。预览会归一化节点、边、viewport 和端口；未知类型保留为通用卡片，缺 position 的节点进入兜底网格，缺 id 的节点被过滤。`PreviewModeContext` 隔离编辑 store、执行浮层和受保护查询。

## Key Directories

- `components/`：页面组合、React Flow surface/overlay、palette、节点外壳、边和预览组件。
- `components/node/`：`CanvasNodeShell`、header、端口行、compound frame 与 body 分发。
- `components/nodes/`：按业务类型定制的节点 body；没有专用 body 时显示 registry description。
- `components/panels/`：节点配置与字段映射 UI；`customPanelRegistry.tsx` 是定制配置面板分发表。
- `hooks/`：React 生命周期与交互；连接、拖放、autosave、快捷键和字段映射派生逻辑放在这里。
- `stores/canvasStore.ts`：工作流编辑草稿和画布 UI 状态，不是服务端实体缓存。
- `lib/`：DAG、compound layout、字段映射、预览归一化和兼容性等无 React 生命周期逻辑。
- `lib/typeEngine/`：端口序列化、worker/WASM runtime、缓存、服务层与本地 fallback。
- `types/`：节点 registry、端口 schema、控制流配置和类型镜像；`types.ts` 放 CanvasNode/CanvasEdge 等主类型。
- `registry/agent-canvas-registry.ts`：Agent 画布可用节点的独立 registry。
- `testing/viewport.ts`：画布响应式测试统一使用的 viewport stub。
- `api/`：当前没有 canvas 自有 fetcher；Workflow、block、plugin 等远端数据通过所属 feature 的公共 API 获取。

## Development Commands

本 feature 无独立脚本，命令一律在 `agentloom-studio/` 运行：`pnpm dev / typecheck / lint / test / build`；定向测试用 `pnpm test -- src/features/canvas`。完整说明见 `agentloom-studio/AGENTS.md`。

## Node Registries & Types

`types/nodeTypeRegistry.ts` 中的 `NODE_TYPES` 与 `NODE_TYPE_REGISTRY` 是工作流静态节点的事实源。当前节点类型为：

```text
llm-model, http-tool, code-tool, mcp-tool, sandbox
manual-trigger, schedule-trigger, webhook-trigger, api-event-trigger
knowledge-base, text, text-output, json-output
condition, loop, iteration, loop-start, iteration-start, loop-state
result, break, continue, reusable-block, smart-routing, plugin
input-preprocessor, memory, agent, skill, workspace, merge
```

每个 `NodeTypeConfig` 至少定义 type、category、label、icon、description、inputPorts、outputPorts 与 configSchema。端口通过 `createPort()`、`createExecInPort()`、`createExecOutPort()` 等 helper 创建，hydrate 时使用 `clonePortDefinitions()` / `hydratePortDefinitions()`，避免共享可变数组。

`DYNAMIC_ONLY_NODE_TYPES` 通常不直接出现在 palette；`merge` 是显式可见例外。loop/iteration 的 start 等子节点由 store 创建和维护，不应当作普通顶层节点拖入。

新增工作流节点时按实际能力完成以下落点：

1. 在 `NODE_TYPES` 和 `NODE_TYPE_REGISTRY` 注册类型、类别、端口及 config schema。
2. 需要定制卡片内容时新增 `components/nodes/<Name>NodeBody.tsx`，并在 `NodeBodyRenderer.tsx` 分发。
3. 需要定制编辑表单时新增 `components/panels/<Name>ConfigPanel.tsx`，并登记到 `CUSTOM_PANEL_REGISTRY`。
4. 如有特殊 icon，补充 `components/node/nodeVisualMeta.ts` 的 lucide 映射。
5. 如有动态端口、compound 或执行端口语义，同步对应的 port builder、store hydrate/update 与 DAG 规则。
6. 为 registry 默认值、palette 可见性、body/panel 行为和连接边界添加就近测试。

## Connection Validation & Type Engine

`useConnectionValidation.ts` 是落边入口。`isValidConnection` 必须保持同步：先执行端口存在、自连、compound 边界、输入最大连接数等 guard，再读 TypeEngine cache；缓存未命中时只做 `PortDataType` 粗粒度判断和 DAG preview，不发起异步检查。

`onConnect` 调用 `evaluateConnection()` 等待权威兼容性结果，随后运行 `previewDagValidation()`；类型不兼容、cycle 或其他 blocking error 都不得写入 edge。warning 可以落边后提示。

`lib/typeEngine/runtime.worker.ts` 直接加载 `agentloom-type-engine/pkg/agentloom_type_engine_bg.wasm`。runtime 在 worker 内初始化 WASM，按端口契约签名缓存结果、合并相同 in-flight 请求，并为单次请求设置超时。streaming instantiate 不可用时改用 arrayBuffer 加载。

`TypeEngineService` 在 worker/WASM 失败时调用 `fallback.ts` 的本地 evaluator。兼容性原始等级为 `EXACT | TRANSFORM | PARTIAL | INCOMPATIBLE`，经 `adaptCompatibilityToEdgeData()` 转为 SmartEdge 使用的 visual level、缺失字段和候选映射。

`exec`、`volume`、`memory` 只允许同类直连；同步可转换对集中在 `connectionCompatibility.ts`，必须与 Rust evaluator 和 JS fallback 保持一致。异步重算 edge 时用 `mergeEdgeDataWithStoredMappings()` 保留用户并发编辑的 `fieldMapping`。

## Editor Draft Store

`canvasStore` 使用 Zustand、Immer、`subscribeWithSelector` 和 devtools。它保存：

- `nodes`、`edges`、`viewport`、`workflowId`、`version`；
- selection、hover、search、mini-map 和 field-mapping panel 状态；
- `isDirty`、`isSaving`、`lastSavedAt` 与节点校验标记；
- 最多 10 条的字段映射 undo 快照。

`applyServerSnapshot()` 负责 hydrate 服务端快照；已知端口应按 registry 补齐 canonical 字段。`updateNodeData()` 只有在端口契约签名变化时才重算相邻边兼容性。服务端 Workflow 查询结果不要复制为另一份 Zustand 实体缓存；autosave 只从当前草稿构造 mutation payload。

## Agent Canvas Relationship

`agent-canvas` 复用本 feature 的 `CanvasNodeShell`、`SmartEdge`、`AgentNodePalette`、连接预览、只读 sheet、端口类型和部分配置面板。共享视觉与端口契约应优先在 canvas 维护。

Agent 编辑器不复用 `canvasStore`：它有自己的 `agent-canvas.store.ts`、drop hook、编排组件和持久化流程。`AGENT_CANVAS_NODE_REGISTRY` 只列 Agent 画布允许的节点，并额外包含 `agent-main`、`sub-agent` 与实例数约束；不要把 Agent 专属节点加入工作流 palette。

当前共享分发表会复用 `agent-canvas` 的 Skill/SubAgent body 与 panel。修改这些交叉点时同时检查两种画布的渲染，但不要合并两套草稿状态或保存语义。

## Code Conventions & Common Patterns

- 组件只组合渲染；复杂交互进 hooks，可独立验证的计算进 `lib/`。
- 节点表单使用 react-hook-form、Zod 和 shared form primitives；Radix Select 不使用空字符串 item value。
- React Flow 泛型绑定 `CanvasNode` / `CanvasEdge`，生产代码不使用显式 `any`。
- compound 尺寸、extent 与 clamp 统一使用 `lib/compoundLayout.ts`；最终尺寸优先读取 live `measured.width/height`。
- React Flow overlay 中的长表单阻止 wheel 事件传播，避免滚动穿透到底层画布。
- 小屏画布只读但保留平移缩放；不要用移动端分支绕开 store 或连接规则。

## Important Files

- `components/WorkflowCanvas.tsx`：编辑器交互装配。
- `components/CanvasSurface.tsx`：React Flow 边界与注册表消费点。
- `components/workflowFlowRegistry.ts`：React Flow nodeTypes/edgeTypes。
- `types/nodeTypeRegistry.ts`：工作流节点和端口元数据事实源。
- `lib/connectionCompatibility.ts`：连接 guard、cache 与权威检查适配。
- `lib/dagValidator.ts`、`lib/connectionDagPreview.ts`：图结构校验。
- `stores/canvasStore.ts`：编辑草稿及动作。
- `components/panels/customPanelRegistry.tsx`：节点配置面板注册表。

## Runtime/Tooling Preferences

- 渲染层为 React 19 + `@xyflow/react`；表单为 react-hook-form + Zod。
- 类型引擎 WASM 产物来自 `agentloom-type-engine/pkg/`（wasm-pack bundler target，已提交仓库），由 `lib/typeEngine/runtime.worker.ts` 在 Web Worker 内加载；worker/WASM 失败走 `fallback.ts` 本地 evaluator。
- 测试运行在包级 Vitest（jsdom + Testing Library），无 feature 级工具链。

## Testing & QA

测试与源码同级，使用 Vitest、Testing Library 与 jsdom。修改 registry、端口或连接逻辑时优先覆盖 `nodeTypeRegistry.test.ts`、`connectionCompatibility.test.ts`、`dagValidator.test.ts` 和 `canvasStore.test.ts` 中的对应契约。

画布编辑测试必须通过 `testing/viewport.ts` 的 `stubViewportWidth(DESKTOP_WIDTH)` 显式进入桌面模式，并在结束后恢复 viewport；移动端行为使用同文件的 `MOBILE_WIDTH`。
