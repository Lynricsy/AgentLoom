import { memo, useCallback, type WheelEvent } from 'react';
import { cn } from '@/shared/lib/utils';
import type { CanvasNode, CanvasNodeData } from '@/features/canvas';
import {
  CANVAS_FLOATING_CLASS,
  CANVAS_PANEL_HEADER_CLASS,
  CUSTOM_PANEL_REGISTRY,
} from '@/features/canvas';
import { Button } from '@/shared/ui/button';
import { AgentMainConfigPanel } from './AgentMainConfigPanel';
import {
  useAgentCanvasSelectedNodeId,
  useAgentCanvasNodes,
  useAgentCanvasActions,
  useAgentCanvasRuntimeMode,
} from '../../stores/agent-canvas.store';

interface AgentNodeConfigPanelProps {
  className?: string;
}

export const AgentNodeConfigPanel = memo(function AgentNodeConfigPanel({
  className,
}: AgentNodeConfigPanelProps) {
  const selectedNodeId = useAgentCanvasSelectedNodeId();
  const nodes = useAgentCanvasNodes();
  const runtimeMode = useAgentCanvasRuntimeMode();
  const { updateNodeData, deleteSelectedNode } = useAgentCanvasActions();

  const handlePatchNode = useCallback(
    (patch: Record<string, unknown>) => {
      if (!selectedNodeId) return;
      updateNodeData(selectedNodeId, patch as Partial<CanvasNodeData>);
    },
    [selectedNodeId, updateNodeData],
  );
  const handleWheelCapture = useCallback((event: WheelEvent<HTMLDivElement>) => {
    event.stopPropagation();
  }, []);

  const selectedNode = selectedNodeId
    ? nodes.find((n) => n.id === selectedNodeId)
    : null;

  if (!selectedNode) return null;

  const nodeData = selectedNode.data as CanvasNodeData;

  // 查找共享注册表中的面板
  const customPanel = CUSTOM_PANEL_REGISTRY[nodeData.nodeType as string];

  return (
    <div
      className={cn(
        CANVAS_FLOATING_CLASS,
        'absolute top-3 right-3 z-30 flex max-h-[calc(100vh-6rem)] w-[var(--spacing-property-panel)] flex-col overflow-hidden',
        className,
      )}
    >
      <div className={cn(CANVAS_PANEL_HEADER_CLASS, 'shrink-0 justify-between')}>
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-sm font-medium text-foreground">
            {nodeData.label}
          </span>
          <span className="truncate text-xs text-muted-foreground">
            {nodeData.nodeType}
          </span>
        </div>
        <Button
          variant="ghost"
          size="xs"
          className="shrink-0 text-error hover:bg-error/10 hover:text-error"
          onClick={deleteSelectedNode}
        >
          删除
        </Button>
      </div>

      <div
        data-testid="agent-node-config-scroll"
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3"
        onWheelCapture={handleWheelCapture}
      >
        {customPanel ? (
          customPanel.render({
            node: selectedNode as unknown as CanvasNode,
            onConfigChange: handlePatchNode,
            onValidationChange: () => {},
          })
        ) : (
          <AgentOnlyNodeConfig
            nodeData={nodeData}
            runtimeMode={runtimeMode}
            hasHarnessNode={nodes.some(
              (node) => (node.data?.nodeType as string | undefined) === 'harness',
            )}
            onConfigChange={(config) => updateNodeData(selectedNode.id, { config })}
          />
        )}
      </div>
    </div>
  );
});

/**
 * Agent Canvas 专属节点配置（不在 CUSTOM_PANEL_REGISTRY 中的类型）
 */
const AgentOnlyNodeConfig = memo(function AgentOnlyNodeConfig({
  nodeData,
  runtimeMode,
  hasHarnessNode,
  onConfigChange,
}: {
  nodeData: CanvasNodeData;
  runtimeMode: 'sandbox' | 'no_sandbox';
  hasHarnessNode: boolean;
  onConfigChange: (config: Record<string, unknown>) => void;
}) {
  switch (nodeData.nodeType as string) {
    case 'agent-main':
      return (
        <AgentMainConfigPanel
          config={nodeData.config}
          runtimeMode={runtimeMode}
          hasHarnessNode={hasHarnessNode}
          onApply={onConfigChange}
        />
      );
    default:
      return (
        <div className="text-xs text-muted-foreground">
          暂不支持配置节点类型 <strong>{nodeData.nodeType}</strong>
        </div>
      );
  }
});

