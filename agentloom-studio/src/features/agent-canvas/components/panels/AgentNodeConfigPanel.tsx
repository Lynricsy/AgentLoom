import { memo, useCallback } from 'react';
import { cn } from '@/shared/lib/utils';
import type { CanvasNode, CanvasNodeData } from '@/features/canvas/types';
import { CUSTOM_PANEL_REGISTRY } from '@/features/canvas/components/panels/customPanelRegistry';
import { AgentMainConfigPanel } from './AgentMainConfigPanel';
import {
  useAgentCanvasSelectedNodeId,
  useAgentCanvasNodes,
  useAgentCanvasActions,
} from '../../stores/agent-canvas.store';

interface AgentNodeConfigPanelProps {
  className?: string;
}

export const AgentNodeConfigPanel = memo(function AgentNodeConfigPanel({
  className,
}: AgentNodeConfigPanelProps) {
  const selectedNodeId = useAgentCanvasSelectedNodeId();
  const nodes = useAgentCanvasNodes();
  const { updateNodeData, deleteSelectedNode } = useAgentCanvasActions();

  const handlePatchNode = useCallback(
    (patch: Record<string, unknown>) => {
      if (!selectedNodeId) return;
      updateNodeData(selectedNodeId, patch as Partial<CanvasNodeData>);
    },
    [selectedNodeId, updateNodeData],
  );

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
        'absolute top-3 right-3 z-10 w-80 bg-neutral-900/95 backdrop-blur-sm border border-neutral-700 rounded-lg overflow-hidden max-h-[calc(100vh-6rem)]',
        className,
      )}
    >
      <div className="flex items-center justify-between p-3 border-b border-neutral-700">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-medium text-neutral-200">
            {nodeData.label}
          </span>
          <span className="text-xs text-neutral-500">{nodeData.nodeType}</span>
        </div>
        <button
          type="button"
          className="text-xs text-red-400 hover:text-red-300 cursor-pointer"
          onClick={deleteSelectedNode}
        >
          Delete
        </button>
      </div>

      <div className="p-3 overflow-y-auto">
        {customPanel ? (
          customPanel.render({
            node: selectedNode as unknown as CanvasNode,
            onConfigChange: handlePatchNode,
            onValidationChange: () => {},
          })
        ) : (
          <AgentOnlyNodeConfig
            nodeData={nodeData}
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
  onConfigChange,
}: {
  nodeData: CanvasNodeData;
  onConfigChange: (config: Record<string, unknown>) => void;
}) {
  switch (nodeData.nodeType as string) {
    case 'agent-main':
      return (
        <AgentMainConfigPanel
          config={nodeData.config}
          onApply={onConfigChange}
        />
      );
    case 'smart-routing':
      return (
        <SmartRoutingConfigStub
          config={nodeData.config}
          onConfigChange={onConfigChange}
        />
      );
    default:
      return (
        <div className="text-xs text-neutral-500">
          Node configuration for <strong>{nodeData.nodeType}</strong> not yet available.
        </div>
      );
  }
});

interface StubConfigProps {
  config: Record<string, unknown>;
  onConfigChange: (config: Record<string, unknown>) => void;
}

const SmartRoutingConfigStub = memo(function SmartRoutingConfigStub({
  config,
  onConfigChange,
}: StubConfigProps) {
  const strategies = [
    'TOKEN_OPTIMIZED',
    'COST_OPTIMIZED',
    'QUALITY_FIRST',
    'LATENCY_FIRST',
    'HISTORICAL_BEST',
    'FALLBACK_CHAIN',
  ] as const;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <span className="text-xs text-neutral-400">Strategy</span>
        <select
          value={(config.strategy as string) ?? 'FALLBACK_CHAIN'}
          onChange={(e) =>
            onConfigChange({ ...config, strategy: e.target.value })
          }
          className="bg-neutral-800 border border-neutral-700 rounded px-2 py-1.5 text-xs text-neutral-200 outline-none focus:border-blue-500 appearance-none"
        >
          {strategies.map((s) => (
            <option key={s} value={s}>
              {s.replace(/_/g, ' ')}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
});
