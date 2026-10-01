/**
 * 可复用块（reusable-block）执行前展平。
 *
 * 块节点在画布上内嵌一份 `data.blockDefinition`（内部 nodes/edges 与对外端口
 * inputPorts/outputPorts，端口经 sourceNodeId/sourcePortId 映射到块内节点端口）。
 * 调度器没有块执行器：执行快照生成前把每个块节点替换为其内部节点，
 * 内部节点 ID 为 `<blockNodeId>::<innerNodeId>`，连到块端口的外部边按端口映射
 * 改写到对应的内部节点端口。嵌套块逐轮展开，ID 逐层加前缀。
 */
import { REUSABLE_BLOCK_INNER_NODE_ID_SEPARATOR } from '@agentloom/contracts';

import type { ReactFlowEdge, ReactFlowNode } from '../../database/schema';
import { normalizeWorkflowNodesAndEdges } from '../workflow-definition/utils/normalize-workflow-graph.utils';
import { ReusableBlockExpansionException } from './execution.exceptions';
import { isRecord } from './node-value.util';

/** 嵌套层数上限：块定义是内联拷贝，不会成环；上限只防御异常数据。 */
const MAX_BLOCK_NESTING_DEPTH = 16;

interface BlockPortMapping {
  readonly id: string;
  readonly sourceNodeId?: string;
  readonly sourcePortId?: string;
}

interface InlineBlockDefinition {
  readonly nodes: ReactFlowNode[];
  readonly edges: ReactFlowEdge[];
  readonly inputPorts: BlockPortMapping[];
  readonly outputPorts: BlockPortMapping[];
}

function readNodeType(node: ReactFlowNode): string | undefined {
  const data = isRecord(node.data) ? node.data : {};
  const nodeType = data.nodeType ?? data.node_type;
  return typeof nodeType === 'string' ? nodeType : undefined;
}

function isReusableBlockNode(node: ReactFlowNode): boolean {
  return readNodeType(node) === 'reusable-block';
}

function readPortMappings(value: unknown): BlockPortMapping[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter(
    (port): port is BlockPortMapping =>
      isRecord(port) && typeof port.id === 'string',
  );
}

function readBlockDefinition(node: ReactFlowNode): InlineBlockDefinition {
  const raw = isRecord(node.data) ? node.data.blockDefinition : undefined;
  const definition = isRecord(raw) ? raw : undefined;
  const inputPorts = readPortMappings(definition?.inputPorts);
  const outputPorts = readPortMappings(definition?.outputPorts);

  if (
    !definition ||
    !Array.isArray(definition.nodes) ||
    !Array.isArray(definition.edges) ||
    !inputPorts ||
    !outputPorts
  ) {
    throw new ReusableBlockExpansionException(
      node.id,
      '节点缺少内嵌的 blockDefinition（nodes/edges/inputPorts/outputPorts）',
    );
  }

  return {
    nodes: definition.nodes as ReactFlowNode[],
    edges: definition.edges as ReactFlowEdge[],
    inputPorts,
    outputPorts,
  };
}

function innerId(blockNodeId: string, id: string): string {
  return `${blockNodeId}${REUSABLE_BLOCK_INNER_NODE_ID_SEPARATOR}${id}`;
}

/** 把连到块端口的外部边端点解析为 `[内部节点 ID, 内部端口 ID]`。 */
function resolveBlockPort(
  blockNode: ReactFlowNode,
  definition: InlineBlockDefinition,
  direction: 'input' | 'output',
  handle: string | null | undefined,
): [string, string] {
  const ports =
    direction === 'input' ? definition.inputPorts : definition.outputPorts;
  const port = handle
    ? ports.find((candidate) => candidate.id === handle)
    : ports.length === 1
      ? ports[0]
      : undefined;

  if (!port) {
    throw new ReusableBlockExpansionException(
      blockNode.id,
      `外部连线引用了块上不存在的${direction === 'input' ? '输入' : '输出'}端口 "${handle ?? ''}"`,
    );
  }

  if (
    !port.sourceNodeId ||
    !port.sourcePortId ||
    !definition.nodes.some((node) => node.id === port.sourceNodeId)
  ) {
    throw new ReusableBlockExpansionException(
      blockNode.id,
      `块端口 "${port.id}" 没有映射到块内节点`,
    );
  }

  return [innerId(blockNode.id, port.sourceNodeId), port.sourcePortId];
}

