import type { CanvasEdge, CanvasEdgeData, CanvasNode } from "../types";
import { createDefaultEdgeData } from "../types";
import {
  EXEC_PORT_NODE_TYPES,
  type NodeType,
  type NodeTypeConfig,
  type PortDefinition,
} from "../types/nodeTypeRegistry";
import { clonePortDefinitions } from "../types/portSchema";
import {
  buildCompoundOutputPorts,
  isCompoundContainerNodeType,
} from "../types/controlFlow.types";
import {
  buildCompoundChildExtent,
  clampPositionToExtent,
  readCompoundNodeDimension,
  resolveCompoundContainerSize,
} from "../lib/compoundLayout";
import {
  evaluateConnection,
  mergeEdgeDataWithStoredMappings,
  resolveConnectionPorts,
} from "../lib/connectionCompatibility";

/**
 * revalidateConnectedEdges 需要读写 canvas store，改以参数注入 store 句柄，
 * 避免 helper 模块与 store 模块互相 import 形成循环依赖。
 */
export interface CanvasEdgeRevalidationStore {
  getState: () => {
    nodes: CanvasNode[];
    edges: CanvasEdge[];
    actions: {
      refreshEdgeCompatibility: (
        updates: Array<{ edgeId: string; edgeData: CanvasEdgeData }>,
      ) => void;
    };
  };
}

const AGENT_NODE_TYPES: ReadonlySet<NodeType> = new Set(["agent"]);
export function isAgentNodeType(nodeType: string): boolean {
  return AGENT_NODE_TYPES.has(nodeType as NodeType);
}

export function findLastIndex<T>(
  arr: readonly T[],
  predicate: (item: T) => boolean,
): number {
  for (let i = arr.length - 1; i >= 0; i--) {
    if (predicate(arr[i]!)) return i;
  }
  return -1;
}

function prependMissingPort(
  ports: PortDefinition[],
  defaultPorts: readonly PortDefinition[],
  portId: "exec-in" | "exec-out",
): PortDefinition[] {
  if (ports.some((port) => port.id === portId)) {
    return ports;
  }

  const defaultPort = defaultPorts.find((port) => port.id === portId);
  if (!defaultPort) {
    return ports;
  }

  return [clonePortDefinitions([defaultPort])[0]!, ...ports];
}

export function ensureExecPortsForHydration(
  nodeType: string,
  typeConfig: NodeTypeConfig | null,
  inputPorts: PortDefinition[],
  outputPorts: PortDefinition[],
): { inputPorts: PortDefinition[]; outputPorts: PortDefinition[] } {
  if (!typeConfig || !EXEC_PORT_NODE_TYPES.has(nodeType as NodeType)) {
    return { inputPorts, outputPorts };
  }

  return {
    inputPorts: prependMissingPort(
      inputPorts,
      typeConfig.inputPorts,
      "exec-in",
    ),
    outputPorts: prependMissingPort(
      outputPorts,
      typeConfig.outputPorts,
      "exec-out",
    ),
  };
}

export function collectPortIds(ports: readonly { id: string }[]): Set<string> {
  return new Set(ports.map((port) => port.id));
}

export function collectDescendantNodeIds(
  nodes: readonly CanvasNode[],
  rootNodeIds: readonly string[],
): Set<string> {
  const collected = new Set(rootNodeIds);
  let changed = true;

  while (changed) {
    changed = false;
    for (const node of nodes) {
      if (
        node.parentId &&
        collected.has(node.parentId) &&
        !collected.has(node.id)
      ) {
        collected.add(node.id);
        changed = true;
      }
    }
  }

  return collected;
}

export function syncCompoundParentOutputPorts(
  nodes: CanvasNode[],
  parentNodeId: string,
): void {
  const parentNode = nodes.find((node) => node.id === parentNodeId);
  if (!parentNode) {
    return;
  }

  if (
    parentNode.data.nodeType !== "loop" &&
    parentNode.data.nodeType !== "iteration"
  ) {
    return;
  }

  const outputKeys = nodes
    .filter(
      (node) =>
        node.parentId === parentNodeId && node.data.nodeType === "result",
    )
    .map((node) => {
      const outputKey = node.data.config?.outputKey;
      return typeof outputKey === "string" && outputKey.trim().length > 0
        ? outputKey.trim()
        : "result";
    })
    .filter((value, index, items) => items.indexOf(value) === index);

  parentNode.data.outputPorts = buildCompoundOutputPorts(outputKeys);
}

