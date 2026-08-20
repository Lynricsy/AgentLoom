# CANVAS FEATURE 知识库

`src/features/canvas/` 是 workflow 可视化编辑器与只读预览的公共实现，基于 `@xyflow/react`。Agent 画布复用其节点、端口和兼容性能力，但保留独立 store。

## 公共边界

其他 feature 必须从 `@/features/canvas` barrel 导入；禁止深路径导入 `components`、`stores`、`api`、`lib`、`hooks` 或 `types`。canvas 跨 feature 依赖同样只消费目标 feature barrel。

## 端口契约

`PortDataType` 共 14 值：

`model | text | json | array | image | audio | tool | sandbox | knowledge | skill | agent | memory | exec | volume`

canonical 全集来自 `@agentloom/contracts` 的 `PORT_DATA_TYPES`。Studio 镜像位于 `types/typeSchema.ts`；`agentloom-contracts/src/port-data-type.test.ts` 机械读取 Studio、server、Rust type-engine 与 plugin SDK 源文件，约束各端为全集子集且各端并集等于 contracts 全集。

兼容性等级为 `EXACT | TRANSFORM | PARTIAL | INCOMPATIBLE`。`lib/connectionCompatibility.ts` 负责同步 guard/cache 与异步权威检查适配；`lib/typeEngine/` 承载 WASM runtime 与 worker。

## 目录职责

- `components/`：渲染与组合，不承载可独立测试的复杂状态机。
- `hooks/`：React 生命周期、用户交互与派生状态。
- `lib/`：无 React 生命周期的纯计算、normalizer、DAG 与 type-engine 适配。
- `stores/`：画布编辑草稿、selection、dirty state 与映射 undo；不缓存服务端实体。
- `types/`：画布本地类型与 registry 镜像。

主要拆分：

- `WorkflowCanvas.tsx` 组合 `CanvasSurface.tsx` 与 `CanvasOverlayLayer.tsx`；连接交互、校验和快捷键分别在 `hooks/useConnectionInteraction.ts`、`useConnectionValidation.ts`、`useCanvasKeyboardShortcuts.ts`。
- `FieldMappingPanel.tsx` 组合 `useFieldMappingDerivedState.ts`、`useFieldMappingInteractions.ts` 与 `FieldMappingSummary.tsx`、`FieldMappingTreePane.tsx`、`FieldMappingList.tsx` 等展示组件。
- 节点外壳位于 `components/node/`；`components/CanvasNode.tsx` 只 re-export `CanvasNodeShell`。
- 只读移动端组件位于 `components/readonly/`，输出渲染位于 `components/output/`。

## 节点与预览

- 节点业务类型读取 `node.data.nodeType`；React Flow 的 `node.type` 只表示渲染类别。
- `NODE_TYPE_REGISTRY` 与 `PORT_DATA_TYPE_META` 位于 `types/nodeTypeRegistry.ts`。
- 添加静态节点需要注册类型、创建 `components/nodes/*Body.tsx` 和需要时的 `components/panels/*Panel.tsx`。
- `WorkflowPreviewCanvas.tsx` 与 `lib/workflowPreview.ts` 是 template、marketplace、share 等非编辑预览的公共实现。
- 预览复用 `CanvasNodeShell` 与 `SmartEdge`，并通过 `PreviewModeContext` 禁止受保护查询、store 写入、执行浮层和粒子动画。
- 未识别节点使用通用未知节点卡片并保留端口/配置；缺 position 的节点进入兜底网格，缺 id 的节点丢弃。

## 状态与快照

- `canvasStore` 只保存编辑草稿、viewport、selection、search、dirty、mapping 和节点校验状态。
- 服务端 workflow/Agent 实体由 TanStack Query 持有；autosave mutation 接收 store 草稿。
- 快照 hydrate 必须补齐缺失的 `inputPorts/outputPorts`，已知端口按 registry 回填 canonical 字段。
- `executionStore` 是实时执行状态来源；`NodeConfigPanel` 与 output 节点直接消费该 store。
- async compatibility 结果落地前必须与最新 `edge.data` 合并，避免覆盖并发 `fieldMapping` 编辑。

## 画布交互约束

- `onConnect` 在持久化 edge 前等待最终兼容性结论；`checking` 只用于预览态。
- `canvasStore.updateNodeData()` 仅在端口契约签名变化时刷新相邻边兼容性。
- compound 容器尺寸与 extent 计算归属 `lib/compoundLayout.ts`；最终 clamp 使用 live `measured.width/height`。
- 小屏画布只读但保留平移缩放；编辑行为测试必须通过 `src/features/canvas/testing/viewport.ts` 显式设置桌面宽度。
- ReactFlow 浮层中的长表单要阻止 wheel 传播到底层画布。

## 表单与类型

- 节点表单使用 react-hook-form、Zod 与 `@/shared/ui/form`。
- Select 使用 `@/shared/ui/select`；空值通过 placeholder 或哨兵表达，`SelectItem` 不使用空字符串 value。
- 生产代码不使用显式 `any`；ReactFlow 泛型必须绑定具体 Node/Edge 类型。
