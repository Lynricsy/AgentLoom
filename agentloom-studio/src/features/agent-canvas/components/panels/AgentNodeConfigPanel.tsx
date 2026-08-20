import { memo, useCallback, type WheelEvent } from 'react';
import { cn } from '@/shared/lib/utils';
import type { CanvasNode, CanvasNodeData } from '@/features/canvas';
import { CUSTOM_PANEL_REGISTRY } from '@/features/canvas';
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
        'absolute top-3 right-3 z-10 flex max-h-[calc(100vh-6rem)] w-80 flex-col overflow-hidden rounded-card border border-border bg-surface/95 shadow-panel backdrop-blur-sm',
        className,
      )}
    >
      <div className="flex shrink-0 items-center justify-between border-b border-border p-3">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-medium text-foreground">
            {nodeData.label}
          </span>
          <span className="text-xs text-muted">{nodeData.nodeType}</span>
        </div>
        <button
          type="button"
          className="cursor-pointer text-xs text-error transition-colors hover:text-error/80"
          onClick={deleteSelectedNode}
        >
          删除
        </button>
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
  onConfigChange,
}: {
  nodeData: CanvasNodeData;
  runtimeMode: 'sandbox' | 'no_sandbox';
  onConfigChange: (config: Record<string, unknown>) => void;
}) {
  switch (nodeData.nodeType as string) {
    case 'agent-main':
      return (
        <AgentMainConfigPanel
          config={nodeData.config}
          runtimeMode={runtimeMode}
          onApply={onConfigChange}
        />
      );
    default:
      return (
        <div className="text-xs text-muted">
          暂不支持配置节点类型 <strong>{nodeData.nodeType}</strong>
        </div>
      );
  }
});

