import type { AgentVersionSnapshot } from '../../database/schema/agent-definitions.schema';
import type {
  ReactFlowEdge,
  ReactFlowNode,
} from '../../database/schema/workflow-definitions.schema';
import { normalizeWorkflowNodesAndEdges } from '../workflow-definition/utils/normalize-workflow-graph.utils';

type JsonRecord = Record<string, unknown>;

interface AgentCanvasMigrationInput {
  nodes: ReactFlowNode[];
  edges: ReactFlowEdge[];
  systemPrompt?: string | null;
}

interface WorkflowGraphMigrationInput {
  nodes: ReactFlowNode[];
  edges: ReactFlowEdge[];
}

interface GraphMigrationResult {
  nodes: ReactFlowNode[];
  edges: ReactFlowEdge[];
  changed: boolean;
}

interface AgentCanvasMigrationResult extends GraphMigrationResult {
  systemPrompt: string | null | undefined;
}

const TEXT_NODE_LABEL = 'System Prompt';
const TEXT_NODE_DESCRIPTION =
  '提供可复用的文本常量，可连接到系统提示词或任意文本输入端口';
const TEXT_NODE_TYPE = 'text';
const TEXT_NODE_CATEGORY = 'output';
const SUB_AGENT_NODE_TYPE = 'sub-agent';
const AGENT_MAIN_NODE_TYPE = 'agent-main';
const WORKFLOW_AGENT_NODE_TYPE = 'agent';
const MCP_TOOL_NODE_TYPE = 'mcp-tool';
const SYSTEM_PROMPT_HANDLE = 'system-prompt-in';
const SCHEMA_HANDLE = 'schema-in';

const LEGACY_AGENT_NODE_TYPE_ALIASES: Record<string, string> = {
  mcp: MCP_TOOL_NODE_TYPE,
};

const LEGACY_OUTPUT_HANDLE_ALIASES: Record<string, Record<string, string>> = {
  'llm-model': {
    'model-output': 'model-out',
  },
  workspace: {
    'volume-output': 'volume-out',
  },
  memory: {
    'memory-out-0': 'memory-out',
  },
  'sub-agent': {
    'agent-output': 'agent-out',
  },
  [MCP_TOOL_NODE_TYPE]: {
    'tools-out': 'tool-out',
  },
};

function cloneJson<T>(value: T): T {
  return structuredClone(value);
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toRecord(value: unknown): JsonRecord {
  return isRecord(value) ? value : {};
}

function readNonEmptyString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value !== 'string') {
      continue;
    }

    const normalized = value.trim();
    if (normalized.length > 0) {
      return normalized;
    }
  }

  return undefined;
}

function createScalarSchema(
  kind: string,
  title: string,
): Record<string, unknown> {
  return {
    kind,
    title,
  };
}

function createJsonSchema(title: string): Record<string, unknown> {
  return {
    kind: 'json',
    shape: 'object',
    title,
    properties: {},
    additionalProperties: true,
  };
}

function createPort(
  id: string,
  label: string,
  direction: 'input' | 'output',
  dataType: string,
  options: {
    multiple?: boolean;
    maxConnections?: number | null;
  } = {},
): Record<string, unknown> {
  return {
    id,
    label,
    direction,
    dataType,
    required: false,
    multiple: options.multiple ?? false,
    maxConnections:
      options.maxConnections !== undefined ? options.maxConnections : 1,
    schema:
      dataType === 'json'
        ? createJsonSchema(label || id)
        : createScalarSchema(dataType, label || id),
  };
}

function normalizeHandleId(
  handle: string | null | undefined,
): string | undefined {
  if (typeof handle !== 'string') {
    return undefined;
  }

  return handle.trim().toLowerCase().replaceAll('_', '-');
}

function isLegacySubAgentTextHandle(
  handle: string | null | undefined,
): boolean {
  const normalized = normalizeHandleId(handle);
  return normalized === 'text' || normalized === 'text-in';
}

function isLegacySubAgentJsonHandle(
  handle: string | null | undefined,
): boolean {
  const normalized = normalizeHandleId(handle);
  return normalized === 'json' || normalized === 'json-in';
}

function buildTextNodeId(baseId: string, nodes: ReactFlowNode[]): string {
  const preferred = `${baseId}__system-prompt`;
  const existingIds = new Set(nodes.map((node) => node.id));
  if (!existingIds.has(preferred)) {
    return preferred;
  }

  let suffix = 2;
  while (existingIds.has(`${preferred}-${suffix}`)) {
    suffix += 1;
  }

  return `${preferred}-${suffix}`;
}

