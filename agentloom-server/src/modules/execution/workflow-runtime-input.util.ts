import type {
  ExecutionStep,
  ReactFlowEdge,
  SandboxConfig,
} from '../../database/schema';
import type { MemoryResourceConfig } from '../agent-memory/memory-resource.provider';
import {
  getRuntimeNodeData,
  isRecord,
  readFirstString,
  readNumber,
  readOptionalNumber,
} from './node-value.util';

export function getWorkflowAgentDefinitionId(
  nodeData: Record<string, unknown>,
): string | undefined {
  const runtimeNodeData = getRuntimeNodeData(nodeData);

  return readFirstString(
    runtimeNodeData.agentDefinitionId,
    runtimeNodeData.agent_definition_id,
    runtimeNodeData.selectedAgentId,
    runtimeNodeData.selected_agent_id,
  );
}

export function getWorkflowAgentRuntimeMode(
  nodeData: Record<string, unknown>,
): 'sandbox' | 'no_sandbox' {
  const runtimeNodeData = getRuntimeNodeData(nodeData);
  const runtimeMode = readFirstString(
    runtimeNodeData.agentRuntimeMode,
    runtimeNodeData.agent_runtime_mode,
    runtimeNodeData.runtimeMode,
    runtimeNodeData.runtime_mode,
  );

  return runtimeMode === 'no_sandbox' ? 'no_sandbox' : 'sandbox';
}

export function buildWorkflowAgentCheckpointData(
  checkpointData: ExecutionStep['checkpointData'],
  executionId: string,
  sandboxNodeId?: string,
  workspaceSnapshotId?: string,
): Record<string, unknown> {
  const rawCheckpoint = isRecord(checkpointData) ? checkpointData : {};
  const {
    sandboxNodeId: _sandboxNodeId,
    serverSandbox: _serverSandbox,
    ...existingCheckpoint
  } = rawCheckpoint;

  return {
    ...existingCheckpoint,
    ...(sandboxNodeId ? { sandboxNodeId } : {}),
    ...(sandboxNodeId
      ? {
          serverSandbox: {
            executionId,
            sandboxNodeId,
          },
        }
      : {}),
    ...(workspaceSnapshotId ? { workspaceSnapshotId } : {}),
  };
}

export function getWorkflowSandboxOverride(
  nodeId: string,
  edges: ReactFlowEdge[],
  steps: ExecutionStep[],
): SandboxConfig | undefined {
  const sourceStep = getSandboxSourceStep(nodeId, edges, steps);
  if (sourceStep) {
    return resolveSandboxConfigForStep(sourceStep, edges, steps);
  }

  return undefined;
}

export function resolveSandboxConfig(
  nodeData: Record<string, unknown>,
  overrides: {
    restoreWorkspaceId?: string;
  } = {},
): SandboxConfig {
  const sandboxConfigSource = getSandboxConfigSource(nodeData);
  const lifecycleModeValue = readFirstString(
    sandboxConfigSource.lifecycleMode,
    sandboxConfigSource.lifecycle_mode,
  );
  const lifecycleMode =
    lifecycleModeValue === 'persistent'
      ? 'persistent'
      : lifecycleModeValue === 'session'
        ? 'session'
        : undefined;
  const restoreWorkspaceId = readFirstString(
    overrides.restoreWorkspaceId,
    sandboxConfigSource.restoreWorkspaceId,
    sandboxConfigSource.restore_workspace_id,
  );
  const persistencePath = readFirstString(
    sandboxConfigSource.persistencePath,
    sandboxConfigSource.persistence_path,
  );
  const persistenceExpiryHours = readOptionalNumber(
    sandboxConfigSource.persistenceExpiryHours,
    sandboxConfigSource.persistence_expiry_hours,
  );
  const name = readFirstString(
    sandboxConfigSource.name,
    sandboxConfigSource.persistentSandboxName,
    sandboxConfigSource.persistent_sandbox_name,
  );
  const persistentSandboxId = readFirstString(
    sandboxConfigSource.persistentSandboxId,
    sandboxConfigSource.persistent_sandbox_id,
  );

  return {
    cpu: readNumber(sandboxConfigSource.cpu, 1),
    memory: readNumber(sandboxConfigSource.memory, 512),
    disk: readNumber(sandboxConfigSource.disk, 2),
    timeout: readNumber(sandboxConfigSource.timeout, 0),
    ...(persistencePath ? { persistencePath } : {}),
    ...(restoreWorkspaceId ? { restoreWorkspaceId } : {}),
    ...(lifecycleMode ? { lifecycleMode } : {}),
    ...(persistenceExpiryHours !== undefined ? { persistenceExpiryHours } : {}),
    ...(name ? { name } : {}),
    ...(persistentSandboxId ? { persistentSandboxId } : {}),
  };
}

