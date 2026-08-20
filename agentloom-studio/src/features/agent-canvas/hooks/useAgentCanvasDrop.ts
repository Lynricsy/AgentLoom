import { useCallback, type MutableRefObject } from 'react';
import type { ReactFlowInstance } from '@xyflow/react';
import { DRAG_TRANSFER_TYPE } from '@/features/canvas';
import type {
  CanvasEdge,
  CanvasNode,
  CanvasNodeData,
  PaletteNodeItem,
} from '@/features/canvas';
import { getAgentNodeTypeConfig } from '@/features/canvas/registry/agent-canvas-registry';
import {
  useAgentCanvasActions,
  useAgentCanvasStore,
  canAddNodeType,
} from '../stores/agent-canvas.store';

function generateNodeId(): string {
  return crypto?.randomUUID?.() ?? `node-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}


export function useAgentCanvasDrop(
  reactFlowRef: MutableRefObject<ReactFlowInstance<CanvasNode, CanvasEdge> | null>,
) {
  const { addNode } = useAgentCanvasActions();

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      const raw = event.dataTransfer.getData(DRAG_TRANSFER_TYPE);
      const instance = reactFlowRef.current;
      if (!raw || !instance) return;

      let item: PaletteNodeItem;
      try {
        item = JSON.parse(raw) as PaletteNodeItem;
      } catch {
        return;
      }

      const config = getAgentNodeTypeConfig(item.type);
      if (!config) return;

      const nodes = useAgentCanvasStore.getState().nodes;
      if (!canAddNodeType(item.type, nodes)) return;

      const position = instance.screenToFlowPosition({
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
    [reactFlowRef, addNode],
  );

  return { onDragOver, onDrop };
}
