import { describe, expect, it } from 'vitest';
import type { ReactFlowEdge, ReactFlowNode } from '../../../database/schema';
import {
  attachExecutionRuntimeMeta,
  filterTopLevelExecutionGraph,
  readCompoundParentNodeId,
  readExecutionRuntimeMeta,
} from '../compound-runtime.util';

function makeNode(
  id: string,
  nodeType: string,
  overrides: Record<string, unknown> = {},
): ReactFlowNode {
  return {
    id,
    type: 'control',
    position: { x: 0, y: 0 },
    data: { nodeType },
    ...overrides,
  } as ReactFlowNode;
}

function makeEdge(source: string, target: string): ReactFlowEdge {
  return {
    id: `${source}->${target}`,
    source,
    target,
  } as ReactFlowEdge;
}

describe('compound-runtime.util', () => {
  it('应兼容 snake_case parent_id 并为内部节点附加 compound 运行时元数据', () => {
    const parentNode = makeNode('iteration', 'iteration');
    const childNode = makeNode('iter-start', 'iteration-start', {
      parent_id: 'iteration',
      extent: 'parent',
    });
    const nodesById = new Map([
      [parentNode.id, parentNode],
      [childNode.id, childNode],
    ]);

    expect(readCompoundParentNodeId(childNode)).toBe('iteration');

    const runtimeMeta = readExecutionRuntimeMeta(
      attachExecutionRuntimeMeta(childNode, nodesById),
    );

    expect(runtimeMeta).toEqual({
      compoundParentId: 'iteration',
      isCompoundInternal: true,
      isCompoundContainer: false,
    });
  });

  it('过滤顶层执行图时应排除带 snake_case parent_id 的 compound 内部节点', () => {
    const triggerNode = makeNode('trigger', 'manual-trigger');
    const iterationNode = makeNode('iteration', 'iteration');
    const internalStartNode = makeNode('iter-start', 'iteration-start', {
      parent_id: 'iteration',
      extent: 'parent',
    });
    const snapshot = {
      nodes: [triggerNode, iterationNode, internalStartNode],
      edges: [
        makeEdge('trigger', 'iteration'),
        makeEdge('iteration', 'iter-start'),
      ],
    };

    const topLevelGraph = filterTopLevelExecutionGraph(snapshot);

    expect(topLevelGraph.nodes.map((node) => node.id)).toEqual([
      'trigger',
      'iteration',
    ]);
    expect(topLevelGraph.edges.map((edge) => edge.id)).toEqual([
      'trigger->iteration',
    ]);
  });
});
