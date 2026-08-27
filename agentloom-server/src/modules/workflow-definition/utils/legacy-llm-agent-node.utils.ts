export const LEGACY_LLM_AGENT_MIGRATION_DETAIL =
  '检测到已废弃的 llm-agent 内联 Agent 节点；请将其迁移为 agent 节点、绑定已发布 Agent Definition 后重新发布工作流';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * 必须检查归一化前的三个历史字段，否则 alias 会把 llm-agent 改成 agent 并掩盖迁移原因。
 */
export function findLegacyLlmAgentNodeIds(nodes: readonly unknown[]): string[] {
  const nodeIds: string[] = [];

  for (const node of nodes) {
    if (!isRecord(node)) {
      continue;
    }

    const data = isRecord(node.data) ? node.data : {};
    const isLegacyNode =
      node.type === 'llm-agent' ||
      data.nodeType === 'llm-agent' ||
      data.node_type === 'llm-agent';

    if (isLegacyNode && typeof node.id === 'string') {
      nodeIds.push(node.id);
    }
  }

  return nodeIds;
}