function buildEdgeId(baseId: string, edges: ReactFlowEdge[]): string {
  const preferred = `${baseId}__edge`;
  const existingIds = new Set(edges.map((edge) => edge.id));
  if (!existingIds.has(preferred)) {
    return preferred;
  }

  let suffix = 2;
  while (existingIds.has(`${preferred}-${suffix}`)) {
    suffix += 1;
  }

  return `${preferred}-${suffix}`;
}

function createTextNode(
  nodeId: string,
  promptText: string,
  x: number,
  y: number,
): ReactFlowNode {
  return {
    id: nodeId,
    type: TEXT_NODE_CATEGORY,
    position: { x, y },
    data: {
      label: TEXT_NODE_LABEL,
      nodeType: TEXT_NODE_TYPE,
      category: TEXT_NODE_CATEGORY,
      description: TEXT_NODE_DESCRIPTION,
      config: {
        text: promptText,
      },
      inputPorts: [],
      outputPorts: [
        createPort('text-out', '文本', 'output', 'text', {
          multiple: true,
          maxConnections: null,
        }),
      ],
    },
  };
}

function createSystemPromptEdge(
  edgeId: string,
  sourceNodeId: string,
  targetNodeId: string,
): ReactFlowEdge {
  return {
    id: edgeId,
    source: sourceNodeId,
    target: targetNodeId,
    sourceHandle: 'text-out',
    targetHandle: SYSTEM_PROMPT_HANDLE,
    type: 'smart',
  };
}

function createSubAgentInputPorts(): Array<Record<string, unknown>> {
  return [
    createPort(SYSTEM_PROMPT_HANDLE, '系统提示词', 'input', 'text'),
    createPort('model-in', '模型', 'input', 'model'),
    createPort(SCHEMA_HANDLE, 'Schema', 'input', 'json'),
    createPort('tools-in', '扩展工具', 'input', 'tool', {
      multiple: true,
      maxConnections: null,
    }),
    createPort('skills-in', 'Skills', 'input', 'skill', {
      multiple: true,
      maxConnections: null,
    }),
    createPort('sub-agents-in', '子 Agent', 'input', 'agent', {
      multiple: true,
      maxConnections: null,
    }),
    createPort('knowledge-in', '知识库', 'input', 'knowledge', {
      multiple: true,
      maxConnections: null,
    }),
    createPort('memory-in', '记忆', 'input', 'memory', {
      multiple: true,
      maxConnections: null,
    }),
  ];
}

function createSubAgentOutputPorts(): Array<Record<string, unknown>> {
  return [createPort('agent-out', 'Agent', 'output', 'agent')];
}

function canonicalizeAgentNodeType(
  nodeType: string | undefined,
): string | undefined {
  if (!nodeType) {
    return undefined;
  }

  return LEGACY_AGENT_NODE_TYPE_ALIASES[nodeType] ?? nodeType;
}

function getNodeType(node: ReactFlowNode): string | undefined {
  const data = toRecord(node.data);
  return canonicalizeAgentNodeType(
    readNonEmptyString(data.nodeType, data.node_type, node.type),
  );
}

function normalizePortIds(
  ports: unknown,
  direction: 'input' | 'output',
  nodeType: string | undefined,
): unknown {
  if (!Array.isArray(ports)) {
    return ports;
  }

  const canonicalNodeType = canonicalizeAgentNodeType(nodeType);
  if (!canonicalNodeType) {
    return ports;
  }

  const aliases =
    direction === 'output'
      ? LEGACY_OUTPUT_HANDLE_ALIASES[canonicalNodeType]
      : undefined;

  if (!aliases) {
    return ports;
  }

  return ports.map((port) => {
    const record = toRecord(port);
    const portId = readNonEmptyString(record.id);
    if (!portId) {
      return port;
    }

    const normalizedId = aliases[normalizeHandleId(portId) ?? portId];
    if (!normalizedId || normalizedId === portId) {
      return port;
    }

    return {
      ...record,
      id: normalizedId,
    };
  });
}

function normalizeSourceHandleAlias(
  sourceNodeType: string | undefined,
  handle: string | null | undefined,
): string | null | undefined {
  const normalizedHandle = normalizeHandleId(handle);
  if (!normalizedHandle) {
    return handle;
  }

  const aliases =
    LEGACY_OUTPUT_HANDLE_ALIASES[canonicalizeAgentNodeType(sourceNodeType) ?? ''];
  const canonicalHandle = aliases?.[normalizedHandle];
  return canonicalHandle ?? handle;
}