function expandOnce(
  nodes: ReactFlowNode[],
  edges: ReactFlowEdge[],
): { nodes: ReactFlowNode[]; edges: ReactFlowEdge[] } {
  const definitions = new Map<string, InlineBlockDefinition>();
  const blockNodes = new Map<string, ReactFlowNode>();
  const internalEdges: ReactFlowEdge[] = [];

  const expandedNodes = nodes.flatMap((node) => {
    if (!isReusableBlockNode(node)) return [node];

    const definition = readBlockDefinition(node);
    definitions.set(node.id, definition);
    blockNodes.set(node.id, node);

    for (const edge of definition.edges) {
      internalEdges.push({
        ...edge,
        id: innerId(node.id, edge.id),
        source: innerId(node.id, edge.source),
        target: innerId(node.id, edge.target),
      });
    }

    return definition.nodes.map((inner): ReactFlowNode => {
      const { parentId: innerParentId, ...rest } = inner;
      const parentId = innerParentId
        ? innerId(node.id, innerParentId)
        : node.parentId;
      return {
        ...rest,
        id: innerId(node.id, inner.id),
        ...(parentId ? { parentId } : {}),
      };
    });
  });

  const rewrittenEdges = edges.map((edge): ReactFlowEdge => {
    let next = edge;

    const sourceBlock = blockNodes.get(edge.source);
    if (sourceBlock) {
      const [source, sourceHandle] = resolveBlockPort(
        sourceBlock,
        definitions.get(edge.source)!,
        'output',
        edge.sourceHandle,
      );
      next = { ...next, source, sourceHandle };
    }

    const targetBlock = blockNodes.get(edge.target);
    if (targetBlock) {
      const [target, targetHandle] = resolveBlockPort(
        targetBlock,
        definitions.get(edge.target)!,
        'input',
        edge.targetHandle,
      );
      next = { ...next, target, targetHandle };
    }

    return next;
  });

  return { nodes: expandedNodes, edges: [...internalEdges, ...rewrittenEdges] };
}

export function expandReusableBlocks(
  nodes: ReactFlowNode[],
  edges: ReactFlowEdge[],
): { nodes: ReactFlowNode[]; edges: ReactFlowEdge[] } {
  let graph = { nodes, edges };

  for (let depth = 0; graph.nodes.some(isReusableBlockNode); depth += 1) {
    if (depth >= MAX_BLOCK_NESTING_DEPTH) {
      const nested = graph.nodes.find(isReusableBlockNode)!;
      throw new ReusableBlockExpansionException(
        nested.id,
        `可复用块嵌套超过 ${MAX_BLOCK_NESTING_DEPTH} 层`,
      );
    }
    graph = expandOnce(graph.nodes, graph.edges);
  }

  return graph;
}

/**
 * 生成执行快照用的图：先规范化（统一 nodeType/端口别名），展平可复用块，
 * 再规范化一次让块内节点与改写后的边同样补齐端口定义与 handle。
 */
export function buildExecutableWorkflowGraph(
  nodes: ReactFlowNode[] | null | undefined,
  edges: ReactFlowEdge[] | null | undefined,
): { nodes: ReactFlowNode[]; edges: ReactFlowEdge[] } {
  const normalized = normalizeWorkflowNodesAndEdges(nodes, edges);
  if (!normalized.nodes.some(isReusableBlockNode)) return normalized;

  const expanded = expandReusableBlocks(normalized.nodes, normalized.edges);
  return normalizeWorkflowNodesAndEdges(expanded.nodes, expanded.edges);
}
