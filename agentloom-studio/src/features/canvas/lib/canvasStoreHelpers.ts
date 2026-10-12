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
  computeChildrenBoundingBox,
  computeMinResizeSize,
  getCompoundFrameInsets,
  readCompoundNodeDimension,
  resolveCompoundContainerSize,
  type CompoundLayoutSize,
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

/** 未测量的同级节点按完整卡片宽度估算，判断是否位于容器正下方 */
const COMPOUND_CHILD_FALLBACK_WIDTH = 240;

/**
 * 写入 compound 容器尺寸。React Flow 渲染取 `width`/`height`（resizer 写入）优先于 `style`，
 * readCompoundNodeDimension 又优先读 `measured`，三处必须一起改，否则旧尺寸会盖过新尺寸。
 */
export function writeCompoundNodeSize(
  node: CanvasNode,
  size: CompoundLayoutSize,
): void {
  node.style = { ...(node.style ?? {}), width: size.width, height: size.height };
  if (typeof node.width === "number") node.width = size.width;
  if (typeof node.height === "number") node.height = size.height;
  if (node.measured) node.measured = { ...size };
}

/**
 * 按收起态与子节点同步 compound 容器尺寸与子节点 extent：
 * - 收起：宽度固定为收起宽度，高度不写死、由内容撑开（端口多时固定高度会把输出端口裁到卡片外）；
 *   不能沿用展开时的大框，否则卡片被拉高、出边悬空、fitView 预留空白。
 * - 展开：至少容纳全部子节点，因此从收起态展开、或载入子节点越界的图时容器会撑开；
 *   不会比当前尺寸更小，用户手动放大的尺寸保留。
 */
export function syncCompoundParentLayout(
  nodes: CanvasNode[],
  parentNodeId: string,
): void {
  const parentNode = nodes.find((node) => node.id === parentNodeId);
  if (!parentNode || !isCompoundContainerNodeType(parentNode.data.nodeType)) {
    return;
  }

  const inputPortCount = parentNode.data.inputPorts.length;
  const outputPortCount = parentNode.data.outputPorts.length;

  if (parentNode.data.config?.isCollapsed === true) {
    const { width } = resolveCompoundContainerSize({
      inputPortCount,
      outputPortCount,
      isCollapsed: true,
    });
    // 每次测量后都会走到这里，已是目标形态时不再写入，避免无意义的新对象与历史步。
    // 不能删除 measured：删了 React Flow 会把节点当作未测量而隐藏并重新测量，形成循环
    if (
      parentNode.style?.width !== width ||
      parentNode.style.height !== undefined
    ) {
      const style = { ...(parentNode.style ?? {}), width };
      delete style.height;
      parentNode.style = style;
    }
    if (typeof parentNode.width === "number") parentNode.width = width;
    if (parentNode.height !== undefined) delete parentNode.height;
    return;
  }

  const childNodes = nodes.filter((node) => node.parentId === parentNodeId);
  const currentSize = resolveCompoundContainerSize({
    inputPortCount,
    outputPortCount,
    width: readCompoundNodeDimension(parentNode, "width"),
    height: readCompoundNodeDimension(parentNode, "height"),
  });
  const childrenFit = computeMinResizeSize(
    computeChildrenBoundingBox(childNodes),
    getCompoundFrameInsets(inputPortCount, outputPortCount),
  );
  const parentSize = {
    width: Math.max(currentSize.width, childrenFit.width),
    height: Math.max(currentSize.height, childrenFit.height),
  };
  writeCompoundNodeSize(parentNode, parentSize);

  const childExtent = buildCompoundChildExtent({
    inputPortCount,
    outputPortCount,
    width: parentSize.width,
    height: parentSize.height,
  });
  for (const childNode of childNodes) {
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

/**
 * 容器占位尺寸；收起态高度不写死，尚未被 React Flow 测量时按收起尺寸估算。
 * 切换时 config 已是新状态，读切换前尺寸需显式传入旧的收起态。
 */
function readCompoundFootprint(
  node: CanvasNode,
  isCollapsed: boolean,
): CompoundLayoutSize {
  const fallback = resolveCompoundContainerSize({
    inputPortCount: node.data.inputPorts.length,
    outputPortCount: node.data.outputPorts.length,
    isCollapsed,
  });
  return {
    width: readCompoundNodeDimension(node, "width") ?? fallback.width,
    height: readCompoundNodeDimension(node, "height") ?? fallback.height,
  };
}

/**
 * 容器收起 / 展开后同步尺寸，并按尺寸差平移同级节点：起点在容器原右边缘及以右的节点横移；
 * 位于容器正下方（横向与容器相交）的节点纵移。展开不会压住后面的节点，
 * 收起不会留下大块空白，来回切换位置可还原。嵌套容器继续向上同步外层尺寸。
 */
export function applyCompoundCollapseToggle(
  nodes: CanvasNode[],
  containerId: string,
): void {
  const container = nodes.find((node) => node.id === containerId);
  if (!container || !isCompoundContainerNodeType(container.data.nodeType)) {
    return;
  }

  const isCollapsed = container.data.config?.isCollapsed === true;
  const before = readCompoundFootprint(container, !isCollapsed);
  syncCompoundParentLayout(nodes, containerId);
  // 刚收起时 measured 仍是展开尺寸，内容高度要等 React Flow 重新测量，先按收起尺寸估算
  const after = isCollapsed
    ? resolveCompoundContainerSize({
        inputPortCount: container.data.inputPorts.length,
        outputPortCount: container.data.outputPorts.length,
        isCollapsed: true,
      })
    : readCompoundFootprint(container, false);
  const deltaX = after.width - before.width;
  const deltaY = after.height - before.height;
  const oldLeft = container.position.x;
  const oldRight = oldLeft + before.width;
  const oldBottom = container.position.y + before.height;
  const groupParentId = container.parentId ?? null;

  for (const sibling of nodes) {
    if (sibling.id === containerId) continue;
    if ((sibling.parentId ?? null) !== groupParentId) continue;
    const siblingWidth =
      readCompoundNodeDimension(sibling, "width") ??
      COMPOUND_CHILD_FALLBACK_WIDTH;
    const isRight = sibling.position.x >= oldRight;
    const isBelow =
      !isRight &&
      sibling.position.y >= oldBottom &&
      sibling.position.x + siblingWidth > oldLeft;
    if (!isRight && !isBelow) continue;
    sibling.position = {
      x: sibling.position.x + (isRight ? deltaX : 0),
      y: sibling.position.y + (isBelow ? deltaY : 0),
    };
  }

  if (groupParentId) {
    syncCompoundParentLayout(nodes, groupParentId);
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
