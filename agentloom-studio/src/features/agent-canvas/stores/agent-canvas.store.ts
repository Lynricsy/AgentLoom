import { enableMapSet } from 'immer';
import type {
  Edge,
  Node,
  NodeChange,
  EdgeChange,
  Viewport,
  Connection,
} from '@xyflow/react';
import { applyNodeChanges, applyEdgeChanges, addEdge } from '@xyflow/react';
import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { devtools, subscribeWithSelector } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { apiClient } from '@/shared/api/client';
import type { ApiResponse } from '@/shared/types/api';
import type {
  AgentGlobalSandboxConfig,
  AgentDefinition,
} from '@/features/agent/types';
import type { AgentRuntimeMode } from '@/features/agent/types';
import type { CanvasNodeData, CanvasEdgeData } from '@/features/canvas/types';
import type { AgentCanvasNodeType } from '@/features/canvas/registry/agent-canvas-registry';
import { AGENT_CANVAS_NODE_REGISTRY } from '@/features/canvas/registry/agent-canvas-registry';
import { arePortDataTypesCompatible } from '@/features/canvas/lib/connectionCompatibility';
import { clonePortDefinitions } from '@/features/canvas/types/nodeTypeRegistry';

enableMapSet();

type AgentCanvasNode = Node<CanvasNodeData>;
type AgentCanvasEdge = Edge<CanvasEdgeData>;

export interface AgentInputSchema {
  type: 'object';
  properties: Record<
    string,
    {
      type: string;
      description?: string;
      default?: unknown;
    }
  >;
  required?: string[];
}

interface AgentCanvasState {
  agentId: string | null;
  agentName: string;
  version: number;
  runtimeMode: AgentRuntimeMode;

  nodes: AgentCanvasNode[];
  edges: AgentCanvasEdge[];
  viewport: Viewport;
  selectedNodeId: string | null;
  selectedEdgeId: string | null;

  globalSandboxConfig: AgentGlobalSandboxConfig;
  inputSchema: AgentInputSchema;
  workspaceId: string | null;
  sandboxLifecycle: 'session' | 'persistent';
  memoryInstanceIds: string[];

  isDirty: boolean;
  isSaving: boolean;
  isCompiling: boolean;
  lastSavedAt: number | null;
}

interface AgentCanvasActions {
  actions: {
    onNodesChange: (changes: NodeChange<AgentCanvasNode>[]) => void;
    onEdgesChange: (changes: EdgeChange<AgentCanvasEdge>[]) => void;
    createConnection: (connection: Connection) => void;
    addNode: (node: AgentCanvasNode) => void;
    deleteSelectedNode: () => void;
    selectNode: (nodeId: string | null) => void;
    selectEdge: (edgeId: string | null) => void;
    updateNodeData: (nodeId: string, data: Partial<CanvasNodeData>) => void;
    setViewport: (viewport: Viewport) => void;

    setGlobalSandboxConfig: (
      config: Partial<AgentGlobalSandboxConfig>,
    ) => void;
    setSandboxLifecycle: (lifecycle: 'session' | 'persistent') => void;
    setInputSchema: (schema: AgentInputSchema) => void;
    setWorkspaceId: (workspaceId: string | null) => void;
    setMemoryInstanceIds: (ids: string[]) => void;

    loadAgent: (agentId: string) => Promise<void>;
    applyServerSnapshot: (
      data: Pick<AgentDefinition, 'nodes' | 'edges' | 'viewport' | 'sandboxConfig' | 'workspaceSnapshotId' | 'inputSchema' | 'memoryInstanceIds' | 'sandboxLifecycle' | 'version' | 'name' | 'runtimeMode'>,
    ) => void;
    saveCanvas: () => Promise<void>;
    compileConfig: () => Promise<void>;
    markSaved: () => void;
    reset: () => void;
  };
}

const DEFAULT_SANDBOX_CONFIG: AgentGlobalSandboxConfig = {
  enabled: true,
  cpuLimit: 1,
  memoryLimitMb: 512,
  timeoutSeconds: 300,
  lifecycleMode: 'session',
};

