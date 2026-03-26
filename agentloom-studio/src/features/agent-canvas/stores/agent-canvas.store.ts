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
import type {
  AgentGlobalSandboxConfig,
  AgentDefinition,
} from '@/features/agent/types';
import type { CanvasNodeData, CanvasEdgeData } from '@/features/canvas/types';
import type { AgentCanvasNodeType } from '@/features/canvas/registry/agent-canvas-registry';
import { AGENT_CANVAS_NODE_REGISTRY } from '@/features/canvas/registry/agent-canvas-registry';

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
      data: Pick<AgentDefinition, 'nodes' | 'edges' | 'viewport' | 'sandboxConfig' | 'workspaceSnapshotId' | 'memoryInstanceIds' | 'version' | 'name'>,
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
};

const DEFAULT_INPUT_SCHEMA: AgentInputSchema = {
  type: 'object',
  properties: {},
  required: [],
};

function createInitialState(): AgentCanvasState {
  return {
    agentId: null,
    agentName: '',
    version: 0,
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

function ensureRequiredNodes(nodes: AgentCanvasNode[]): AgentCanvasNode[] {
  const hasAgentMain = nodes.some((n) => (n.data?.nodeType as string) === 'agent-main');
  if (hasAgentMain) return nodes;

  const agentMainNode = createRequiredNode('agent-main', AGENT_MAIN_DEFAULT_POSITION);
  if (!agentMainNode) return nodes;
  return [...nodes, agentMainNode];
}

function createInitialNodes(): AgentCanvasNode[] {
  const result: AgentCanvasNode[] = [];
  const agentMain = createRequiredNode('agent-main', AGENT_MAIN_DEFAULT_POSITION);
  if (agentMain) result.push(agentMain);
  const sandbox = createRequiredNode('sandbox', SANDBOX_DEFAULT_POSITION);
  if (sandbox) result.push(sandbox);
  return result;
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
              state.edges = applyEdgeChanges(changes, state.edges);
              const isDirtyChange = changes.some(
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
                memoryInstanceIds: agent.memoryInstanceIds,
                version: agent.version,
                name: agent.name,
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
              state.nodes = isNewCanvas
                ? createInitialNodes()
                : ensureRequiredNodes(rawNodes);
              state.edges = (data.edges as AgentCanvasEdge[]) ?? [];
              state.viewport = data.viewport ?? { x: 0, y: 0, zoom: 1 };
              state.globalSandboxConfig = data.sandboxConfig ?? { ...DEFAULT_SANDBOX_CONFIG };
              state.workspaceId = data.workspaceSnapshotId ?? null;
              state.memoryInstanceIds = data.memoryInstanceIds ?? [];
              state.version = data.version ?? 0;
              state.agentName = data.name ?? '';
              state.isDirty = isNewCanvas || rawNodes.length !== state.nodes.length;
              state.lastSavedAt = Date.now();
            });
          },

          saveCanvas: async () => {
            const { agentId, nodes, edges, viewport, globalSandboxConfig, workspaceId, memoryInstanceIds, version } = get();
            if (!agentId) return;

            set((state) => {
              state.isSaving = true;
            });

            try {
              const response = await apiClient
                .put(`agent-definitions/${agentId}/canvas`, {
                  json: {
                    nodes,
                    edges,
                    viewport,
                    sandboxConfig: globalSandboxConfig,
                    workspaceSnapshotId: workspaceId,
                    memoryInstanceIds,
                    version,
                  },
                })
                .json<{ version: number }>();

              set((state) => {
                state.version = response.version;
                state.isDirty = false;
                state.isSaving = false;
                state.lastSavedAt = Date.now();
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
