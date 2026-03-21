import { useCallback } from 'react';
import type { ReactFlowInstance } from '@xyflow/react';
import { DRAG_TRANSFER_TYPE } from '@/features/canvas/components/NodePalette';
import type { PaletteNodeItem, CanvasNodeData } from '@/features/canvas/types';
import { getAgentNodeTypeConfig } from '@/features/canvas/registry/agent-canvas-registry';
import {
  useAgentCanvasActions,
  useAgentCanvasNodes,
  canAddNodeType,
} from '../stores/agent-canvas.store';

function generateNodeId(): string {
  return crypto?.randomUUID?.() ?? `node-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function useAgentCanvasDrop(reactFlowInstance: ReactFlowInstance<any, any> | null) {
  const { addNode } = useAgentCanvasActions();
  const nodes = useAgentCanvasNodes();

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      const raw = event.dataTransfer.getData(DRAG_TRANSFER_TYPE);
      if (!raw || !reactFlowInstance) return;

      let item: PaletteNodeItem;
      try {
        item = JSON.parse(raw) as PaletteNodeItem;
      } catch {
        return;
      }

      const config = getAgentNodeTypeConfig(item.type);
      if (!config) return;

      if (!canAddNodeType(item.type, nodes)) return;

      const position = reactFlowInstance.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      const nodeData: CanvasNodeData = {
        label: item.label,
        nodeType: item.type as CanvasNodeData['nodeType'],
        category: item.category,
        description: item.description,
        config: {},
        inputPorts: config.inputPorts ? [...config.inputPorts] : [],
        outputPorts: config.outputPorts ? [...config.outputPorts] : [],
      };

      addNode({
        id: generateNodeId(),
        type: item.category,
        position,
        data: nodeData,
      });
    },
    [reactFlowInstance, nodes, addNode],
  );

  return { onDragOver, onDrop };
}