const DEFAULT_INPUT_SCHEMA: AgentInputSchema = {
  type: 'object',
  properties: {},
  required: [],
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeInputSchema(
  inputSchema: AgentDefinition['inputSchema'],
): AgentInputSchema {
  if (
    !inputSchema ||
    typeof inputSchema !== 'object' ||
    Array.isArray(inputSchema)
  ) {
    return { ...DEFAULT_INPUT_SCHEMA };
  }

  const properties =
    inputSchema.properties &&
    typeof inputSchema.properties === 'object' &&
    !Array.isArray(inputSchema.properties)
      ? inputSchema.properties
      : {};

  return {
    type: inputSchema.type === 'object' ? 'object' : 'object',
    properties: properties as AgentInputSchema['properties'],
    required: Array.isArray(inputSchema.required)
      ? inputSchema.required.filter(
          (value): value is string => typeof value === 'string',
        )
      : [],
  };
}

function normalizeWorkspaceSnapshotId(
  workspaceId: string | null,
): string | null | undefined {
  if (workspaceId === null) {
    return null;
  }

  return UUID_PATTERN.test(workspaceId) ? workspaceId : undefined;
}

function createInitialState(): AgentCanvasState {
  return {
    agentId: null,
    agentName: '',
    version: 0,
    runtimeMode: 'sandbox',
    nodes: [],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 },
    selectedNodeId: null,
    selectedEdgeId: null,
    globalSandboxConfig: { ...DEFAULT_SANDBOX_CONFIG },
    inputSchema: { ...DEFAULT_INPUT_SCHEMA },
    workspaceId: null,
    sandboxLifecycle: 'session',
    memoryInstanceIds: [],
    isDirty: false,
    isSaving: false,
    isCompiling: false,
    lastSavedAt: null,
  };
}

function createEdgeId(): string {
  return crypto?.randomUUID?.() ?? `edge-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function generateNodeId(): string {
  return crypto?.randomUUID?.() ?? `node-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function createRequiredNode(
  nodeType: AgentCanvasNodeType,
  position: { x: number; y: number },
): AgentCanvasNode | null {
  const config = AGENT_CANVAS_NODE_REGISTRY.get(nodeType);
  if (!config) return null;
  return {
    id: generateNodeId(),
    type: config.category,
    position,
    data: {
      label: config.label,
      nodeType: nodeType as CanvasNodeData['nodeType'],
      category: config.category,
      description: config.description,
      config: {},
      inputPorts: config.inputPorts ? [...config.inputPorts] : [],
      outputPorts: config.outputPorts ? [...config.outputPorts] : [],
    },
  };
}

const AGENT_MAIN_DEFAULT_POSITION = { x: 400, y: 300 };
const SANDBOX_DEFAULT_POSITION = { x: 600, y: 300 };
const PORT_STATEFUL_AGENT_NODE_TYPES = new Set<AgentCanvasNodeType>(['smart-routing']);
const NO_SANDBOX_NODE_TYPES = new Set<AgentCanvasNodeType>(['sandbox', 'workspace']);

function buildAgentMainInputPorts(
  runtimeMode: AgentRuntimeMode,
) {
  const config = AGENT_CANVAS_NODE_REGISTRY.get('agent-main')
  const inputPorts = config ? clonePortDefinitions(config.inputPorts) : []
  return runtimeMode === 'no_sandbox'
    ? inputPorts.filter((port) => port.id !== 'sandbox-in')
    : inputPorts
}

function sanitizeNodesForRuntimeMode(
  nodes: AgentCanvasNode[],
  runtimeMode: AgentRuntimeMode,
): AgentCanvasNode[] {
  return nodes
    .filter((node) => {
      const nodeType = node.data?.nodeType as AgentCanvasNodeType | undefined
      return runtimeMode === 'sandbox'
        ? true
        : !nodeType || !NO_SANDBOX_NODE_TYPES.has(nodeType)
    })
    .map((node) => {
      if (node.type !== 'agent-main') {
        return node
      }

      return {
        ...node,
        data: {
          ...node.data,
          inputPorts: buildAgentMainInputPorts(runtimeMode),
        },
      }
    })
}

function sanitizeEdgesForRuntimeMode(
  nodes: AgentCanvasNode[],
  edges: AgentCanvasEdge[],
  runtimeMode: AgentRuntimeMode,
): AgentCanvasEdge[] {
  const nodeIds = new Set(nodes.map((node) => node.id))
  return edges.filter((edge) => {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
      return false
    }

    return !(
      runtimeMode === 'no_sandbox'
      && edge.targetHandle === 'sandbox-in'
    )
  })
}

