import { memo, useCallback, useEffect, useRef } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  type ReactFlowInstance,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { cn } from '@/shared/lib/utils';
import { CanvasNodeShell } from '@/features/canvas/components/CanvasNode';
import { SmartEdge } from '@/features/canvas/components/edges/SmartEdge';
import { AgentNodePalette } from '@/features/canvas/components/AgentNodePalette';
import {
  useAgentCanvasNodes,
  useAgentCanvasEdges,
  useAgentCanvasActions,
  useAgentCanvasStore,
} from '../stores/agent-canvas.store';
import { useAgentCanvasDrop } from '../hooks/useAgentCanvasDrop';
import { AgentGlobalConfigBar } from './AgentGlobalConfigBar';
import { AgentNodeConfigPanel } from './panels/AgentNodeConfigPanel';

const NODE_TYPES = {
  agent: CanvasNodeShell,
  tool: CanvasNodeShell,
  knowledge: CanvasNodeShell,
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

  const reactFlowRef = useRef<ReactFlowInstance<any, any> | null>(null);
  const { onDragOver, onDrop } = useAgentCanvasDrop(reactFlowRef.current);

  useEffect(() => {
    void loadAgent(agentId);
    return () => {
      reset();
    };
  }, [agentId, loadAgent, reset]);

  const onInit = useCallback((instance: ReactFlowInstance<any, any>) => {
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

  const defaultViewport = useAgentCanvasStore((s) => s.viewport);

  return (
    <div className={cn('relative h-full w-full', className)}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        edgeTypes={EDGE_TYPES}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={createConnection}
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

      <AgentNodePalette className="absolute top-3 left-[19.5rem] z-10" />
      <AgentGlobalConfigBar />
      <AgentNodeConfigPanel />
    </div>
  );
});