function findAgentMainNode(nodes: ReactFlowNode[]): ReactFlowNode | undefined {
  return nodes.find((node) => getNodeType(node) === AGENT_MAIN_NODE_TYPE);
}

function hasSystemPromptEdge(
  edges: ReactFlowEdge[],
  targetNodeId: string,
): boolean {
  return edges.some(
    (edge) =>
      edge.target === targetNodeId &&
      normalizeHandleId(edge.targetHandle) === SYSTEM_PROMPT_HANDLE,
  );
}

function stripWorkflowAgentSystemPrompt(node: ReactFlowNode): {
  node: ReactFlowNode;
  promptText?: string;
  changed: boolean;
} {
  const data = toRecord(node.data);
  const config = toRecord(data.config);
  const promptText = readNonEmptyString(
    data.systemPrompt,
    data.system_prompt,
    config.systemPrompt,
    config.system_prompt,
  );
  if (!promptText) {
    return { node, changed: false };
  }

  const nextData: JsonRecord = { ...data };
  delete nextData.systemPrompt;
  delete nextData.system_prompt;

  const nextConfig: JsonRecord = { ...config };
  delete nextConfig.systemPrompt;
  delete nextConfig.system_prompt;

  nextData.config = nextConfig;

  return {
    node: {
      ...node,
      data: nextData,
    },
    promptText,
    changed: true,
  };
}

export function migrateAgentCanvasGraph(
  input: AgentCanvasMigrationInput,
): AgentCanvasMigrationResult {
  const originalSignature = JSON.stringify(input);
  const nodes = cloneJson(input.nodes ?? []);
  const rawEdges = cloneJson(input.edges ?? []);
  const nextNodes: ReactFlowNode[] = nodes.map((node): ReactFlowNode => {
    const data = toRecord(node.data);
    const canonicalNodeType = getNodeType(node);

    if (canonicalNodeType === SUB_AGENT_NODE_TYPE) {
      return {
        ...node,
        type: 'agent',
        data: {
          ...data,
          nodeType: SUB_AGENT_NODE_TYPE,
          category: 'agent',
          inputPorts: createSubAgentInputPorts(),
          outputPorts: createSubAgentOutputPorts(),
        },
      };
    }

    const nextType =
      canonicalNodeType === MCP_TOOL_NODE_TYPE ? 'tool' : node.type;
    const nextCategory =
      canonicalNodeType === MCP_TOOL_NODE_TYPE
        ? 'tool'
        : readNonEmptyString(data.category) ?? data.category;

    return {
      ...node,
      ...(typeof nextType === 'string' ? { type: nextType } : {}),
      data: {
        ...data,
        ...(canonicalNodeType ? { nodeType: canonicalNodeType } : {}),
        ...(nextCategory ? { category: nextCategory } : {}),
        inputPorts: normalizePortIds(
          data.inputPorts,
          'input',
          canonicalNodeType,
        ) as JsonRecord[],
        outputPorts: normalizePortIds(
          data.outputPorts,
          'output',
          canonicalNodeType,
        ) as JsonRecord[],
      },
    };
  });
  const nextNodesById = new Map(nextNodes.map((node) => [node.id, node]));

  const transformedEdges: ReactFlowEdge[] = [];
  for (const edge of rawEdges) {
    const targetNode = nextNodesById.get(edge.target);
    const sourceNode = nextNodesById.get(edge.source);
    if (!targetNode || getNodeType(targetNode) !== SUB_AGENT_NODE_TYPE) {
      transformedEdges.push({
        ...edge,
        sourceHandle: normalizeSourceHandleAlias(
          sourceNode ? getNodeType(sourceNode) : undefined,
          edge.sourceHandle,
        ),
      });
      continue;
    }

    if (isLegacySubAgentTextHandle(edge.targetHandle)) {
      if (hasSystemPromptEdge(rawEdges, edge.target)) {
        continue;
      }

      transformedEdges.push({
        ...edge,
        sourceHandle: normalizeSourceHandleAlias(
          sourceNode ? getNodeType(sourceNode) : undefined,
          edge.sourceHandle,
        ),
        targetHandle: SYSTEM_PROMPT_HANDLE,
      });
      continue;
    }

    if (isLegacySubAgentJsonHandle(edge.targetHandle)) {
      const alreadyHasSchemaEdge = rawEdges.some(
        (candidate) =>
          candidate !== edge &&
          candidate.target === edge.target &&
          normalizeHandleId(candidate.targetHandle) === SCHEMA_HANDLE,
      );
      if (alreadyHasSchemaEdge) {
        continue;
      }

      transformedEdges.push({
        ...edge,
        sourceHandle: normalizeSourceHandleAlias(
          sourceNode ? getNodeType(sourceNode) : undefined,
          edge.sourceHandle,
        ),
        targetHandle: SCHEMA_HANDLE,
      });
      continue;
    }

    transformedEdges.push({
      ...edge,
      sourceHandle: normalizeSourceHandleAlias(
        sourceNode ? getNodeType(sourceNode) : undefined,
        edge.sourceHandle,
      ),
    });
  }

  let nextSystemPrompt = input.systemPrompt;
  const promptText = readNonEmptyString(input.systemPrompt);
  const agentMainNode = findAgentMainNode(nextNodes);
  if (promptText && agentMainNode) {
    if (!hasSystemPromptEdge(transformedEdges, agentMainNode.id)) {
      const promptNodeId = buildTextNodeId(agentMainNode.id, nextNodes);
      nextNodes.push(
        createTextNode(
          promptNodeId,
          promptText,
          (agentMainNode.position?.x ?? 320) - 280,
          agentMainNode.position?.y ?? 320,
        ),
      );
      transformedEdges.push(
        createSystemPromptEdge(
          buildEdgeId(`${agentMainNode.id}__system-prompt`, transformedEdges),
          promptNodeId,
          agentMainNode.id,
        ),
      );
    }

    nextSystemPrompt = null;
  } else if (
    !promptText &&
    input.systemPrompt !== undefined &&
    input.systemPrompt !== null
  ) {
    nextSystemPrompt = null;
  }

  const changed =
    JSON.stringify({
      nodes: nextNodes,
      edges: transformedEdges,
      systemPrompt: nextSystemPrompt,
    }) !== originalSignature;

  return {
    nodes: nextNodes,
    edges: transformedEdges,
    systemPrompt: nextSystemPrompt,
    changed,
  };
}