export function resolveSandboxConfigForStep(
  step: ExecutionStep,
  edges: ReactFlowEdge[],
  steps: ExecutionStep[],
): SandboxConfig {
  return resolveSandboxConfig(step.nodeData ?? {}, {
    restoreWorkspaceId: getSandboxRestoreWorkspaceId(step.nodeId, edges, steps),
  });
}

export function getSandboxConfigSource(
  nodeData: Record<string, unknown>,
): Record<string, unknown> {
  const nestedConfig = nodeData.config;
  const sandboxConfig = nodeData.sandboxConfig;
  const globalSandboxConfig = nodeData.globalSandboxConfig;

  if (isRecord(nestedConfig)) {
    return nestedConfig;
  }

  if (isRecord(sandboxConfig)) {
    return sandboxConfig;
  }

  if (
    isRecord(globalSandboxConfig) &&
    isRecord(globalSandboxConfig.sandboxConfig)
  ) {
    return globalSandboxConfig.sandboxConfig;
  }

  if (isRecord(globalSandboxConfig)) {
    return globalSandboxConfig;
  }

  return nodeData;
}

export function resolveMemoryConfig(
  nodeData: Record<string, unknown>,
  tenantId: string,
  executionId: string,
): MemoryResourceConfig {
  const memoryConfigSource = getRuntimeNodeData(nodeData);
  const memoryInstanceId = readFirstString(
    memoryConfigSource.memoryInstanceId,
    memoryConfigSource.memory_instance_id,
  );

  if (!memoryInstanceId) {
    throw new Error('Memory node requires memoryInstanceId');
  }

  const bootUris =
    Array.isArray(memoryConfigSource.bootUris) &&
    memoryConfigSource.bootUris.every((uri) => typeof uri === 'string')
      ? memoryConfigSource.bootUris
      : Array.isArray(memoryConfigSource.boot_uris) &&
          memoryConfigSource.boot_uris.every((uri) => typeof uri === 'string')
        ? memoryConfigSource.boot_uris
        : [];
  const fusionPriority = readOptionalNumber(
    memoryConfigSource.fusionPriority,
    memoryConfigSource.fusion_priority,
  );

  return {
    memoryInstanceId,
    role: memoryConfigSource.role === 'readonly' ? 'readonly' : 'primary',
    bootUris,
    fusionPriority: fusionPriority ?? 0,
    tenantId,
    executionId,
  };
}

export function getSandboxSourceStep(
  nodeId: string,
  edges: ReactFlowEdge[],
  steps: ExecutionStep[],
): ExecutionStep | undefined {
  const incomingEdges = edges.filter((e) => e.target === nodeId);
  for (const edge of incomingEdges) {
    const sourceStep = steps.find((s) => s.nodeId === edge.source);
    if (sourceStep?.nodeType === 'sandbox') {
      return sourceStep;
    }
  }

  return undefined;
}

export function getExecutionSandboxBinding(
  nodeId: string,
  executionId: string,
  edges: ReactFlowEdge[],
  steps: ExecutionStep[],
  input?: Record<string, unknown>,
): { executionId: string; sandboxNodeId: string } | undefined {
  const sourceStep = getSandboxSourceStep(nodeId, edges, steps);
  if (!sourceStep) {
    const sandboxSessionId = readSandboxSessionId(
      input?.['sandbox-in'] ??
        input?.sandbox ??
        input?.['sandbox-out'] ??
        input?.['sandbox-output'],
    );
    if (!sandboxSessionId) {
      return undefined;
    }

    const matchedSandboxStep = steps.find(
      (step) =>
        step.nodeType === 'sandbox' &&
        readSandboxSessionId(step.result) === sandboxSessionId,
    );
    if (!matchedSandboxStep) {
      return undefined;
    }

    return {
      executionId,
      sandboxNodeId: matchedSandboxStep.nodeId,
    };
  }

  return {
    executionId,
    sandboxNodeId: sourceStep.nodeId,
  };
}

