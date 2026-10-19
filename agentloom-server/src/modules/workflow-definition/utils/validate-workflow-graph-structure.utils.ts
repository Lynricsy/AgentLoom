import type { ReactFlowEdge, ReactFlowNode } from '../../../database/schema';
import { readCompoundParentNodeId } from '../../execution/compound-runtime.util';
import { resolveDagPlan } from '../../execution/dag-resolver.service';
import { CyclicGraphException } from '../../execution/execution.exceptions';

function readIdList(entries: unknown, idKey: 'id' | 'name'): string[] {
  if (!Array.isArray(entries)) {
    return [];
  }

  return entries.flatMap((entry: unknown) => {
    if (typeof entry !== 'object' || entry === null) {
      return [];
    }
    const value: unknown = (entry as Record<string, unknown>)[idKey];
    return typeof value === 'string' ? [value] : [];
  });
}

/**
 * 节点声明的端口 id：模板端口（inputPorts/outputPorts）加上动态端口
 * （portMappingMetadata.inputs/outputs 的 name，MCP 工具等节点在运行期按此解析）。
 */
function readPortIds(
  node: ReactFlowNode,
  key: 'inputPorts' | 'outputPorts',
): string[] {
  const metadata: unknown = node.data?.portMappingMetadata;
  const dynamicPorts =
    typeof metadata === 'object' && metadata !== null
      ? (metadata as Record<string, unknown>)[
          key === 'inputPorts' ? 'inputs' : 'outputs'
        ]
      : undefined;

  return [
    ...readIdList(node.data?.[key], 'id'),
    ...readIdList(dynamicPorts, 'name'),
  ];
}

function describeNode(node: ReactFlowNode): string {
  const label = node.data?.label;
  return typeof label === 'string' && label.trim().length > 0
    ? `「${label}」(${node.id})`
    : node.id;
}

/**
 * 发布前的图结构校验：连线端点节点与端口必须存在，且执行图不能有环。
 *
 * 入参必须是 `normalizeWorkflowNodesAndEdges` 的输出：节点端口已按节点类型补齐默认模板，
 * 连线 handle 已对齐到端口 id。节点没有任何端口声明（如插件、未声明端口的复用块）时
 * 无法判定 handle 是否合法，跳过该端的端口校验。
 *
 * 环检测按执行期的分组语义：顶层节点一组，每个复合容器的内部节点各一组，组内连线参与
 * 拓扑排序（与 filterTopLevelExecutionGraph / CompoundExecutionService 一致），
 * 并直接复用执行期的 resolveDagPlan，保证「发布放行」与「运行期不报环」同源。
 */
export function collectWorkflowGraphStructureErrors(
  nodes: ReactFlowNode[],
  edges: ReactFlowEdge[],
): string[] {
  const errors: string[] = [];
  const nodesById = new Map(nodes.map((node) => [node.id, node]));

  for (const edge of edges) {
    const sourceNode = nodesById.get(edge.source);
    const targetNode = nodesById.get(edge.target);

    if (!sourceNode) {
      errors.push(`连线 ${edge.id} 的源节点 ${edge.source} 不存在`);
    } else if (typeof edge.sourceHandle === 'string') {
      const outputPortIds = readPortIds(sourceNode, 'outputPorts');
      if (
        outputPortIds.length > 0 &&
        !outputPortIds.includes(edge.sourceHandle)
      ) {
        errors.push(
          `连线 ${edge.id} 的源端口 ${edge.sourceHandle} 不存在于节点 ${describeNode(sourceNode)}`,
        );
      }
    }

    if (!targetNode) {
      errors.push(`连线 ${edge.id} 的目标节点 ${edge.target} 不存在`);
    } else if (typeof edge.targetHandle === 'string') {
      const inputPortIds = readPortIds(targetNode, 'inputPorts');
      if (
        inputPortIds.length > 0 &&
        !inputPortIds.includes(edge.targetHandle)
      ) {
        errors.push(
          `连线 ${edge.id} 的目标端口 ${edge.targetHandle} 不存在于节点 ${describeNode(targetNode)}`,
        );
      }
    }
  }

  const nodesByGroup = new Map<string | undefined, ReactFlowNode[]>();
  for (const node of nodes) {
    const groupId = readCompoundParentNodeId(node);
    const group = nodesByGroup.get(groupId);
    if (group) {
      group.push(node);
    } else {
      nodesByGroup.set(groupId, [node]);
    }
  }

  for (const [groupId, groupNodes] of nodesByGroup) {
    const groupNodeIds = new Set(groupNodes.map((node) => node.id));
    const groupEdges = edges.filter(
      (edge) => groupNodeIds.has(edge.source) && groupNodeIds.has(edge.target),
    );

    try {
      resolveDagPlan(groupNodes, groupEdges);
    } catch (error) {
      if (!(error instanceof CyclicGraphException)) {
        throw error;
      }
      const container = groupId ? nodesById.get(groupId) : undefined;
      errors.push(
        groupId
          ? `复合节点 ${container ? describeNode(container) : groupId} 内部的连线存在环路`
          : '工作流图存在环路，执行顺序无法确定',
      );
    }
  }

  return errors;
}