export function migrateAgentVersionSnapshot(snapshot: AgentVersionSnapshot): {
  snapshot: AgentVersionSnapshot;
  changed: boolean;
} {
  const migrated = migrateAgentCanvasGraph({
    nodes: snapshot.nodes,
    edges: snapshot.edges,
    systemPrompt: snapshot.systemPrompt,
  });

  return {
    snapshot: {
      ...snapshot,
      nodes: migrated.nodes,
      edges: migrated.edges,
      systemPrompt: migrated.systemPrompt ?? null,
    },
    changed: migrated.changed,
  };
}

export function migrateWorkflowGraph(
  input: WorkflowGraphMigrationInput,
): GraphMigrationResult {
  const originalSignature = JSON.stringify(input);
  const nextNodes = cloneJson(input.nodes ?? []);
  const nextEdges = cloneJson(input.edges ?? []);

  for (let index = 0; index < nextNodes.length; index += 1) {
    const currentNode = nextNodes[index]!;
    if (getNodeType(currentNode) !== WORKFLOW_AGENT_NODE_TYPE) {
      continue;
    }

    const { node, promptText, changed } =
      stripWorkflowAgentSystemPrompt(currentNode);
    if (changed) {
      nextNodes[index] = node;
    }

    if (!promptText) {
      continue;
    }

    if (hasSystemPromptEdge(nextEdges, currentNode.id)) {
      continue;
    }

    const promptNodeId = buildTextNodeId(currentNode.id, nextNodes);
    nextNodes.push(
      createTextNode(
        promptNodeId,
        promptText,
        (currentNode.position?.x ?? 320) - 280,
        currentNode.position?.y ?? 320,
      ),
    );
    nextEdges.push(
      createSystemPromptEdge(
        buildEdgeId(`${currentNode.id}__system-prompt`, nextEdges),
        promptNodeId,
        currentNode.id,
      ),
    );
  }

  const normalized = normalizeWorkflowNodesAndEdges(nextNodes, nextEdges);
  const changed =
    JSON.stringify({
      nodes: normalized.nodes,
      edges: normalized.edges,
    }) !== originalSignature;

  return {
    nodes: normalized.nodes,
    edges: normalized.edges,
    changed,
  };
}
