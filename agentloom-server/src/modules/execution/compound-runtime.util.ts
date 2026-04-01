import type * as schema from '../../database/schema';

const COMPOUND_CONTAINER_NODE_TYPES = new Set(['loop', 'iteration']);

export interface ExecutionRuntimeMeta {
  compoundParentId?: string;
  isCompoundInternal?: boolean;
  isCompoundContainer?: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readNonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function readNodeTypeFromData(data: unknown): string | null {
  if (!isRecord(data)) {
    return null;
  }

  if (typeof data.nodeType === 'string' && data.nodeType.length > 0) {
    return data.nodeType;
  }

  if (typeof data.node_type === 'string' && data.node_type.length > 0) {
    return data.node_type;
  }

  return null;
}

function isCompoundContainerNode(node: schema.ReactFlowNode): boolean {
  const nodeType = readNodeTypeFromData(node.data);
  return nodeType ? COMPOUND_CONTAINER_NODE_TYPES.has(nodeType) : false;
}

export function readCompoundParentNodeId(node: {
  parentId?: unknown;
  parent_id?: unknown;
}): string | undefined {
  return readNonEmptyString(node.parentId) ?? readNonEmptyString(node.parent_id);
}

export function attachExecutionRuntimeMeta(
  node: schema.ReactFlowNode,
  nodesById: Map<string, schema.ReactFlowNode>,
): Record<string, unknown> {
  const rawData = isRecord(node.data) ? node.data : {};
  const parentNodeId = readCompoundParentNodeId(node);
  const parentNode = parentNodeId ? nodesById.get(parentNodeId) : undefined;
  const isCompoundInternal = Boolean(parentNode && isCompoundContainerNode(parentNode));
  const isCompoundContainer = isCompoundContainerNode(node);

  return {
    ...rawData,
    __execution: {
      ...(parentNodeId ? { compoundParentId: parentNodeId } : {}),
      isCompoundInternal,
      isCompoundContainer,
    } satisfies ExecutionRuntimeMeta,
  };
}

export function readExecutionRuntimeMeta(
  value: unknown,
): ExecutionRuntimeMeta {
  if (!isRecord(value) || !isRecord(value.__execution)) {
    return {};
  }

  return {
    compoundParentId:
      typeof value.__execution.compoundParentId === 'string'
        ? value.__execution.compoundParentId
        : undefined,
    isCompoundInternal: value.__execution.isCompoundInternal === true,
    isCompoundContainer: value.__execution.isCompoundContainer === true,
  };
}

export function isCompoundInternalStep(step: {
  nodeData?: Record<string, unknown> | null;
}): boolean {
  return readExecutionRuntimeMeta(step.nodeData).isCompoundInternal === true;
}

export function isTrackedExecutionStep(step: {
  nodeData?: Record<string, unknown> | null;
}): boolean {
  return !isCompoundInternalStep(step);
}

export function filterTopLevelExecutionGraph(
  snapshot: Pick<schema.WorkflowExecution['definitionSnapshot'], 'nodes' | 'edges'>,
): {
  nodes: schema.ReactFlowNode[];
  edges: schema.ReactFlowEdge[];
} {
  const topLevelNodes = snapshot.nodes.filter(
    (node) => !readCompoundParentNodeId(node),
  );
  const topLevelNodeIds = new Set(topLevelNodes.map((node) => node.id));
  const topLevelEdges = snapshot.edges.filter(
    (edge) => topLevelNodeIds.has(edge.source) && topLevelNodeIds.has(edge.target),
  );

  return {
    nodes: topLevelNodes,
    edges: topLevelEdges,
  };
}
