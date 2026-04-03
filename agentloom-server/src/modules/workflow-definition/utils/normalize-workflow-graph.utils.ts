import type {
  ReactFlowEdge,
  ReactFlowNode,
} from '../../../database/schema/workflow-definitions.schema';

type WorkflowNodeCategory =
  | 'agent'
  | 'tool'
  | 'trigger'
  | 'knowledge'
  | 'output'
  | 'control'
  | 'plugin'
  | 'memory';

const WORKFLOW_NODE_CATEGORY_BY_NODE_TYPE: Record<
  string,
  WorkflowNodeCategory
> = {
  'chat-agent': 'agent',
  'llm-model': 'agent',
  'smart-routing': 'agent',
  agent: 'agent',
  skill: 'agent',
  'http-tool': 'tool',
  'code-tool': 'tool',
  'mcp-tool': 'tool',
  sandbox: 'tool',
  'input-preprocessor': 'tool',
  workspace: 'tool',
  'manual-trigger': 'trigger',
  'schedule-trigger': 'trigger',
  'webhook-trigger': 'trigger',
  'api-event-trigger': 'trigger',
  'knowledge-base': 'knowledge',
  'text-output': 'output',
  'json-output': 'output',
  condition: 'control',
  loop: 'control',
  iteration: 'control',
  'loop-start': 'control',
  'iteration-start': 'control',
  'loop-state': 'control',
  result: 'control',
  break: 'control',
  continue: 'control',
  'reusable-block': 'control',
  merge: 'control',
  plugin: 'plugin',
  memory: 'memory',
};

const WORKFLOW_NODE_CATEGORY_VALUES = new Set<WorkflowNodeCategory>([
  'agent',
  'tool',
  'trigger',
  'knowledge',
  'output',
  'control',
  'plugin',
  'memory',
]);

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readNonEmptyString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }

  return undefined;
}

function readOptionalHandle(
  primary: unknown,
  secondary: unknown,
): string | null | undefined {
  if (typeof primary === 'string') {
    const normalized = primary.trim();
    return normalized.length > 0 ? normalized : undefined;
  }

  if (primary === null) {
    return null;
  }

  if (typeof secondary === 'string') {
    const normalized = secondary.trim();
    return normalized.length > 0 ? normalized : undefined;
  }

  if (secondary === null) {
    return null;
  }

  return undefined;
}

function readNodePortRecords(
  nodeData: JsonRecord,
  direction: 'input' | 'output',
): JsonRecord[] {
  const rawPorts =
    direction === 'input'
      ? Array.isArray(nodeData.inputPorts)
        ? nodeData.inputPorts
        : Array.isArray(nodeData.input_ports)
          ? nodeData.input_ports
          : []
      : Array.isArray(nodeData.outputPorts)
        ? nodeData.outputPorts
        : Array.isArray(nodeData.output_ports)
          ? nodeData.output_ports
          : [];

  return rawPorts.filter(isRecord);
}

function normalizeHandleIdentity(handle: string): string {
  return handle
    .trim()
    .toLowerCase()
    .replaceAll('_', '-')
    .replace(/-input$/, '')
    .replace(/-output$/, '')
    .replace(/-in$/, '')
    .replace(/-out$/, '');
}

function normalizeHandleAgainstPorts(
  rawHandle: string | null | undefined,
  portRecords: JsonRecord[],
): string | null | undefined {
  if (rawHandle === null || rawHandle === undefined) {
    return rawHandle;
  }

  const portIds = portRecords
    .map((port) => readNonEmptyString(port.id))
    .filter((portId): portId is string => typeof portId === 'string');

  if (portIds.length === 0 || portIds.includes(rawHandle)) {
    return rawHandle;
  }

  const normalizedHandle = normalizeHandleIdentity(rawHandle);
  const matches = portIds.filter(
    (portId) => normalizeHandleIdentity(portId) === normalizedHandle,
  );

  if (matches.length === 1) {
    return matches[0];
  }

  return rawHandle;
}

function resolveWorkflowNodeType(
  node: ReactFlowNode,
  nodeData: JsonRecord,
): string | undefined {
  const dataNodeType = readNonEmptyString(
    nodeData.nodeType,
    nodeData.node_type,
  );
  if (dataNodeType) {
    return dataNodeType;
  }

  if (
    typeof node.type === 'string' &&
    node.type.trim().length > 0 &&
    node.type !== 'workflow-node' &&
    Object.prototype.hasOwnProperty.call(
      WORKFLOW_NODE_CATEGORY_BY_NODE_TYPE,
      node.type,
    )
  ) {
    return node.type.trim();
  }

  return undefined;
}

function resolveWorkflowNodeCategory(
  nodeType: string | undefined,
  nodeData: JsonRecord,
  rawNodeType: string | undefined,
): string | undefined {
  return (
    readNonEmptyString(nodeData.category, nodeData.node_category) ??
    (nodeType ? WORKFLOW_NODE_CATEGORY_BY_NODE_TYPE[nodeType] : undefined) ??
    (rawNodeType &&
    WORKFLOW_NODE_CATEGORY_VALUES.has(rawNodeType as WorkflowNodeCategory)
      ? rawNodeType
      : undefined)
  );
}