function normalizePersistedNode(node: AgentCanvasNode): AgentCanvasNode {
  const nodeType = node.data?.nodeType as AgentCanvasNodeType | undefined;
  if (!nodeType) {
    return node;
  }

  const config = AGENT_CANVAS_NODE_REGISTRY.get(nodeType);
  if (!config) {
    return node;
  }

  const shouldPreserveStoredPorts = PORT_STATEFUL_AGENT_NODE_TYPES.has(nodeType);
  const nextInputPorts =
    shouldPreserveStoredPorts && node.data.inputPorts.length > 0
      ? node.data.inputPorts
      : clonePortDefinitions(config.inputPorts);
  const nextOutputPorts =
    shouldPreserveStoredPorts && node.data.outputPorts.length > 0
      ? node.data.outputPorts
      : clonePortDefinitions(config.outputPorts);

  return {
    ...node,
    type: config.category,
    data: {
      ...node.data,
      label: node.data.label || config.label,
      category: config.category,
      description: node.data.description || config.description,
      inputPorts: nextInputPorts,
      outputPorts: nextOutputPorts,
    },
  };
}

function normalizePersistedNodes(nodes: AgentCanvasNode[]): AgentCanvasNode[] {
  return nodes.map(normalizePersistedNode);
}

function ensureRequiredNodes(
  nodes: AgentCanvasNode[],
  runtimeMode: AgentRuntimeMode,
): AgentCanvasNode[] {
  const hasAgentMain = nodes.some((node) => node.type === 'agent-main')
  if (hasAgentMain) return nodes;

  const agentMainNode = createRequiredNode('agent-main', AGENT_MAIN_DEFAULT_POSITION);
  if (!agentMainNode) return nodes;
  return sanitizeNodesForRuntimeMode([...nodes, agentMainNode], runtimeMode);
}

function createInitialNodes(
  runtimeMode: AgentRuntimeMode,
): AgentCanvasNode[] {
  const result: AgentCanvasNode[] = [];
  const agentMain = createRequiredNode('agent-main', AGENT_MAIN_DEFAULT_POSITION);
  if (agentMain) result.push(agentMain);
  if (runtimeMode === 'sandbox') {
    const sandbox = createRequiredNode('sandbox', SANDBOX_DEFAULT_POSITION);
    if (sandbox) result.push(sandbox);
  }
  return sanitizeNodesForRuntimeMode(result, runtimeMode);
}

export function canAddNodeType(
  nodeType: string,
  currentNodes: AgentCanvasNode[],
): boolean {
  const config = AGENT_CANVAS_NODE_REGISTRY.get(nodeType);
  if (!config?.maxInstances) return true;
  const count = currentNodes.filter(
    (n) => n.data?.nodeType === nodeType,
  ).length;
  return count < config.maxInstances;
}

