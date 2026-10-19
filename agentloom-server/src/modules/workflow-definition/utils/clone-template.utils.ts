import { v7 as uuidv7 } from 'uuid';

import type {
  ReactFlowEdge,
  ReactFlowNode,
  ReactFlowViewport,
} from '../../../database/schema/workflow-definitions.schema';

export interface CloneableDefinition {
  nodes: ReactFlowNode[];
  edges: ReactFlowEdge[];
  viewport: ReactFlowViewport;
}

function readNodeParentId(node: ReactFlowNode): string | undefined {
  const rawNode = node as ReactFlowNode & Record<string, unknown>;
  const rawParentId =
    typeof rawNode.parentId === 'string'
      ? rawNode.parentId
      : typeof rawNode.parent_id === 'string'
        ? rawNode.parent_id
        : undefined;

  return rawParentId && rawParentId.trim().length > 0
    ? rawParentId.trim()
    : undefined;
}

/**
 * 克隆模板定义，为所有节点分配新 UUIDv7。
 * 同步更新 edge 的 source / target 与节点 parentId 引用；viewport 保持不变。
 *
 * sourceHandle / targetHandle 是端点节点内的端口 id（`data.inputPorts/outputPorts[].id`，
 * 如 `text-out`），并不引用节点 id；端口声明不随克隆改名，因此 handle 必须原样保留。
 * 若按子串替换旧节点 id，节点 id 与端口 id 前缀重名（如节点 `text` 与端口 `text-out`）时
 * 会把 handle 改成不存在的端口，克隆结果无法发布。
 *
 * @param definition - 包含 nodes、edges、viewport 的模板定义
 * @returns 具有全新 ID 映射的深拷贝定义
 */
export function cloneDefinitionWithNewIds(
  definition: CloneableDefinition,
): CloneableDefinition {
  const idMap = new Map<string, string>();

  // 构建 oldId → newId 映射表
  for (const node of definition.nodes) {
    idMap.set(node.id, uuidv7());
  }

  // 克隆节点并替换 ID
  const nodes: ReactFlowNode[] = definition.nodes.map((node) => {
    const clonedNode = {
      ...node,
      id: idMap.get(node.id)!,
    } as ReactFlowNode & Record<string, unknown>;
    const parentId = readNodeParentId(node);

    if (parentId) {
      clonedNode.parentId = idMap.get(parentId) ?? parentId;
      if ('parent_id' in clonedNode) {
        delete clonedNode.parent_id;
      }
    }

    return clonedNode;
  });

  // 克隆边并替换节点引用；handle 是端口 id，随 `...edge` 原样保留
  const edges: ReactFlowEdge[] = definition.edges.map((edge) => ({
    ...edge,
    id: uuidv7(),
    source: idMap.get(edge.source) ?? edge.source,
    target: idMap.get(edge.target) ?? edge.target,
  }));

  return {
    nodes,
    edges,
    viewport: { ...definition.viewport },
  };
}