function normalizeNodeData(
  nodeData: JsonRecord,
  nodeType: string | undefined,
  category: string | undefined,
): JsonRecord {
  const normalizedData: JsonRecord = { ...nodeData };

  if (nodeType) {
    normalizedData.nodeType = nodeType;
    delete normalizedData.node_type;
  }

  if (category) {
    normalizedData.category = category;
    delete normalizedData.node_category;
  }

  if (Array.isArray(nodeData.inputPorts)) {
    normalizedData.inputPorts = nodeData.inputPorts;
    delete normalizedData.input_ports;
  } else if (Array.isArray(nodeData.input_ports)) {
    normalizedData.inputPorts = nodeData.input_ports;
    delete normalizedData.input_ports;
  }

  if (Array.isArray(nodeData.outputPorts)) {
    normalizedData.outputPorts = nodeData.outputPorts;
    delete normalizedData.output_ports;
  } else if (Array.isArray(nodeData.output_ports)) {
    normalizedData.outputPorts = nodeData.output_ports;
    delete normalizedData.output_ports;
  }

  const selectedAgentId = readNonEmptyString(
    nodeData.selectedAgentId,
    nodeData.selected_agent_id,
  );
  if (selectedAgentId) {
    normalizedData.selectedAgentId = selectedAgentId;
    delete normalizedData.selected_agent_id;
  }

  const agentVersionId = readNonEmptyString(
    nodeData.agentVersionId,
    nodeData.agent_version_id,
  );
  if (agentVersionId) {
    normalizedData.agentVersionId = agentVersionId;
    delete normalizedData.agent_version_id;
  }

  const agentName = readNonEmptyString(nodeData.agentName, nodeData.agent_name);
  if (agentName) {
    normalizedData.agentName = agentName;
    delete normalizedData.agent_name;
  }

  const transformType = readNonEmptyString(
    nodeData.transformType,
    nodeData.transform_type,
  );
  if (transformType) {
    normalizedData.transformType = transformType;
    delete normalizedData.transform_type;
  }

  const outputFormat = readNonEmptyString(
    nodeData.outputFormat,
    nodeData.output_format,
  );
  if (outputFormat) {
    normalizedData.outputFormat = outputFormat;
    delete normalizedData.output_format;
  }

  return normalizedData;
}

function normalizeWorkflowNode(node: ReactFlowNode): ReactFlowNode {
  const nodeData = isRecord(node.data) ? node.data : {};
  const nodeType = resolveWorkflowNodeType(node, nodeData);
  const category = resolveWorkflowNodeCategory(nodeType, nodeData, node.type);

  return {
    ...node,
    ...(category ? { type: category } : {}),
    data: normalizeNodeData(nodeData, nodeType, category),
  };
}

function normalizeWorkflowEdge(
  edge: ReactFlowEdge,
  nodesById: Map<string, ReactFlowNode>,
): ReactFlowEdge {
  const rawEdge = edge as unknown as JsonRecord;
  const sourceHandle = readOptionalHandle(
    edge.sourceHandle,
    rawEdge.source_handle,
  );
  const targetHandle = readOptionalHandle(
    edge.targetHandle,
    rawEdge.target_handle,
  );
  const sourceNodeData = isRecord(nodesById.get(edge.source)?.data)
    ? (nodesById.get(edge.source)!.data as JsonRecord)
    : {};
  const targetNodeData = isRecord(nodesById.get(edge.target)?.data)
    ? (nodesById.get(edge.target)!.data as JsonRecord)
    : {};
  const normalizedSourceHandle = normalizeHandleAgainstPorts(
    sourceHandle,
    readNodePortRecords(sourceNodeData, 'output'),
  );
  const normalizedTargetHandle = normalizeHandleAgainstPorts(
    targetHandle,
    readNodePortRecords(targetNodeData, 'input'),
  );
  const {
    source_handle: _legacySourceHandle,
    target_handle: _legacyTargetHandle,
    ...rest
  } = rawEdge;

  return {
    ...(rest as unknown as ReactFlowEdge),
    ...(normalizedSourceHandle !== undefined
      ? { sourceHandle: normalizedSourceHandle }
      : {}),
    ...(normalizedTargetHandle !== undefined
      ? { targetHandle: normalizedTargetHandle }
      : {}),
  };
}

export function normalizeWorkflowNodesAndEdges(
  nodes: ReactFlowNode[] | null | undefined,
  edges: ReactFlowEdge[] | null | undefined,
): {
  nodes: ReactFlowNode[];
  edges: ReactFlowEdge[];
} {
  const normalizedNodes = Array.isArray(nodes)
    ? nodes.map(normalizeWorkflowNode)
    : [];
  const nodesById = new Map(normalizedNodes.map((node) => [node.id, node]));
  const normalizedEdges = Array.isArray(edges)
    ? edges.map((edge) => normalizeWorkflowEdge(edge, nodesById))
    : [];

  return {
    nodes: normalizedNodes,
    edges: normalizedEdges,
  };
}