export function syncCompoundParentLayout(
  nodes: CanvasNode[],
  parentNodeId: string,
): void {
  const parentNode = nodes.find((node) => node.id === parentNodeId);
  if (!parentNode || !isCompoundContainerNodeType(parentNode.data.nodeType)) {
    return;
  }

  const isCollapsed = parentNode.data.config?.isCollapsed === true;
  const parentSize = resolveCompoundContainerSize({
    inputPortCount: parentNode.data.inputPorts.length,
    outputPortCount: parentNode.data.outputPorts.length,
    width: readCompoundNodeDimension(parentNode, "width"),
    height: readCompoundNodeDimension(parentNode, "height"),
    isCollapsed,
  });

  parentNode.style = {
    ...(parentNode.style ?? {}),
    width: parentSize.width,
    height: parentSize.height,
  };

  if (isCollapsed) {
    return;
  }

  for (const childNode of nodes) {
    if (childNode.parentId !== parentNodeId) {
      continue;
    }

    const childExtent = buildCompoundChildExtent({
      inputPortCount: parentNode.data.inputPorts.length,
      outputPortCount: parentNode.data.outputPorts.length,
      width: parentSize.width,
      height: parentSize.height,
    });

    childNode.extent = childExtent;
    childNode.expandParent = false;
    childNode.position = clampPositionToExtent(
      childNode.position,
      childExtent,
      {
        childWidth: readCompoundNodeDimension(childNode, "width"),
        childHeight: readCompoundNodeDimension(childNode, "height"),
      },
    );
  }
}

export function createEdgeId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  return `edge-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createNodeId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  return `node-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function matchesSearchQuery(
  node: CanvasNode,
  lowerQuery: string,
): boolean {
  return (
    node.data.label.toLowerCase().includes(lowerQuery) ||
    node.data.nodeType.toLowerCase().includes(lowerQuery)
  );
}

let edgeCompatibilityRefreshVersion = 0;

export function invalidateEdgeCompatibilityRefreshVersion(): number {
  edgeCompatibilityRefreshVersion += 1;
  return edgeCompatibilityRefreshVersion;
}

export function nextEdgeCompatibilityRefreshVersion(): number {
  return invalidateEdgeCompatibilityRefreshVersion();
}

export async function revalidateConnectedEdges(
  store: CanvasEdgeRevalidationStore,
  nodeId: string,
  refreshVersion: number,
) {
  const snapshot = store.getState();
  const connectedEdges = snapshot.edges.filter(
    (edge) => edge.source === nodeId || edge.target === nodeId,
  );

  if (connectedEdges.length === 0) {
    return;
  }

  const updates = await Promise.all(
    connectedEdges.map(async (edge) => {
      const resolved = resolveConnectionPorts(snapshot.nodes, edge);
      const evaluated = await evaluateConnection(
        snapshot.nodes,
        edge,
        snapshot.edges.filter((candidate) => candidate.id !== edge.id),
      );

      const edgeData = resolved
        ? mergeEdgeDataWithStoredMappings(
            resolved.source.port,
            resolved.target.port,
            evaluated.edgeData,
            edge.data ?? createDefaultEdgeData(),
          )
        : evaluated.edgeData;

      return {
        edgeId: edge.id,
        edgeData,
      };
    }),
  );

  if (refreshVersion !== edgeCompatibilityRefreshVersion) {
    return;
  }

  const latestState = store.getState();
  const latestUpdates = updates.flatMap((update) => {
    const latestEdge = latestState.edges.find(
      (edge) => edge.id === update.edgeId,
    );
    if (!latestEdge) {
      return [];
    }

    const resolved = resolveConnectionPorts(latestState.nodes, latestEdge);
    const edgeData = resolved
      ? mergeEdgeDataWithStoredMappings(
          resolved.source.port,
          resolved.target.port,
          update.edgeData,
          latestEdge.data ?? createDefaultEdgeData(),
        )
      : update.edgeData;

    return [
      {
        edgeId: update.edgeId,
        edgeData,
      },
    ];
  });

  if (latestUpdates.length === 0) {
    return;
  }

  latestState.actions.refreshEdgeCompatibility(latestUpdates);
}