export const useAgentCanvasStore = create<AgentCanvasState & AgentCanvasActions>()(
  devtools(
    subscribeWithSelector(
      immer((set, get) => ({
        ...createInitialState(),

        actions: {
          onNodesChange: (changes) => {
            set((state) => {
              state.nodes = applyNodeChanges(changes, state.nodes);
              // 仅对实质修改标脏：新增/删除/拖拽结束，排除 dimension/select 等内部事件
              const isDirtyChange = changes.some(
                (c) =>
                  c.type === 'remove' ||
                  c.type === 'add' ||
                  (c.type === 'position' && c.dragging === false),
              );
              if (isDirtyChange) {
                state.isDirty = true;
              }
            });
          },

          onEdgesChange: (changes) => {
            set((state) => {
              // 拦截不兼容端口类型的 add 变更
              const filteredChanges = changes.filter((c) => {
                if (c.type !== 'add') return true;
                const edge = c.item;
                const sourceNode = state.nodes.find((n) => n.id === edge.source);
                const targetNode = state.nodes.find((n) => n.id === edge.target);
                if (!sourceNode || !targetNode) return true;
                const sourcePort = sourceNode.data.outputPorts.find(
                  (p) => p.id === edge.sourceHandle,
                );
                const targetPort = targetNode.data.inputPorts.find(
                  (p) => p.id === edge.targetHandle,
                );
                if (!sourcePort || !targetPort) return true;
                return arePortDataTypesCompatible(sourcePort.dataType, targetPort.dataType);
              });

              state.edges = applyEdgeChanges(filteredChanges, state.edges);
              const isDirtyChange = filteredChanges.some(
                (c) => c.type === 'remove' || c.type === 'add',
              );
              if (isDirtyChange) {
                state.isDirty = true;
              }
            });
          },

          createConnection: (connection) => {
            const currentState = get();
            const sourceNode = currentState.nodes.find((n) => n.id === connection.source);
            const targetNode = currentState.nodes.find((n) => n.id === connection.target);

            // 端口类型兼容性检查
            if (sourceNode && targetNode) {
              const sourcePort = sourceNode.data.outputPorts.find(
                (p) => p.id === connection.sourceHandle,
              );
              const targetPort = targetNode.data.inputPorts.find(
                (p) => p.id === connection.targetHandle,
              );
              if (
                sourcePort
                && targetPort
                && !arePortDataTypesCompatible(sourcePort.dataType, targetPort.dataType)
              ) {
                return;
              }
            }

            const sourceNodeType = sourceNode?.data?.nodeType as string | undefined;
            const targetNodeType = targetNode?.data?.nodeType as string | undefined;

            if (
              sourceNodeType === 'sub-agent' &&
              targetNodeType === 'agent-main' &&
              currentState.agentId
            ) {
              const subAgentDefId = (sourceNode?.data?.config as Record<string, unknown> | undefined)?.agentDefinitionId;
              if (subAgentDefId && subAgentDefId === currentState.agentId) {
                console.warn('[AgentCanvasStore] 阻止循环引用: sub-agent 引用了当前 Agent 自身');
                return;
              }
            }

            set((state) => {
              const newEdge: AgentCanvasEdge = {
                ...connection,
                id: createEdgeId(),
                type: 'smart',
                source: connection.source,
                target: connection.target,
                sourceHandle: connection.sourceHandle ?? undefined,
                targetHandle: connection.targetHandle ?? undefined,
              };
              state.edges = addEdge(newEdge, state.edges);
              state.isDirty = true;
            });
          },

          addNode: (node) => {
            set((state) => {
              const nodeType = node.data?.nodeType;
              if (nodeType && !canAddNodeType(nodeType, state.nodes)) {
                return;
              }
              state.nodes.push(node);
              state.isDirty = true;
            });
          },

          deleteSelectedNode: () => {
            set((state) => {
              if (!state.selectedNodeId) return;
              const nodeId = state.selectedNodeId;
              state.nodes = state.nodes.filter((n) => n.id !== nodeId);
              state.edges = state.edges.filter(
                (e) => e.source !== nodeId && e.target !== nodeId,
              );
              state.selectedNodeId = null;
              state.isDirty = true;
            });
          },

          selectNode: (nodeId) => {
            set((state) => {
              state.selectedNodeId = nodeId;
              state.selectedEdgeId = null;
            });
          },

          selectEdge: (edgeId) => {
            set((state) => {
              state.selectedEdgeId = edgeId;
              state.selectedNodeId = null;
            });
          },

          updateNodeData: (nodeId, data) => {
            set((state) => {
              const node = state.nodes.find((n) => n.id === nodeId);
              if (node) {
                Object.assign(node.data, data);
                state.isDirty = true;
              }
            });
          },

          setViewport: (viewport) => {
            set((state) => {
              state.viewport = viewport;
            });
          },

          setGlobalSandboxConfig: (config) => {
            set((state) => {
              Object.assign(state.globalSandboxConfig, config);
              state.isDirty = true;
            });
          },

          setSandboxLifecycle: (lifecycle) => {
            set((state) => {
              state.sandboxLifecycle = lifecycle;
              state.globalSandboxConfig.lifecycleMode = lifecycle;
              state.isDirty = true;
            });
          },

          setInputSchema: (schema) => {
            set((state) => {
              state.inputSchema = schema;
              state.isDirty = true;
            });
          },

          setWorkspaceId: (workspaceId) => {
            set((state) => {
              state.workspaceId = workspaceId;
              state.isDirty = true;
            });
          },

          setMemoryInstanceIds: (ids) => {
            set((state) => {
              state.memoryInstanceIds = ids;
              state.isDirty = true;
            });
          },

          loadAgent: async (agentId) => {
            try {
              const response = await apiClient
                .get(`agent-definitions/${agentId}`)
                .json<ApiResponse<AgentDefinition>>();
              const agent = response.data;
              get().actions.applyServerSnapshot({
                nodes: agent.nodes,
                edges: agent.edges,
                viewport: agent.viewport,
                sandboxConfig: agent.sandboxConfig,
                workspaceSnapshotId: agent.workspaceSnapshotId,
                inputSchema: agent.inputSchema,
                memoryInstanceIds: agent.memoryInstanceIds,
                sandboxLifecycle: agent.sandboxLifecycle,
                version: agent.version,
                name: agent.name,
                runtimeMode: agent.runtimeMode,
              });
              set((state) => {
                state.agentId = agentId;
              });
            } catch (error) {
              console.error('[AgentCanvasStore] 加载 Agent 失败:', error);
              throw error;
            }
          },

          applyServerSnapshot: (data) => {
            set((state) => {
              const rawNodes = (data.nodes as AgentCanvasNode[]) ?? [];
              const isNewCanvas = rawNodes.length === 0;
              const runtimeMode = data.runtimeMode ?? 'sandbox';
              const normalizedNodes = sanitizeNodesForRuntimeMode(
                normalizePersistedNodes(rawNodes),
                runtimeMode,
              );
              const ensuredNodes = isNewCanvas
                ? createInitialNodes(runtimeMode)
                : ensureRequiredNodes(normalizedNodes, runtimeMode);
              state.nodes = isNewCanvas
                ? createInitialNodes(runtimeMode)
                : ensuredNodes;
              state.edges = sanitizeEdgesForRuntimeMode(
                state.nodes,
                (data.edges as AgentCanvasEdge[]) ?? [],
                runtimeMode,
              );
              state.viewport = data.viewport ?? { x: 0, y: 0, zoom: 1 };
              state.globalSandboxConfig = {
                ...DEFAULT_SANDBOX_CONFIG,
                ...(data.sandboxConfig ?? {}),
              };
              state.inputSchema = normalizeInputSchema(data.inputSchema);
              state.workspaceId =
                runtimeMode === 'sandbox' ? (data.workspaceSnapshotId ?? null) : null;
              state.memoryInstanceIds = data.memoryInstanceIds ?? [];
              state.sandboxLifecycle =
                runtimeMode === 'sandbox'
                  ? (
                      data.sandboxLifecycle ??
                      data.sandboxConfig?.lifecycleMode ??
                      'session'
                    )
                  : 'session';
              state.version = data.version ?? 0;
              state.agentName = data.name ?? '';
              state.runtimeMode = runtimeMode;
              state.isDirty = isNewCanvas || rawNodes.length !== state.nodes.length;
              state.lastSavedAt = Date.now();
            });
          },

          saveCanvas: async () => {
            const {
              agentId,
              nodes,
              edges,
              viewport,
              globalSandboxConfig,
              runtimeMode,
              inputSchema,
              memoryInstanceIds,
              sandboxLifecycle,
              workspaceId,
            } = get();
            if (!agentId) return;

            const workspaceSnapshotId = normalizeWorkspaceSnapshotId(workspaceId);

            set((state) => {
              state.isSaving = true;
            });

            try {
              const response = await apiClient
                .put(`agent-definitions/${agentId}/canvas`, {
                  json: {
                    canvasNodes: nodes,
                    canvasEdges: edges,
                    canvasViewport: viewport,
                    inputSchema,
                    memoryInstanceIds,
                    ...(runtimeMode === 'sandbox'
                      ? {
                          globalSandboxConfig,
                          sandboxLifecycle,
                          ...(workspaceSnapshotId === undefined
                            ? {}
                            : { workspaceSnapshotId }),
                        }
                      : { workspaceSnapshotId: null }),
                  },
                })
                .json<ApiResponse<Pick<AgentDefinition, 'version'>>>();

              set((state) => {
                state.version = response.data.version;
                state.isDirty = false;
                state.isSaving = false;
                state.lastSavedAt = Date.now();
              });

              // 保存成功后自动编译（不阻塞保存流程）
              get().actions.compileConfig().catch((compileError) => {
                console.warn('[AgentCanvasStore] 自动编译失败（保存已成功）:', compileError);
              });
            } catch (error) {
              set((state) => {
                state.isSaving = false;
              });
              console.error('[AgentCanvasStore] 保存画布失败:', error);
              throw error;
            }
          },

          compileConfig: async () => {
            const { agentId } = get();
            if (!agentId) return;

            set((state) => {
              state.isCompiling = true;
            });

            try {
              await apiClient
                .post(`agent-definitions/${agentId}/compile`, { json: {} })
                .json();

              set((state) => {
                state.isCompiling = false;
              });
            } catch (error) {
              set((state) => {
                state.isCompiling = false;
              });
              console.error('[AgentCanvasStore] 编译配置失败:', error);
              throw error;
            }
          },

          markSaved: () => {
            set((state) => {
              state.isDirty = false;
              state.lastSavedAt = Date.now();
            });
          },

          reset: () => {
            set((state) => {
              Object.assign(state, createInitialState());
            });
          },
        },
      })),
    ),
    { name: 'AgentCanvasStore' },
  ),
);

