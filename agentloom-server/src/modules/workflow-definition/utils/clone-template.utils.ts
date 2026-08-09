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

/**
 * 替换 handle 字符串中出现的旧 node ID 为新 ID
 */
function remapHandle(handle: string, idMap: Map<string, string>): string {
  let result = handle;
  for (const [oldId, newId] of idMap) {
    result = result.replaceAll(oldId, newId);
  }
  return result;
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
 * 同步更新 edge 中的 source / target / sourceHandle / targetHandle 引用。
 * viewport 保持不变。
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

  // 克隆边并替换所有 ID 引用
  const edges: ReactFlowEdge[] = definition.edges.map((edge) => {
    const newEdge: ReactFlowEdge = {
      ...edge,
      id: uuidv7(),
      source: idMap.get(edge.source) ?? edge.source,
      target: idMap.get(edge.target) ?? edge.target,
    };

    if (edge.sourceHandle != null) {
      newEdge.sourceHandle = remapHandle(edge.sourceHandle, idMap);
    }

    if (edge.targetHandle != null) {
      newEdge.targetHandle = remapHandle(edge.targetHandle, idMap);
    }

    return newEdge;
  });

  return {
    nodes,
    edges,
    viewport: { ...definition.viewport },
  };
}
