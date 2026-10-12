import {
  memo,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  applyNodeChanges,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type FitViewOptions,
  type NodeChange,
} from "@xyflow/react";
import { useTheme } from "@/shared/hooks/use-theme";
import { cn } from "@/shared/lib/utils";
import type { LevelOfDetail } from "../hooks/useLevelOfDetail";
import type { CanvasNode } from "../types";
import { hasOverlappingSiblings, layoutCanvasNodes } from "../lib/autoLayout";
import {
  buildWorkflowPreviewGraph,
  type WorkflowPreviewDefinition,
  type WorkflowPreviewGraph,
} from "../lib/workflowPreview";
import {
  PreviewModeContext,
  type PreviewModeContextValue,
} from "./PreviewModeContext";
import {
  WORKFLOW_EDGE_TYPES,
  WORKFLOW_NODE_TYPES,
} from "./workflowFlowRegistry";
import { CANVAS_CONTROLS_CLASS } from "./canvasChrome";

const PREVIEW_FIT_VIEW_OPTIONS: FitViewOptions = { padding: 0.16, maxZoom: 1 };

interface PreviewNodesState {
  source: WorkflowPreviewGraph;
  nodes: CanvasNode[];
  /** 已完成重叠检查（无论是否重排）；之前预览固定 full 细节层级以按完整卡片测量 */
  isLayoutResolved: boolean;
}

function createPreviewNodesState(graph: WorkflowPreviewGraph): PreviewNodesState {
  return { source: graph, nodes: graph.nodes, isLayoutResolved: false };
}

/**
 * 全部可见节点测量完成后检查同层重叠（API / Agent 生成的快照常见），重叠才自动布局；
 * 不重叠的快照保留作者的位置。
 */
function PreviewOverlapLayout({
  nodes,
  edges,
  onResolved,
}: {
  nodes: CanvasNode[];
  edges: WorkflowPreviewGraph["edges"];
  /** null 表示无需重排 */
  onResolved: (laidOutNodes: CanvasNode[] | null) => void;
}) {
  const { fitView } = useReactFlow();
  const isMeasured = nodes.every(
    (node) => node.hidden || (node.measured?.width && node.measured.height),
  );

  useEffect(() => {
    if (!isMeasured) return;
    if (!hasOverlappingSiblings(nodes)) {
      onResolved(null);
      return;
    }

    // 浅拷贝后布局，不改写 state 里的节点对象
    const laidOutNodes = nodes.map((node) => ({ ...node }));
    layoutCanvasNodes(laidOutNodes, edges);
    onResolved(laidOutNodes);
    // 回调后本组件即卸载，帧回调不能随卸载取消；等 React Flow 拿到新位置再适配视口
    requestAnimationFrame(() => {
      void fitView(PREVIEW_FIT_VIEW_OPTIONS);
    });
  }, [edges, fitView, isMeasured, nodes, onResolved]);

  return null;
}

interface WorkflowPreviewCanvasProps {
  definition: WorkflowPreviewDefinition | null | undefined;
  className?: string;
  emptyFallback?: ReactNode;
  fitView?: boolean;
  /** 强制预览节点的细节层级，避免小容器里 fitView 把卡片降级成图标方块 */
  lodOverride?: LevelOfDetail;
  interactive?: boolean;
  showBackground?: boolean;
  showControls?: boolean;
  showMiniMap?: boolean;
  testId?: string;
}

export const WorkflowPreviewCanvas = memo(function WorkflowPreviewCanvas({
  definition,
  className,
  emptyFallback = null,
  fitView = true,
  lodOverride,
  interactive = true,
  showBackground = true,
  showControls = false,
  showMiniMap = false,
  testId,
}: WorkflowPreviewCanvasProps) {
  const { resolvedTheme } = useTheme();
  const preview = useMemo(
    () => buildWorkflowPreviewGraph(definition),
    [definition],
  );
  const [storedNodesState, setNodesState] = useState(() =>
    createPreviewNodesState(preview),
  );
  // definition 变化时在渲染期重置，避免先用旧节点渲染一帧
  let nodesState = storedNodesState;
  if (nodesState.source !== preview) {
    nodesState = createPreviewNodesState(preview);
    setNodesState(nodesState);
  }
  const { nodes, isLayoutResolved } = nodesState;

  /** 只吸收尺寸测量；预览不可编辑，其余变更（选中、拖动）不应发生 */
  const handleNodesChange = useCallback(
    (changes: NodeChange<CanvasNode>[]) => {
      const dimensionChanges = changes.filter(
        (change) => change.type === "dimensions",
      );
      if (dimensionChanges.length === 0) return;
      setNodesState((state) => ({
        ...state,
        nodes: applyNodeChanges(dimensionChanges, state.nodes),
      }));
    },
    [],
  );
  const handleLayoutResolved = useCallback(
    (laidOutNodes: CanvasNode[] | null) => {
      setNodesState((state) => ({
        ...state,
        nodes: laidOutNodes ?? state.nodes,
        isLayoutResolved: true,
      }));
    },
    [],
  );
  const previewModeValue = useMemo<PreviewModeContextValue>(
    () => ({
      edges: preview.edges,
      lodOverride: isLayoutResolved ? (lodOverride ?? null) : "full",
    }),
    [preview.edges, isLayoutResolved, lodOverride],
  );

  if (preview.nodes.length === 0) {
    return <>{emptyFallback}</>;
  }

  return (
    <ReactFlowProvider>
      <PreviewModeContext.Provider value={previewModeValue}>
        <ReactFlow
          className={cn("workflow-preview-canvas", className)}
          data-testid={testId}
          nodes={nodes}
          edges={preview.edges}
          onNodesChange={handleNodesChange}
          nodeTypes={WORKFLOW_NODE_TYPES}
          edgeTypes={WORKFLOW_EDGE_TYPES}
          defaultViewport={preview.viewport}
          fitView={fitView}
          fitViewOptions={PREVIEW_FIT_VIEW_OPTIONS}
          minZoom={0.05}
          maxZoom={1.5}
          nodesDraggable={false}
          nodesConnectable={false}
          nodesFocusable={false}
          edgesFocusable={false}
          elementsSelectable={false}
          connectOnClick={false}
          edgesReconnectable={false}
          panOnDrag={interactive}
          zoomOnScroll={interactive}
          zoomOnPinch={interactive}
          zoomOnDoubleClick={interactive}
          preventScrolling={false}
          deleteKeyCode={null}
          proOptions={{ hideAttribution: true }}
          colorMode={resolvedTheme}
        >
          {isLayoutResolved ? null : (
            <PreviewOverlapLayout
              nodes={nodes}
              edges={preview.edges}
              onResolved={handleLayoutResolved}
            />
          )}
          {showBackground ? (
            <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
          ) : null}
          {showControls ? (
            <Controls
              showInteractive={false}
              className={CANVAS_CONTROLS_CLASS}
            />
          ) : null}
          {showMiniMap ? <MiniMap /> : null}
        </ReactFlow>
      </PreviewModeContext.Provider>
    </ReactFlowProvider>
  );
});
