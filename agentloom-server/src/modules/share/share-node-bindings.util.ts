import type { ReactFlowNode } from '../../database/schema';

/**
 * 节点 `data` / `data.config` 中指向分享方租户的模型凭据与绑定。
 * 公开分享输出与导入副本都必须剥离：匿名访问者不能看到内部 Key ID / 私有端点，
 * 副本也不能继续引用其他租户的资源（导入后按 provider/modelName 重新绑定）。
 */
const SHARE_NODE_BINDING_FIELDS: Readonly<Record<string, true>> = {
  apiKeyId: true,
  api_key_id: true,
  endpointUrl: true,
  endpoint_url: true,
  modelConfigId: true,
  model_config_id: true,
  llmConfigId: true,
  llm_config_id: true,
};

function omitBindingFields(
  record: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(record).filter(
      ([key]) => !Object.hasOwn(SHARE_NODE_BINDING_FIELDS, key),
    ),
  );
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** 返回剥离了绑定字段的新节点数组，不修改入参（入参通常是持久化的快照） */
export function stripShareNodeBindings(
  nodes: ReactFlowNode[],
): ReactFlowNode[] {
  return nodes.map((node) => {
    const data = asRecord(node.data);
    if (!data) {
      return node;
    }

    const config = asRecord(data.config);
    return {
      ...node,
      data: {
        ...omitBindingFields(data),
        ...(config ? { config: omitBindingFields(config) } : {}),
      },
    };
  });
}
