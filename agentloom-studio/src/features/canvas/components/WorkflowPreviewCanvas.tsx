import { memo, type ReactNode, useMemo } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
} from "@xyflow/react";
import { useTheme } from "@/shared/hooks/use-theme";
import { cn } from "@/shared/lib/utils";
import {
  buildWorkflowPreviewGraph,
  type WorkflowPreviewDefinition,
} from "../lib/workflowPreview";
import {
  WORKFLOW_EDGE_TYPES,
  WORKFLOW_NODE_TYPES,
} from "./workflowFlowRegistry";

interface WorkflowPreviewCanvasProps {
  definition: WorkflowPreviewDefinition | null | undefined;
  className?: string;
  emptyFallback?: ReactNode;
  fitView?: boolean;
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

  if (preview.nodes.length === 0) {
    return <>{emptyFallback}</>;
  }

  return (
    <ReactFlowProvider>
      <ReactFlow
        className={cn("workflow-preview-canvas", className)}
        data-testid={testId}
        nodes={preview.nodes}
        edges={preview.edges}
        nodeTypes={WORKFLOW_NODE_TYPES}
        edgeTypes={WORKFLOW_EDGE_TYPES}
        defaultViewport={preview.viewport}
        fitView={fitView}
        fitViewOptions={{ padding: 0.16, maxZoom: 1 }}
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
        {showBackground ? (
          <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
        ) : null}
        {showControls ? (
          <Controls
            showInteractive={false}
            className="!border-border !bg-surface-elevated !shadow-lg"
          />
        ) : null}
        {showMiniMap ? <MiniMap /> : null}
      </ReactFlow>
    </ReactFlowProvider>
  );
});
