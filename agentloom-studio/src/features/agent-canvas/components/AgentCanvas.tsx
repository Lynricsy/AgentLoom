import { memo, useCallback, useEffect, useRef } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  type Edge,
  type Connection,
  type Node,
  type ReactFlowInstance,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { cn } from '@/shared/lib/utils';
import { CanvasNodeShell } from '@/features/canvas/components/CanvasNode';
import { SmartEdge } from '@/features/canvas/components/edges/SmartEdge';
import { AgentNodePalette } from '@/features/canvas/components/AgentNodePalette';
import { arePortDataTypesCompatible } from '@/features/canvas/lib/connectionCompatibility';
import { useConnectionPreview } from '@/features/canvas/hooks/useConnectionPreview';
import type { CanvasEdgeData, CanvasNodeData } from '@/features/canvas/types';
import {
  useAgentCanvasNodes,
  useAgentCanvasEdges,
  useAgentCanvasActions,
  type AgentCanvasEdge,
} from '../stores/agent-canvas.store';
import { useAgentCanvasDrop } from '../hooks/useAgentCanvasDrop';
import { AgentNodeConfigPanel } from './panels/AgentNodeConfigPanel';

type AgentCanvasNode = Node<CanvasNodeData>;
type AgentCanvasReactFlowInstance = ReactFlowInstance<
  AgentCanvasNode,
  Edge<CanvasEdgeData>
>;

const NODE_TYPES = {
  agent: CanvasNodeShell,
  tool: CanvasNodeShell,
  knowledge: CanvasNodeShell,
  memory: CanvasNodeShell,
  control: CanvasNodeShell,
};

const EDGE_TYPES = {
  smart: SmartEdge,
};

interface AgentCanvasProps {
  agentId: string;
  className?: string;
}

export const AgentCanvas = memo(function AgentCanvas({
  agentId,
  className,
}: AgentCanvasProps) {
  const nodes = useAgentCanvasNodes();
  const edges = useAgentCanvasEdges();
  const {
    onNodesChange,
    onEdgesChange,
    createConnection,
    selectNode,
    selectEdge,
    setViewport,
    loadAgent,
    reset,
  } = useAgentCanvasActions();

  const reactFlowRef = useRef<AgentCanvasReactFlowInstance | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { onDragOver, onDrop } = useAgentCanvasDrop(reactFlowRef);
  const { onConnectStart, onConnectEnd } = useConnectionPreview({ containerRef });

  useEffect(() => {
    void loadAgent(agentId);
    return () => {
      reset();
    };
  }, [agentId, loadAgent, reset]);

  const onInit = useCallback((instance: AgentCanvasReactFlowInstance) => {
    reactFlowRef.current = instance;
  }, []);

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: { id: string }) => {
      selectNode(node.id);
    },
    [selectNode],
  );

  const onEdgeClick = useCallback(
    (_: React.MouseEvent, edge: { id: string }) => {
      selectEdge(edge.id);
    },
    [selectEdge],
  );

  const onPaneClick = useCallback(() => {
    selectNode(null);
    selectEdge(null);
  }, [selectNode, selectEdge]);

  const onMoveEnd = useCallback(
    (_: unknown, viewport: { x: number; y: number; zoom: number }) => {
      setViewport(viewport);
    },
    [setViewport],
  );

  const isValidConnection = useCallback(
    (connection: Connection | AgentCanvasEdge) => {
      const sourceNode = nodes.find((n) => n.id === connection.source);
      const targetNode = nodes.find((n) => n.id === connection.target);
      if (!sourceNode || !targetNode) return false;

      const sourcePort = sourceNode.data.outputPorts.find(
        (p) => p.id === (connection.sourceHandle ?? undefined),
      );
      const targetPort = targetNode.data.inputPorts.find(
        (p) => p.id === (connection.targetHandle ?? undefined),
      );
      if (!sourcePort || !targetPort) return false;

      return arePortDataTypesCompatible(sourcePort.dataType, targetPort.dataType);
    },
    [nodes],
  );

  const defaultViewport = { x: 0, y: 0, zoom: 1 };

  return (
    <div ref={containerRef} className={cn('relative h-full w-full', className)}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        edgeTypes={EDGE_TYPES}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={createConnection}
        onConnectStart={onConnectStart}
        onConnectEnd={onConnectEnd}
        isValidConnection={isValidConnection}
        onInit={onInit}
        onNodeClick={onNodeClick}
        onEdgeClick={onEdgeClick}
        onPaneClick={onPaneClick}
        onMoveEnd={onMoveEnd}
        onDragOver={onDragOver}
        onDrop={onDrop}
        defaultViewport={defaultViewport}
        fitView
        deleteKeyCode={['Backspace', 'Delete']}
        minZoom={0.1}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
      >
        <Background />
        <Controls showInteractive={false} />
      </ReactFlow>

      <AgentNodePalette className="absolute top-3 left-3 z-10" />
      <AgentNodeConfigPanel />
    </div>
  );
});
