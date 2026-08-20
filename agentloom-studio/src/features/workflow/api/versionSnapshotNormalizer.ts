import type { CanvasNode } from "@/features/canvas";
import {
  getNodeTypeConfigOrNull,
  getWorkflowAgentInputPorts,
} from "@/features/canvas";
import {
  clonePortDefinitions,
  hydratePortDefinitions,
} from "@/features/canvas";
import type { AgentRuntimeMode } from "@/features/agent";

import type { WorkflowVersion, WorkflowVersionSnapshot } from "../types";

function readRuntimeMode(node: CanvasNode): AgentRuntimeMode | null {
  const rawValue =
    typeof node.data?.agentRuntimeMode === "string"
      ? node.data.agentRuntimeMode
      : typeof node.data?.config?.runtimeMode === "string"
        ? node.data.config.runtimeMode
        : null;

  return rawValue === "no_sandbox" || rawValue === "sandbox" ? rawValue : null;
}

function normalizeVersionNode(node: CanvasNode): CanvasNode {
  const nodeType =
    typeof node.data?.nodeType === "string" ? node.data.nodeType : "";
  const typeConfig = nodeType ? getNodeTypeConfigOrNull(nodeType) : null;
  const runtimeMode = nodeType === "agent" ? readRuntimeMode(node) : null;
  const defaultInputPorts =
    nodeType === "agent"
      ? getWorkflowAgentInputPorts(runtimeMode)
      : typeConfig
        ? clonePortDefinitions(typeConfig.inputPorts)
        : [];
  const defaultOutputPorts = typeConfig
    ? clonePortDefinitions(typeConfig.outputPorts)
    : [];

  const inputPorts = mergeHydratedPorts(
    node.data?.inputPorts,
    defaultInputPorts,
  );
  const outputPorts = mergeHydratedPorts(
    node.data?.outputPorts,
    defaultOutputPorts,
  );

  return {
    ...node,
    data: {
      ...node.data,
      inputPorts,
      outputPorts,
    },
  };
}

function mergeHydratedPorts(
  ports: CanvasNode["data"]["inputPorts"] | CanvasNode["data"]["outputPorts"],
  defaultPorts: ReturnType<typeof clonePortDefinitions>,
) {
  if (!Array.isArray(ports)) {
    return defaultPorts;
  }

  const hydratedPorts = hydratePortDefinitions(ports, defaultPorts);
  if (defaultPorts.length === 0) {
    return hydratedPorts;
  }

  const hydratedById = new Map(hydratedPorts.map((port) => [port.id, port]));
  const defaultPortIds = new Set(defaultPorts.map((port) => port.id));

  return [
    ...defaultPorts.map((port) => hydratedById.get(port.id) ?? port),
    ...hydratedPorts.filter((port) => !defaultPortIds.has(port.id)),
  ];
}

export function normalizeWorkflowVersionSnapshot(
  snapshot: WorkflowVersionSnapshot,
): WorkflowVersionSnapshot {
  return {
    ...snapshot,
    nodes: Array.isArray(snapshot.nodes)
      ? snapshot.nodes.map((node) => normalizeVersionNode(node))
      : [],
  };
}

export function normalizeWorkflowVersion(
  version: WorkflowVersion,
): WorkflowVersion {
  return {
    ...version,
    snapshot: normalizeWorkflowVersionSnapshot(version.snapshot),
  };
}
