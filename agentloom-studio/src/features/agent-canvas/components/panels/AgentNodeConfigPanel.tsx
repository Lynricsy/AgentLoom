import { memo } from 'react';
import { cn } from '@/shared/lib/utils';
import type { CanvasNodeData } from '@/features/canvas/types';
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

  const selectedNode = selectedNodeId
    ? nodes.find((n) => n.id === selectedNodeId)
    : null;

  if (!selectedNode) return null;

  const nodeData = selectedNode.data as CanvasNodeData;

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
        <NodeConfigContent
          nodeType={nodeData.nodeType}
          config={nodeData.config}
          onConfigChange={(config) => updateNodeData(selectedNode.id, { config })}
        />
      </div>
    </div>
  );
});

const NodeConfigContent = memo(function NodeConfigContent({
  nodeType,
  config,
  onConfigChange,
}: {
  nodeType: string;
  config: Record<string, unknown>;
  onConfigChange: (config: Record<string, unknown>) => void;
}) {
  switch (nodeType) {
    case 'llm-model':
      return (
        <LlmModelConfigStub config={config} onConfigChange={onConfigChange} />
      );
    case 'smart-routing':
      return (
        <SmartRoutingConfigStub
          config={config}
          onConfigChange={onConfigChange}
        />
      );
    default:
      return (
        <div className="text-xs text-neutral-500">
          Node configuration for <strong>{nodeType}</strong> not yet available.
        </div>
      );
  }
});

interface StubConfigProps {
  config: Record<string, unknown>;
  onConfigChange: (config: Record<string, unknown>) => void;
}

const LlmModelConfigStub = memo(function LlmModelConfigStub({
  config,
  onConfigChange,
}: StubConfigProps) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <span className="text-xs text-neutral-400">Model</span>
        <input
          type="text"
          value={(config.model as string) ?? ''}
          onChange={(e) => onConfigChange({ ...config, model: e.target.value })}
          placeholder="e.g. gpt-4o"
          className="bg-neutral-800 border border-neutral-700 rounded px-2 py-1.5 text-xs text-neutral-200 placeholder:text-neutral-600 outline-none focus:border-blue-500"
        />
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-xs text-neutral-400">Temperature</span>
        <input
          type="number"
          min={0}
          max={2}
          step={0.1}
          value={(config.temperature as number) ?? 0.7}
          onChange={(e) =>
            onConfigChange({ ...config, temperature: Number(e.target.value) })
          }
          className="bg-neutral-800 border border-neutral-700 rounded px-2 py-1.5 text-xs text-neutral-200 outline-none focus:border-blue-500"
        />
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-xs text-neutral-400">Max Tokens</span>
        <input
          type="number"
          min={1}
          max={128000}
          step={256}
          value={(config.maxTokens as number) ?? 4096}
          onChange={(e) =>
            onConfigChange({ ...config, maxTokens: Number(e.target.value) })
          }
          className="bg-neutral-800 border border-neutral-700 rounded px-2 py-1.5 text-xs text-neutral-200 outline-none focus:border-blue-500"
        />
      </div>
    </div>
  );
});

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