export function readSandboxSessionId(value: unknown): string | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  return readFirstString(value.sessionId, value.session_id);
}

export function getSandboxRestoreWorkspaceId(
  sandboxNodeId: string,
  edges: ReactFlowEdge[],
  steps: ExecutionStep[],
): string | undefined {
  const incomingEdges = edges.filter((edge) => edge.target === sandboxNodeId);

  for (const edge of incomingEdges) {
    const sourceStep = steps.find(
      (candidate) => candidate.nodeId === edge.source,
    );
    if (sourceStep?.nodeType !== 'workspace') {
      continue;
    }

    const nodeData = isRecord(sourceStep.nodeData) ? sourceStep.nodeData : {};
    const config = isRecord(nodeData.config) ? nodeData.config : nodeData;
    const workspaceId =
      typeof config.workspaceId === 'string' && config.workspaceId.trim()
        ? config.workspaceId.trim()
        : isRecord(sourceStep.result) &&
            typeof sourceStep.result.workspaceId === 'string' &&
            sourceStep.result.workspaceId.trim()
          ? sourceStep.result.workspaceId.trim()
          : undefined;

    if (workspaceId) {
      return workspaceId;
    }
  }

  return undefined;
}

export function extractConfiguredMcpTools(
  nodeData: Record<string, unknown>,
  enabledToolIds: string[],
): Array<{
  toolName: string;
  mcpToolDefinitionId?: string;
  inputSchema?: Record<string, unknown>;
  portMapping?: Record<string, unknown>;
}> {
  const tools = Array.isArray(nodeData.tools) ? nodeData.tools : [];
  const selectedTools = tools
    .filter((tool) => isRecord(tool))
    .filter((tool) => {
      if (enabledToolIds.length === 0) {
        return true;
      }

      return typeof tool.id === 'string' && enabledToolIds.includes(tool.id);
    })
    .map((tool) => {
      const toolRecord = tool as Record<string, unknown>;
      const toolName = readFirstString(
        toolRecord.toolName,
        toolRecord.name,
        toolRecord.title,
      );
      if (!toolName) {
        return null;
      }

      return {
        toolName,
        ...(typeof toolRecord.id === 'string'
          ? { mcpToolDefinitionId: toolRecord.id }
          : {}),
        ...(isRecord(toolRecord.inputSchema)
          ? { inputSchema: toolRecord.inputSchema }
          : {}),
        ...(isRecord(toolRecord.portMapping)
          ? { portMapping: toolRecord.portMapping }
          : isRecord(toolRecord.portMappingMetadata)
            ? { portMapping: toolRecord.portMappingMetadata }
            : {}),
      };
    })
    .filter(
      (
        tool,
      ): tool is {
        toolName: string;
        mcpToolDefinitionId?: string;
        inputSchema?: Record<string, unknown>;
        portMapping?: Record<string, unknown>;
      } => tool !== null,
    );

  if (selectedTools.length > 0) {
    return selectedTools;
  }

  const fallbackToolName = readFirstString(
    nodeData.toolName,
    nodeData.tool_name,
  );
  if (!fallbackToolName) {
    return [];
  }

  return [
    {
      toolName: fallbackToolName,
      ...(typeof nodeData.mcpToolDefinitionId === 'string'
        ? { mcpToolDefinitionId: nodeData.mcpToolDefinitionId }
        : {}),
      ...(isRecord(nodeData.inputSchema)
        ? { inputSchema: nodeData.inputSchema }
        : {}),
      ...(isRecord(nodeData.portMapping)
        ? { portMapping: nodeData.portMapping }
        : isRecord(nodeData.portMappingMetadata)
          ? { portMapping: nodeData.portMappingMetadata }
          : {}),
    },
  ];
}

export function getUpstreamMemorySessionIds(
  nodeId: string,
  edges: ReactFlowEdge[],
  steps: ExecutionStep[],
): string[] {
  const sessionIds = new Set<string>();
  const incomingEdges = edges.filter((edge) => edge.target === nodeId);

  for (const edge of incomingEdges) {
    const sourceStep = steps.find(
      (candidate) => candidate.nodeId === edge.source,
    );
    if (sourceStep?.nodeType !== 'memory' || !isRecord(sourceStep.result)) {
      continue;
    }

    const { sessionId } = sourceStep.result;
    if (typeof sessionId === 'string' && sessionId.trim()) {
      sessionIds.add(sessionId.trim());
    }
  }

  return [...sessionIds];
}
