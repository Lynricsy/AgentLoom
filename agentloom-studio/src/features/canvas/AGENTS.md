# CANVAS FEATURE 知识库

工作流可视化编辑器。基于 @xyflow/react (ReactFlow)，支持 13 种节点类型和端口兼容性检查。

## 节点类型体系

6 大类 13 种节点，注册在 `types/nodeTypeRegistry.ts`:

| 分类 | 节点类型 | 说明 |
|------|----------|------|
| Agent | llm-agent, chat-agent, llm-model | AI 智能体 |
| Tool | http-tool, code-tool, mcp-tool, sandbox | 工具节点 |
| Trigger | manual, schedule | 触发器 |
| Knowledge | knowledge-base | 知识库检索 |
| Output | text, json | 输出节点 |
| Control | condition, loop | 流程控制 |

**添加新节点**: 注册 `NODE_TYPE_REGISTRY` → 创建 `nodes/XxxBody.tsx` → 创建 `panels/XxxPanel.tsx`

## 端口类型系统

8 种数据类型: `model | text | json | image | audio | tool | sandbox | knowledge`
每种类型有独特视觉形状 (`PORT_DATA_TYPE_META`)。

**兼容性级别**: `EXACT | TRANSFORM | PARTIAL | INCOMPATIBLE` (映射为 L0 | L1 | checking | error)
**当前**: JS fallback 在 `lib/connectionCompatibility.ts` (TODO Story-2.4a → WASM 替换)

## 组件树

```
WorkflowCanvasPage.tsx
└── WorkflowCanvas.tsx (728L, 核心)
    ├── CanvasNode.tsx (React.memo 包裹)
    │   ├── CanvasNodeShell.tsx (外壳)
    │   ├── CanvasNodeCard.tsx (内容卡片)
    │   ├── TypedPort.tsx (类型化端口，含形状/颜色)
    │   └── nodes/ (每种节点的 Body 组件)
    ├── edges/SmartEdge.tsx (粒子动画连线)
    ├── overlays/
    │   ├── CompatibilityPreviewOverlay.tsx (拖拽时兼容性预览)
    │   ├── ConnectionStateOverlay.tsx (连接状态覆盖层)
    │   └── NodeInfoOverlay.tsx
    ├── panels/
    │   ├── NodeConfigPanel.tsx (节点配置)
    │   ├── FieldMappingPanel.tsx (字段映射)
    │   ├── KnowledgeBasePanel.tsx
    │   ├── McpPanel.tsx
    │   └── SandboxPanel.tsx
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
| `components/` | 上述组件树 |
| `hooks/` | 画布交互 hooks (拖拽/连接/快捷键) |
| `lib/` | connectionCompatibility.ts (JS fallback) |
| `stores/` | canvasStore (Zustand, 535L) |
| `types/` | nodeTypeRegistry.ts, typeSchema.ts |

## 关键类型文件

- `types/typeSchema.ts` — PortDataType, TypeSchema (Scalar|Object|Array)，手动镜像 Rust type-engine
- `types/nodeTypeRegistry.ts` — NODE_TYPE_REGISTRY, PORT_DATA_TYPE_META, createPort(), clonePortDefinitions()
- `types.ts` — RawCompatibilityLevel, CanvasEdgeData, FieldMapping
- `autonomy.types.ts` — Agent 自主性配置类型

## 注意事项

- `connectionCompatibility.ts` 第 4 行有 `TODO(Story-2.4a)` — WASM 替换待实施
- `canvasStore` 自动清理：删除 edge 时同步清理 binding mapping
- `CanvasNode` 使用 `React.memo` 避免重渲染
- SmartEdge 有粒子动画效果
- 端口兼容性检查在拖拽连线时实时触发