export const useAgentCanvasNodes = () =>
  useAgentCanvasStore((s) => s.nodes);

export const useAgentCanvasEdges = () =>
  useAgentCanvasStore((s) => s.edges);

export const useAgentCanvasActions = () =>
  useAgentCanvasStore((s) => s.actions);

export const useAgentCanvasSelectedNodeId = () =>
  useAgentCanvasStore((s) => s.selectedNodeId);

export const useAgentCanvasRuntimeMode = () =>
  useAgentCanvasStore((s) => s.runtimeMode);

export const useAgentCanvasSaveStatus = () =>
  useAgentCanvasStore(
    useShallow((s) => ({
      isDirty: s.isDirty,
      isSaving: s.isSaving,
      lastSavedAt: s.lastSavedAt,
    })),
  );

export const useAgentGlobalSandboxConfig = () =>
  useAgentCanvasStore((s) => s.globalSandboxConfig);

export const useAgentSandboxLifecycle = () =>
  useAgentCanvasStore((s) => s.sandboxLifecycle);

export const useAgentInputSchema = () =>
  useAgentCanvasStore((s) => s.inputSchema);

export const useAgentWorkspaceId = () =>
  useAgentCanvasStore((s) => s.workspaceId);

export const useAgentMemoryInstanceIds = () =>
  useAgentCanvasStore((s) => s.memoryInstanceIds);

export type { AgentCanvasNode, AgentCanvasEdge, AgentCanvasNodeType };
