import type {
  ReactFlowEdge,
  ReactFlowNode,
} from '../../database/schema/workflow-definitions.schema';
import type { SandboxConfig } from '../../database/schema/sandbox-sessions.schema';
import { resolveAgentRuntimeSandboxConfig } from '../sandbox/agent-runtime-sandbox-config';
import {
  DEFAULT_AGENT_SANDBOX_TIMEOUT_SECONDS,
  deriveSandboxTimeoutHours,
  normalizeSandboxTimeoutSeconds,
} from '../sandbox/sandbox-timeout.utils';

type CanvasNodeLike = Pick<ReactFlowNode, 'id' | 'type' | 'data'>;
type CanvasEdgeLike = Pick<
  ReactFlowEdge,
  'source' | 'target' | 'sourceHandle' | 'targetHandle'
>;

function resolveNodeType(node: CanvasNodeLike | null | undefined): string {
  const nodeType = node?.data?.nodeType;
  if (typeof nodeType === 'string' && nodeType.length > 0) {
    return nodeType;
  }

  return typeof node?.type === 'string' ? node.type : '';
}

function resolveNodeData(
  node: CanvasNodeLike | null | undefined,
): Record<string, unknown> {
  const data =
    node?.data && typeof node.data === 'object' && !Array.isArray(node.data)
      ? (node.data as Record<string, unknown>)
      : {};
  const config =
    data.config &&
    typeof data.config === 'object' &&
    !Array.isArray(data.config)
      ? (data.config as Record<string, unknown>)
      : {};

  return {
    ...config,
    ...data,
  };
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function extractSandboxConfig(
  data: Record<string, unknown>,
): SandboxConfig | null {
  if (data.enabled === false) {
    return null;
  }

  const timeoutValue =
    typeof data.timeout === 'number' && Number.isFinite(data.timeout)
      ? data.timeout
      : undefined;
  const timeoutSecondsValue =
    typeof data.timeoutSeconds === 'number' &&
    Number.isFinite(data.timeoutSeconds)
      ? data.timeoutSeconds
      : undefined;
  const hasTimeoutHours = typeof timeoutValue === 'number' && timeoutValue > 0;
  const hasTimeoutSeconds =
    typeof timeoutSecondsValue === 'number' && timeoutSecondsValue > 0;
  const normalizedTimeoutSeconds =
    hasTimeoutSeconds || !hasTimeoutHours
      ? normalizeSandboxTimeoutSeconds(
          timeoutSecondsValue,
          DEFAULT_AGENT_SANDBOX_TIMEOUT_SECONDS,
        )
      : undefined;
  const fallbackTimeoutSeconds =
    normalizedTimeoutSeconds ?? DEFAULT_AGENT_SANDBOX_TIMEOUT_SECONDS;

  const cpu =
    typeof data.cpu === 'number'
      ? data.cpu
      : typeof data.cpuLimit === 'number'
        ? data.cpuLimit
        : 1;
  const memory =
    typeof data.memory === 'number'
      ? data.memory
      : typeof data.memoryLimitMb === 'number'
        ? data.memoryLimitMb
        : 512;
  const disk =
    typeof data.disk === 'number'
      ? data.disk
      : typeof data.diskLimitGb === 'number'
        ? data.diskLimitGb
        : 1;

  return {
    cpu,
    memory,
    disk,
    timeout:
      hasTimeoutHours && !hasTimeoutSeconds
        ? timeoutValue!
        : deriveSandboxTimeoutHours(fallbackTimeoutSeconds),
    ...(typeof normalizedTimeoutSeconds === 'number'
      ? { timeoutSeconds: normalizedTimeoutSeconds }
      : {}),
    ...(readString(data.lifecycleMode) === 'session' ||
    readString(data.lifecycleMode) === 'persistent'
      ? {
          lifecycleMode: readString(data.lifecycleMode) as
            | 'session'
            | 'persistent',
        }
      : {}),
    ...(readString(data.persistencePath)
      ? { persistencePath: readString(data.persistencePath) }
      : {}),
    ...(readString(data.restoreWorkspaceId)
      ? { restoreWorkspaceId: readString(data.restoreWorkspaceId) }
      : {}),
    ...(typeof data.persistenceExpiryHours === 'number' &&
    Number.isFinite(data.persistenceExpiryHours)
      ? { persistenceExpiryHours: data.persistenceExpiryHours }
      : {}),
    ...(readString(data.name) ? { name: readString(data.name) } : {}),
    ...(readString(data.persistentSandboxId)
      ? { persistentSandboxId: readString(data.persistentSandboxId) }
      : {}),
  };
}

function findConnectedSandboxNode(
  nodes: CanvasNodeLike[],
  edges: CanvasEdgeLike[],
): CanvasNodeLike | null {
  const nodesById = new Map(nodes.map((node) => [node.id, node] as const));
  const agentMainNode = nodes.find(
    (node) => resolveNodeType(node) === 'agent-main',
  );

  if (!agentMainNode?.id) {
    return null;
  }

  for (const edge of edges) {
    if (
      edge.target === agentMainNode.id &&
      (edge.targetHandle === 'sandbox-in' || !edge.targetHandle)
    ) {
      const sourceNode = nodesById.get(edge.source);
      if (sourceNode && resolveNodeType(sourceNode) === 'sandbox') {
        return sourceNode;
      }
    }
  }

  return null;
}

function attachRestoreWorkspaceId(
  sandboxConfig: SandboxConfig,
  nodes: CanvasNodeLike[],
  edges: CanvasEdgeLike[],
  sandboxNodeId: string | undefined,
): SandboxConfig {
  const nodesById = new Map(nodes.map((node) => [node.id, node] as const));

  for (const edge of edges) {
    if (edge.target !== sandboxNodeId) {
      continue;
    }

    const sourceNode = nodesById.get(edge.source);
    const targetNode = nodesById.get(edge.target);
    if (
      !sourceNode ||
      !targetNode ||
      resolveNodeType(sourceNode) !== 'workspace' ||
      resolveNodeType(targetNode) !== 'sandbox'
    ) {
      continue;
    }

    const workspaceData = resolveNodeData(sourceNode);
    const workspaceId =
      readString(workspaceData.workspaceId) ??
      readString(
        (workspaceData.config as Record<string, unknown> | undefined)
          ?.workspaceId,
      );
    if (workspaceId) {
      sandboxConfig.restoreWorkspaceId = workspaceId;
      break;
    }
  }

  return sandboxConfig;
}

export function deriveAgentSandboxConfigFromCanvas(
  nodes: ReactFlowNode[] | null | undefined,
  edges: ReactFlowEdge[] | null | undefined,
  fallbackConfig?: SandboxConfig | Record<string, unknown> | null,
): SandboxConfig | null {
  const nodeList = Array.isArray(nodes) ? (nodes as CanvasNodeLike[]) : [];
  const edgeList = Array.isArray(edges) ? (edges as CanvasEdgeLike[]) : [];
  const connectedSandboxNode = findConnectedSandboxNode(nodeList, edgeList);
  const hasAgentMainNode = nodeList.some(
    (node) => resolveNodeType(node) === 'agent-main',
  );

  if (connectedSandboxNode) {
    const sandboxConfig = extractSandboxConfig(
      resolveNodeData(connectedSandboxNode),
    );
    if (sandboxConfig) {
      return attachRestoreWorkspaceId(
        sandboxConfig,
        nodeList,
        edgeList,
        connectedSandboxNode.id,
      );
    }
  }

  if (hasAgentMainNode) {
    return null;
  }

  const sandboxNode =
    nodeList.find((node) => resolveNodeType(node) === 'sandbox') ?? null;
  if (sandboxNode) {
    const sandboxConfig = extractSandboxConfig(resolveNodeData(sandboxNode));
    if (sandboxConfig) {
      return attachRestoreWorkspaceId(
        sandboxConfig,
        nodeList,
        edgeList,
        sandboxNode.id,
      );
    }
  }

  if (
    fallbackConfig &&
    typeof fallbackConfig === 'object' &&
    !Array.isArray(fallbackConfig)
  ) {
    return resolveAgentRuntimeSandboxConfig(fallbackConfig as SandboxConfig);
  }

  return null;
}

export function mergeSandboxConfigCandidates(
  primaryConfig: SandboxConfig | null | undefined,
  fallbackConfig: SandboxConfig | null | undefined,
): SandboxConfig | null {
  if (primaryConfig && fallbackConfig) {
    return {
      ...fallbackConfig,
      ...primaryConfig,
    };
  }

  return primaryConfig ?? fallbackConfig ?? null;
}
