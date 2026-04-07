import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AddNodeInput, CanvasEdge, CanvasNode } from '../types'
import { createDefaultAgentNodeData, createDefaultEdgeData } from '../types'
import { clonePortDefinitions, getNodeTypeConfig } from '../types/nodeTypeRegistry'
import type { TypeEngineCompatibilityResult, TypeEngineServiceLike } from '../lib/typeEngine/contracts'
import { setTypeEngineServiceForTesting } from '../lib/typeEngine/service'
import { buildCompoundChildExtent } from '../lib/compoundLayout'
import { useCanvasStore } from './canvasStore'

const evaluateCompatibilityMock = vi.fn()
const getCachedCompatibilityMock = vi.fn()

const mockTypeEngineService: TypeEngineServiceLike = {
  warmup: vi.fn(async () => undefined),
  getCachedCompatibility: (sourcePort, targetPort) => getCachedCompatibilityMock(sourcePort, targetPort),
  evaluateCompatibility: (sourcePort, targetPort, context) => evaluateCompatibilityMock(sourcePort, targetPort, context),
  getRuntimeState: () => ({
    wasmReady: true,
    workerBusy: false,
    lastError: null,
  }),
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve()
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve
    reject = promiseReject
  })

  return {
    promise,
    resolve,
    reject,
  }
}

const mockAddNodeInput: AddNodeInput = {
  id: 'node-1',
  nodeType: 'chat-agent',
  category: 'agent',
  position: { x: 100, y: 200 },
  label: 'Test Agent',
}

const customInputPorts = [
  {
    id: 'custom-input',
    label: 'Custom Input',
    direction: 'input' as const,
    dataType: 'text' as const,
    required: false,
    multiple: false,
    maxConnections: 1,
    schema: {
      kind: 'text' as const,
      title: 'Custom Input',
    },
  },
]

const customOutputPorts = [
  {
    id: 'custom-output',
    label: 'Custom Output',
    direction: 'output' as const,
    dataType: 'json' as const,
    required: false,
    multiple: false,
    maxConnections: 1,
    schema: {
      kind: 'json' as const,
      shape: 'object' as const,
      title: 'Custom Output',
      properties: {},
      additionalProperties: true,
    },
  },
]

function createNode(overrides: Partial<CanvasNode> = {}): CanvasNode {
  return {
    id: 'node-1',
    type: 'agent',
    position: { x: 0, y: 0 },
    data: {
      label: 'Server Node',
      nodeType: 'chat-agent',
      category: 'agent',
      description: '来自服务端',
      config: {},
      inputPorts: [],
      outputPorts: [],
    },
    ...overrides,
  }
}

describe('canvasStore', () => {
  beforeEach(() => {
    useCanvasStore.getState().actions.reset()
    evaluateCompatibilityMock.mockReset()
    getCachedCompatibilityMock.mockReset()
    setTypeEngineServiceForTesting(mockTypeEngineService)
  })

  it('injects registry defaults when adding nodes', () => {
    useCanvasStore.getState().actions.addNode(mockAddNodeInput)

    const state = useCanvasStore.getState()
    const node = state.nodes[0]

    if (!node) {
      throw new Error('Expected added node to exist')
    }

    expect(state.nodes).toHaveLength(1)
    expect(node.data.inputPorts).toHaveLength(3)
    expect(node.data.outputPorts).toHaveLength(3)
    expect(node.data.config).toEqual({})
    expect(state.isDirty).toBe(true)
  })

  it('applyServerSnapshot 会给缺少 exec 端口的静态节点补回执行句柄', () => {
    const agentConfig = getNodeTypeConfig('agent')
    const legacyAgentNode = createNode({
      data: {
        label: 'Legacy Agent',
        nodeType: 'agent',
        category: 'agent',
        description: '旧快照里没有 exec 端口',
        config: {},
        inputPorts: clonePortDefinitions(agentConfig.inputPorts.filter((port) => port.id !== 'exec-in')),
        outputPorts: clonePortDefinitions(agentConfig.outputPorts.filter((port) => port.id !== 'exec-out')),
      },
    })

    useCanvasStore.getState().actions.applyServerSnapshot({
      workflowId: 'workflow-1',
      nodes: [legacyAgentNode],
      edges: [],
      viewport: undefined,
      version: 1,
    })

    const hydratedNode = useCanvasStore.getState().nodes[0]
    if (!hydratedNode) {
      throw new Error('Expected hydrated node to exist')
    }

    expect(hydratedNode.data.inputPorts.map((port) => port.id)).toContain('exec-in')
    expect(hydratedNode.data.outputPorts.map((port) => port.id)).toContain('exec-out')
    expect(hydratedNode.data.inputPorts[0]?.id).toBe('exec-in')
    expect(hydratedNode.data.outputPorts[0]?.id).toBe('exec-out')
  })

  it('applyServerSnapshot 会修复只有端口 id 的脏快照端口定义', () => {
    const brokenHttpNode = createNode({
      type: 'tool',
      data: {
        label: 'Broken HTTP',
        nodeType: 'http-tool',
        category: 'tool',
        description: '端口定义被外部 API 直改过',
        config: {},
        inputPorts: [{ id: 'exec-in' }, { id: 'request-in' }] as unknown as CanvasNode['data']['inputPorts'],
        outputPorts: [{ id: 'exec-out' }, { id: 'response-out' }] as unknown as CanvasNode['data']['outputPorts'],
      },
    })

    useCanvasStore.getState().actions.applyServerSnapshot({
      workflowId: 'workflow-1',
      nodes: [brokenHttpNode],
      edges: [],
      viewport: undefined,
      version: 2,
    })

    const hydratedNode = useCanvasStore.getState().nodes[0]
    if (!hydratedNode) {
      throw new Error('Expected hydrated node to exist')
    }

    expect(hydratedNode.data.inputPorts).toMatchObject([
      {
        id: 'exec-in',
        direction: 'input',
        dataType: 'exec',
        schema: {
          kind: 'exec',
        },
      },
      {
        id: 'request-in',
        direction: 'input',
        dataType: 'json',
        schema: {
          kind: 'json',
          shape: 'object',
        },
      },
    ])
    expect(hydratedNode.data.outputPorts).toMatchObject([
      {
        id: 'exec-out',
        direction: 'output',
        dataType: 'exec',
        schema: {
          kind: 'exec',
        },
      },
      {
        id: 'response-out',
        direction: 'output',
        dataType: 'json',
        schema: {
          kind: 'json',
          shape: 'object',
        },
      },
    ])
  })

  it('applyServerSnapshot 会把 root-level text 节点内容回填到 config.text', () => {
    const textNode = createNode({
      type: 'output',
      data: {
        label: 'SelfEvo Text',
        nodeType: 'text',
        category: 'output',
        description: '由自进化直接写入的 text 节点',
        text: 'SELF_TEXT_OK_20260408',
        inputPorts: [],
        outputPorts: [{ id: 'text-out' }] as unknown as CanvasNode['data']['outputPorts'],
      } as unknown as CanvasNode['data'],
    })

    useCanvasStore.getState().actions.applyServerSnapshot({
      workflowId: 'workflow-1',
      nodes: [textNode],
      edges: [],
      viewport: undefined,
      version: 3,
    })

    const hydratedNode = useCanvasStore.getState().nodes[0]
    if (!hydratedNode) {
      throw new Error('Expected hydrated text node to exist')
    }

    expect(hydratedNode.data.config).toEqual({
      text: 'SELF_TEXT_OK_20260408',
    })
  })

  it('stores reusable-block metadata when adding block nodes', () => {
    const blockDefinition = {
      nodes: [createNode({ id: 'inner-1' })],
      edges: [],
      inputPorts: [
        {
          id: 'derived-input-1',
          label: '输入上下文',
          dataType: 'json' as const,
          sourceNodeId: 'inner-1',
          sourcePortId: 'context',
        },
      ],
      outputPorts: [
        {
          id: 'derived-output-1',
          label: '结构化结果',
          dataType: 'json' as const,
          sourceNodeId: 'inner-1',
          sourcePortId: 'result',
        },
      ],
    }

    useCanvasStore.getState().actions.addNode({
      id: 'block-node-1',
      nodeType: 'reusable-block',
      category: 'control',
      position: { x: 240, y: 180 },
      label: '复用分析块',
      blockId: 'block-def-1',
      blockName: '复用分析块',
      blockDefinition,
      isExpanded: true,
      inputPorts: clonePortDefinitions(customInputPorts),
      outputPorts: clonePortDefinitions(customOutputPorts),
    })

    const node = useCanvasStore.getState().nodes[0]

    expect(node).toMatchObject({
      id: 'block-node-1',
      type: 'control',
      data: {
        label: '复用分析块',
        nodeType: 'reusable-block',
        category: 'control',
        blockId: 'block-def-1',
        blockName: '复用分析块',
        blockDefinition,
        isExpanded: true,
      },
    })
    expect(node?.data.inputPorts[0]?.id).toBe('custom-input')
    expect(node?.data.outputPorts[0]?.id).toBe('custom-output')
  })

  it('stores plugin metadata when adding plugin nodes', () => {
    useCanvasStore.getState().actions.addNode({
      id: 'plugin-node-1',
      nodeType: 'plugin',
      category: 'plugin',
      position: { x: 180, y: 220 },
      label: 'Text to Uppercase QA',
      description: '插件节点',
      pluginId: 'com.example.uppercase',
      pluginName: 'Uppercase Plugin',
      pluginVersion: '1.0.1',
      pluginNodeType: 'uppercase-node',
      pluginConfigSchema: {
        type: 'object',
        properties: {
          prefix: {
            type: 'string',
            title: '前缀',
          },
        },
        required: [],
      },
      inputPorts: clonePortDefinitions(customInputPorts),
      outputPorts: clonePortDefinitions(customOutputPorts),
    })

    const node = useCanvasStore.getState().nodes[0]

    expect(node).toMatchObject({
      id: 'plugin-node-1',
      type: 'plugin',
      data: {
        label: 'Text to Uppercase QA',
        nodeType: 'plugin',
        category: 'plugin',
        pluginId: 'com.example.uppercase',
        pluginName: 'Uppercase Plugin',
        pluginVersion: '1.0.1',
        pluginNodeType: 'uppercase-node',
        pluginConfigSchema: {
          type: 'object',
        },
        pluginConfig: {},
      },
    })
    expect(node?.data.inputPorts[0]?.id).toBe('custom-input')
    expect(node?.data.outputPorts[0]?.id).toBe('custom-output')
  })

  it('applyServerSnapshot 会把 compound 子节点重新夹回内框并补足父容器尺寸', () => {
    const loopConfig = getNodeTypeConfig('loop')
    const loopStartConfig = getNodeTypeConfig('loop-start')
    const chatAgentConfig = getNodeTypeConfig('chat-agent')

    useCanvasStore.getState().actions.applyServerSnapshot({
      workflowId: 'wf-1',
      version: 1,
      viewport: { x: 0, y: 0, zoom: 1 },
      nodes: [
        {
          id: 'loop-1',
          type: 'control',
          position: { x: 120, y: 80 },
          style: { width: 540, height: 360 },
          data: {
            label: 'Loop',
            nodeType: 'loop',
            category: 'control',
            description: '循环 compound 容器',
            config: {
              isCollapsed: false,
              outputMode: 'last',
              defaultState: null,
            },
            inputPorts: clonePortDefinitions(loopConfig.inputPorts),
            outputPorts: clonePortDefinitions(loopConfig.outputPorts),
          },
        },
        {
          id: 'loop-start-1',
          type: 'control',
          parentId: 'loop-1',
          extent: 'parent',
          position: { x: 0, y: 0 },
          data: {
            label: 'Loop Start',
            nodeType: 'loop-start',
            category: 'control',
            description: '循环子图入口节点',
            config: {},
            inputPorts: clonePortDefinitions(loopStartConfig.inputPorts),
            outputPorts: clonePortDefinitions(loopStartConfig.outputPorts),
          },
        },
        {
          id: 'agent-1',
          type: 'agent',
          parentId: 'loop-1',
          extent: 'parent',
          position: { x: 0, y: 0 },
          data: {
            label: 'Chat Agent',
            nodeType: 'chat-agent',
            category: 'agent',
            description: '对话型 Agent 节点',
            config: {},
            inputPorts: clonePortDefinitions(chatAgentConfig.inputPorts),
            outputPorts: clonePortDefinitions(chatAgentConfig.outputPorts),
            ...createDefaultAgentNodeData(),
          },
        },
      ],
      edges: [],
    })

    const state = useCanvasStore.getState()
    const loopNode = state.nodes.find((node) => node.id === 'loop-1')
    const childNode = state.nodes.find((node) => node.id === 'agent-1')

    expect(loopNode?.style?.width).toBe(600)
    expect(loopNode?.style?.height).toBe(540)
    expect(Array.isArray(childNode?.extent)).toBe(true)
    expect(childNode?.expandParent).toBe(false)

    const extent = childNode?.extent
    if (!Array.isArray(extent)) {
      throw new Error('Expected loaded compound child to receive array extent')
    }

    expect(childNode?.position).toEqual({
      x: extent[0][0],
      y: extent[0][1],
    })
    expect(extent[1][1] - extent[0][1]).toBeGreaterThanOrEqual(80)
  })

  it('拖拽 compound 子节点到右下角时不会把节点尺寸重复扣减两次', () => {
    const loopConfig = getNodeTypeConfig('loop')
    const chatAgentConfig = getNodeTypeConfig('chat-agent')

    useCanvasStore.getState().actions.applyServerSnapshot({
      workflowId: 'wf-1',
      version: 1,
      viewport: { x: 0, y: 0, zoom: 1 },
      nodes: [
        {
          id: 'loop-1',
          type: 'control',
          position: { x: 120, y: 80 },
          style: { width: 800, height: 600 },
          data: {
            label: 'Loop',
            nodeType: 'loop',
            category: 'control',
            description: '循环 compound 容器',
            config: {
              isCollapsed: false,
              outputMode: 'last',
              defaultState: null,
            },
            inputPorts: clonePortDefinitions(loopConfig.inputPorts),
            outputPorts: clonePortDefinitions(loopConfig.outputPorts),
          },
        },
        {
          id: 'agent-1',
          type: 'agent',
          parentId: 'loop-1',
          position: { x: 0, y: 0 },
          width: 260,
          height: 160,
          data: {
            label: 'Chat Agent',
            nodeType: 'chat-agent',
            category: 'agent',
            description: '对话型 Agent 节点',
            config: {},
            inputPorts: clonePortDefinitions(chatAgentConfig.inputPorts),
            outputPorts: clonePortDefinitions(chatAgentConfig.outputPorts),
            ...createDefaultAgentNodeData(),
          },
        },
      ],
      edges: [],
    })

    useCanvasStore.getState().actions.onNodesChange([
      {
        id: 'agent-1',
        type: 'position',
        position: { x: 9999, y: 9999 },
        dragging: false,
      },
    ])

    const childNode = useCanvasStore.getState().nodes.find((node) => node.id === 'agent-1')
    const extent = childNode?.extent

    if (!childNode || !Array.isArray(extent)) {
      throw new Error('Expected compound child to have synchronized extent after snapshot load')
    }

    expect(childNode.position).toEqual({
      x: extent[1][0] - 260,
      y: extent[1][1] - 160,
    })
    expect(childNode.position.x - extent[0][0]).toBeGreaterThanOrEqual(400)
    expect(childNode.position.y - extent[0][1]).toBeGreaterThanOrEqual(150)
  })

  it('compound 在 resize 进行中也会按最新 live 尺寸同步子节点 extent', () => {
    const loopConfig = getNodeTypeConfig('loop')
    const chatAgentConfig = getNodeTypeConfig('chat-agent')

    useCanvasStore.getState().actions.applyServerSnapshot({
      workflowId: 'wf-1',
      version: 1,
      viewport: { x: 0, y: 0, zoom: 1 },
      nodes: [
        {
          id: 'loop-1',
          type: 'control',
          position: { x: 120, y: 80 },
          style: { width: 600, height: 540 },
          data: {
            label: 'Loop',
            nodeType: 'loop',
            category: 'control',
            description: '循环 compound 容器',
            config: {
              isCollapsed: false,
              outputMode: 'last',
              defaultState: null,
            },
            inputPorts: clonePortDefinitions(loopConfig.inputPorts),
            outputPorts: clonePortDefinitions(loopConfig.outputPorts),
          },
        },
        {
          id: 'agent-1',
          type: 'agent',
          parentId: 'loop-1',
          position: { x: 0, y: 0 },
          width: 260,
          height: 160,
          data: {
            label: 'Chat Agent',
            nodeType: 'chat-agent',
            category: 'agent',
            description: '对话型 Agent 节点',
            config: {},
            inputPorts: clonePortDefinitions(chatAgentConfig.inputPorts),
            outputPorts: clonePortDefinitions(chatAgentConfig.outputPorts),
            ...createDefaultAgentNodeData(),
          },
        },
      ],
      edges: [],
    })

    useCanvasStore.getState().actions.onNodesChange([
      {
        id: 'loop-1',
        type: 'dimensions',
        dimensions: { width: 900, height: 720 },
        resizing: true,
        setAttributes: true,
      },
    ])

    const state = useCanvasStore.getState()
    const loopNode = state.nodes.find((node) => node.id === 'loop-1')
    const childNode = state.nodes.find((node) => node.id === 'agent-1')

    if (!loopNode || !childNode || !Array.isArray(childNode.extent)) {
      throw new Error('Expected compound resize to keep parent and child nodes available')
    }

    expect(loopNode.style?.width).toBe(900)
    expect(loopNode.style?.height).toBe(720)
    expect(childNode.extent).toEqual(
      buildCompoundChildExtent({
        inputPortCount: loopNode.data.inputPorts.length,
        outputPortCount: loopNode.data.outputPorts.length,
        width: 900,
        height: 720,
      }),
    )
  })

  it('deletes the selected node and its connected edges', () => {
    const node = createNode()
    const edge: CanvasEdge = {
      id: 'edge-1',
      source: 'node-1',
      target: 'node-2',
    }

    useCanvasStore.setState((state) => ({
      ...state,
      nodes: [node],
      edges: [edge],
      selectedNodeId: 'node-1',
    }))

    useCanvasStore.getState().actions.deleteSelectedNode()

    const state = useCanvasStore.getState()
    expect(state.nodes).toHaveLength(0)
    expect(state.edges).toHaveLength(0)
    expect(state.selectedNodeId).toBeNull()
    expect(state.isDirty).toBe(true)
  })

  it('cleans up validation errors when deleting the selected node', () => {
    const node = createNode()

    useCanvasStore.setState((state) => ({
      ...state,
      nodes: [node],
      selectedNodeId: 'node-1',
      nodeValidationErrors: {
        'node-1': true,
        'node-2': true,
      },
    }))

    useCanvasStore.getState().actions.deleteSelectedNode()

    expect(useCanvasStore.getState().nodeValidationErrors).toEqual({
      'node-2': true,
    })
  })

  it('cleans up validation errors when nodes are removed via onNodesChange', () => {
    const nodeA = createNode({ id: 'node-1' })
    const nodeB = createNode({ id: 'node-2' })

    useCanvasStore.setState((state) => ({
      ...state,
      nodes: [nodeA, nodeB],
      nodeValidationErrors: {
        'node-1': true,
        'node-2': true,
      },
    }))

    useCanvasStore.getState().actions.onNodesChange([{ id: 'node-1', type: 'remove' }])

    expect(useCanvasStore.getState().nodeValidationErrors).toEqual({
      'node-2': true,
    })
  })

  it('backfills missing ports and config during server snapshot hydration', () => {
    const partialNode = {
      ...createNode(),
      data: {
        label: 'Hydrated Node',
        nodeType: 'chat-agent',
        category: 'agent',
        description: 'Hydrated',
      },
    } as CanvasNode

    useCanvasStore.getState().actions.applyServerSnapshot({
      nodes: [partialNode],
      edges: [],
      workflowId: 'workflow-1',
      version: 7,
    })

    const state = useCanvasStore.getState()
    const hydratedNode = state.nodes[0]

    if (!hydratedNode) {
      throw new Error('Expected hydrated node to exist')
    }

    expect(hydratedNode.data.config).toEqual({})
    expect(hydratedNode.data.inputPorts).toHaveLength(3)
    expect(hydratedNode.data.outputPorts).toHaveLength(3)
    expect(hydratedNode.data.modelConfig).toEqual({
      connectedModelNodeId: null,
    })
    expect(hydratedNode.data.autonomyConfig).toEqual(createDefaultAgentNodeData().autonomyConfig)
    expect(hydratedNode.data.outputFormatStrategy).toEqual(createDefaultAgentNodeData().outputFormatStrategy)
    expect(hydratedNode.data.toolBindings).toEqual([])
    expect(hydratedNode.data.knowledgeBindings).toEqual([])
    expect(state.isDirty).toBe(false)
    expect(state.selectedNodeId).toBeNull()
    expect(state.selectedNodeIds).toEqual(new Set())
  })

  it('preserves existing ports and config during server snapshot hydration', () => {
    const snapshotNode = createNode({
      data: {
        label: 'Existing Ports',
        nodeType: 'chat-agent',
        category: 'agent',
        description: 'Keep my ports',
        config: { retries: 3 },
        modelConfig: { connectedModelNodeId: 'model-node-1' },
        autonomyConfig: { mode: 'RULE_BASED' },
        outputFormatStrategy: {
          outputSchema: '{"type":"object"}',
          strictness: 'lenient',
          allowDegrade: false,
          repairPolicy: 'manual',
        },
        toolBindings: ['tool-a'],
        knowledgeBindings: ['kb-a'],
        inputPorts: clonePortDefinitions(customInputPorts),
        outputPorts: [],
      },
    })

    useCanvasStore.getState().actions.applyServerSnapshot({
      nodes: [snapshotNode],
      edges: [],
      workflowId: 'workflow-1',
      version: 8,
    })

    const hydratedNode = useCanvasStore.getState().nodes[0]

    if (!hydratedNode) {
      throw new Error('Expected hydrated node to exist')
    }

    expect(hydratedNode.data.config).toEqual({ retries: 3 })
    expect(hydratedNode.data.inputPorts.map((port) => port.id)).toEqual(['exec-in', 'custom-input'])
    expect(hydratedNode.data.inputPorts[1]).toMatchObject(customInputPorts[0]!)
    expect(hydratedNode.data.outputPorts.map((port) => port.id)).toEqual(['exec-out'])
    expect(hydratedNode.data.modelConfig).toEqual({
      connectedModelNodeId: 'model-node-1',
    })
    expect(hydratedNode.data.autonomyConfig).toEqual({
      ...createDefaultAgentNodeData().autonomyConfig,
      mode: 'RULE_BASED',
    })
    expect(hydratedNode.data.outputFormatStrategy).toEqual({
      outputSchema: '{"type":"object"}',
      strictness: 'lenient',
      allowDegrade: false,
      repairPolicy: 'manual',
    })
    expect(hydratedNode.data.toolBindings).toEqual(['tool-a'])
    expect(hydratedNode.data.knowledgeBindings).toEqual(['kb-a'])
  })

  it('updates save metadata when marking as saved', () => {
    const savedAt = Date.parse('2026-03-07T09:00:00.000Z')
    const before = Date.now()

    useCanvasStore.setState((state) => ({
      ...state,
      isDirty: true,
      isSaving: true,
    }))

    useCanvasStore.getState().actions.markSaved(savedAt)

    const state = useCanvasStore.getState()
    const lastSavedAt = state.lastSavedAt

    if (!lastSavedAt) {
      throw new Error('Expected lastSavedAt to be populated after marking the snapshot as saved')
    }

    expect(state.isDirty).toBe(false)
    expect(state.isSaving).toBe(false)
    expect(lastSavedAt.getTime()).toBeGreaterThanOrEqual(before)
    expect(lastSavedAt.getTime()).toBeLessThanOrEqual(Date.now())
  })

  it('tracks selection and viewport updates', () => {
    useCanvasStore.getState().actions.selectNode('node-42')
    useCanvasStore.getState().actions.setViewport({ x: 10, y: 20, zoom: 1.5 })
    useCanvasStore.getState().actions.commitViewport({ x: 30, y: 40, zoom: 2 })

    const state = useCanvasStore.getState()
    expect(state.selectedNodeId).toBe('node-42')
    expect(state.selectedNodeIds).toEqual(new Set(['node-42']))
    expect(state.viewport).toEqual({ x: 30, y: 40, zoom: 2 })
    expect(state.isDirty).toBe(true)
  })

  it('toggles node selection in the multi-select set', () => {
    useCanvasStore.getState().actions.toggleNodeSelection('node-1')

    let state = useCanvasStore.getState()
    expect(state.selectedNodeIds).toEqual(new Set(['node-1']))
    expect(state.selectedNodeId).toBe('node-1')
    expect(state.selectedEdgeId).toBeNull()

    useCanvasStore.getState().actions.toggleNodeSelection('node-2')

    state = useCanvasStore.getState()
    expect(state.selectedNodeIds).toEqual(new Set(['node-1', 'node-2']))
    expect(state.selectedNodeId).toBe('node-2')

    useCanvasStore.getState().actions.toggleNodeSelection('node-2')

    state = useCanvasStore.getState()
    expect(state.selectedNodeIds).toEqual(new Set(['node-1']))
    expect(state.selectedNodeId).toBe('node-1')
  })

  it('replaces the multi-selection when selecting nodes in bulk', () => {
    useCanvasStore.getState().actions.selectNodes(['node-1', 'node-2'])

    let state = useCanvasStore.getState()
    expect(state.selectedNodeIds).toEqual(new Set(['node-1', 'node-2']))
    expect(state.selectedNodeId).toBe('node-2')

    useCanvasStore.getState().actions.selectNodes(['node-3'])

    state = useCanvasStore.getState()
    expect(state.selectedNodeIds).toEqual(new Set(['node-3']))
    expect(state.selectedNodeId).toBe('node-3')
  })

  it('clears both single and multi-selection state', () => {
    useCanvasStore.setState((state) => ({
      ...state,
      selectedNodeId: 'node-2',
      selectedNodeIds: new Set(['node-1', 'node-2']),
      selectedEdgeId: 'edge-1',
    }))

    useCanvasStore.getState().actions.clearSelection()

    const state = useCanvasStore.getState()
    expect(state.selectedNodeId).toBeNull()
    expect(state.selectedNodeIds).toEqual(new Set())
    expect(state.selectedEdgeId).toBeNull()
  })

  it('syncs selectedNodeIds when React Flow selection changes arrive', () => {
    const nodeA = createNode({ id: 'node-1', selected: false })
    const nodeB = createNode({ id: 'node-2', selected: false })

    useCanvasStore.setState((state) => ({
      ...state,
      nodes: [nodeA, nodeB],
      selectedEdgeId: 'edge-1',
    }))

    useCanvasStore.getState().actions.onNodesChange([
      { id: 'node-1', type: 'select', selected: true },
      { id: 'node-2', type: 'select', selected: true },
    ])

    const state = useCanvasStore.getState()
    expect(state.selectedNodeIds).toEqual(new Set(['node-1', 'node-2']))
    expect(state.selectedNodeId).toBe('node-2')
    expect(state.selectedEdgeId).toBeNull()
  })

  it('deletes all selected nodes and their connected edges', () => {
    const nodeA = createNode({ id: 'node-1' })
    const nodeB = createNode({ id: 'node-2' })
    const nodeC = createNode({ id: 'node-3' })
    const edgeA: CanvasEdge = {
      id: 'edge-1',
      source: 'node-1',
      target: 'node-2',
    }
    const edgeB: CanvasEdge = {
      id: 'edge-2',
      source: 'node-2',
      target: 'node-3',
    }
    const edgeC: CanvasEdge = {
      id: 'edge-3',
      source: 'node-3',
      target: 'node-4',
    }

    useCanvasStore.setState((state) => ({
      ...state,
      nodes: [nodeA, nodeB, nodeC],
      edges: [edgeA, edgeB, edgeC],
      selectedNodeId: 'node-2',
      selectedNodeIds: new Set(['node-1', 'node-2']),
      selectedEdgeId: 'edge-1',
      mappingPanelEdgeId: 'edge-1',
      nodeValidationErrors: {
        'node-1': true,
        'node-2': true,
        'node-3': true,
      },
    }))

    useCanvasStore.getState().actions.deleteSelectedNodes()

    const state = useCanvasStore.getState()
    expect(state.nodes.map((node) => node.id)).toEqual(['node-3'])
    expect(state.edges.map((edge) => edge.id)).toEqual(['edge-3'])
    expect(state.nodeValidationErrors).toEqual({
      'node-3': true,
    })
    expect(state.selectedNodeId).toBeNull()
    expect(state.selectedNodeIds).toEqual(new Set())
    expect(state.selectedEdgeId).toBeNull()
    expect(state.mappingPanelEdgeId).toBeNull()
    expect(state.isDirty).toBe(true)
  })

  it('marks node and edge changes as dirty', () => {
    const node = createNode({
      data: {
        label: 'Dirty Node',
        nodeType: 'chat-agent',
        category: 'agent',
        description: 'Dirty',
        config: {},
        inputPorts: clonePortDefinitions(customInputPorts),
        outputPorts: clonePortDefinitions(customOutputPorts),
      },
    })
    const edge: CanvasEdge = {
      id: 'edge-1',
      source: 'node-1',
      target: 'node-2',
    }

    useCanvasStore.setState((state) => ({
      ...state,
      nodes: [node],
      edges: [edge],
    }))

    useCanvasStore.getState().actions.onNodesChange([{ id: 'node-1', type: 'remove' }])
    useCanvasStore.getState().actions.onEdgesChange([{ id: 'edge-1', type: 'remove' }])

    const state = useCanvasStore.getState()
    expect(state.nodes).toHaveLength(0)
    expect(state.edges).toHaveLength(0)
    expect(state.isDirty).toBe(true)
  })

  it('tracks explicit saving state and reset behavior', () => {
    useCanvasStore.getState().actions.addNode(mockAddNodeInput)
    useCanvasStore.getState().actions.setIsSaving(true)

    expect(useCanvasStore.getState().isSaving).toBe(true)

    useCanvasStore.getState().actions.reset()

    const state = useCanvasStore.getState()
    expect(state.nodes).toEqual([])
    expect(state.edges).toEqual([])
    expect(state.selectedNodeId).toBeNull()
    expect(state.selectedNodeIds).toEqual(new Set())
    expect(state.selectedEdgeId).toBeNull()
    expect(state.mappingPanelEdgeId).toBeNull()
    expect(state.isDirty).toBe(false)
    expect(state.isSaving).toBe(false)
    expect(state.workflowId).toBeNull()
    expect(state.version).toBe(1)
  })

  it('selects an edge and clears node selection', () => {
    useCanvasStore.getState().actions.selectNode('node-42')
    useCanvasStore.getState().actions.selectEdge('edge-1')

    const state = useCanvasStore.getState()
    expect(state.selectedEdgeId).toBe('edge-1')
    expect(state.selectedNodeId).toBeNull()
    expect(state.selectedNodeIds).toEqual(new Set())
  })

  it('selects a node and clears edge selection', () => {
    useCanvasStore.getState().actions.selectEdge('edge-1')
    useCanvasStore.getState().actions.selectNode('node-42')

    const state = useCanvasStore.getState()
    expect(state.selectedNodeId).toBe('node-42')
    expect(state.selectedNodeIds).toEqual(new Set(['node-42']))
    expect(state.selectedEdgeId).toBeNull()
  })

  it('keeps selectedNodeIds in sync when using selectNode for backward compatibility', () => {
    useCanvasStore.getState().actions.selectNode('node-42')
    expect(useCanvasStore.getState().selectedNodeIds).toEqual(new Set(['node-42']))

    useCanvasStore.getState().actions.selectNode(null)
    expect(useCanvasStore.getState().selectedNodeIds).toEqual(new Set())
  })

  it('opens field mapping panel for an edge', () => {
    useCanvasStore.getState().actions.selectNode('node-42')
    useCanvasStore.getState().actions.openFieldMapping('edge-1')

    const state = useCanvasStore.getState()
    expect(state.mappingPanelEdgeId).toBe('edge-1')
    expect(state.selectedEdgeId).toBe('edge-1')
    expect(state.selectedNodeId).toBeNull()
    expect(state.selectedNodeIds).toEqual(new Set())
  })

  it('closes field mapping panel', () => {
    useCanvasStore.getState().actions.openFieldMapping('edge-1')
    useCanvasStore.getState().actions.closeFieldMapping()

    const state = useCanvasStore.getState()
    expect(state.mappingPanelEdgeId).toBeNull()
  })

  it('patches edge data and marks dirty', () => {
    const edge: CanvasEdge = {
      id: 'edge-1',
      source: 'node-1',
      target: 'node-2',
    }

    useCanvasStore.setState((s) => ({ ...s, edges: [edge] }))

    useCanvasStore.getState().actions.updateEdgeData('edge-1', {
      rawCompatibilityLevel: 'PARTIAL',
      visualLevel: 'L1',
    })

    const state = useCanvasStore.getState()
    const updatedEdge = state.edges[0]
    expect(updatedEdge?.data?.rawCompatibilityLevel).toBe('PARTIAL')
    expect(updatedEdge?.data?.visualLevel).toBe('L1')
    expect(updatedEdge?.data?.fieldMapping).toEqual([])
    expect(state.isDirty).toBe(true)
  })

  it('updates field mappings and recalculates summary', () => {
    const defaultData = createDefaultEdgeData()
    defaultData.missingFields = [
      {
        path: 'name',
        expectedType: { kind: 'text', title: 'name' },
        required: true,
      },
      {
        path: 'age',
        expectedType: {
          kind: 'json',
          shape: 'object',
          title: 'age',
          properties: {},
          additionalProperties: false,
        },
        required: true,
      },
    ]
    const edge: CanvasEdge = {
      id: 'edge-1',
      source: 'node-1',
      target: 'node-2',
      data: defaultData,
    }

    useCanvasStore.setState((s) => ({ ...s, edges: [edge] }))

    useCanvasStore.getState().actions.updateFieldMapping('edge-1', [
      {
        sourceField: 'fullName',
        targetField: 'name',
        compatLevel: 'L0',
        autoRecommended: true,
        confidence: 0.95,
      },
    ])

    const state = useCanvasStore.getState()
    const updated = state.edges[0]?.data
    expect(updated?.fieldMapping).toHaveLength(1)
    expect(updated?.mappingSummary.autoMatchedCount).toBe(1)
    expect(updated?.mappingSummary.manualCount).toBe(0)
    expect(updated?.mappingSummary.requiredUnmappedCount).toBe(1)
    expect(state.isDirty).toBe(true)
  })

  it('hydrates edge data with defaults during server snapshot', () => {
    const bareEdge: CanvasEdge = {
      id: 'edge-1',
      source: 'node-1',
      target: 'node-2',
    }

    useCanvasStore.getState().actions.applyServerSnapshot({
      nodes: [],
      edges: [bareEdge],
      workflowId: 'wf-1',
      version: 1,
    })

    const state = useCanvasStore.getState()
    const hydratedEdge = state.edges[0]
    expect(hydratedEdge?.data).toBeDefined()
    expect(hydratedEdge?.data?.rawCompatibilityLevel).toBe('EXACT')
    expect(hydratedEdge?.data?.visualLevel).toBe('L0')
    expect(hydratedEdge?.data?.fieldMapping).toEqual([])
    expect(state.selectedEdgeId).toBeNull()
    expect(state.mappingPanelEdgeId).toBeNull()
  })

  it('clears edge state when deleting a node with connected edges', () => {
    const node = createNode()
    const edge: CanvasEdge = {
      id: 'edge-1',
      source: 'node-1',
      target: 'node-2',
    }

    useCanvasStore.setState((s) => ({
      ...s,
      nodes: [node],
      edges: [edge],
      selectedNodeId: 'node-1',
      selectedEdgeId: 'edge-1',
      mappingPanelEdgeId: 'edge-1',
    }))

    useCanvasStore.getState().actions.deleteSelectedNode()

    const state = useCanvasStore.getState()
    expect(state.selectedEdgeId).toBeNull()
    expect(state.mappingPanelEdgeId).toBeNull()
  })

  it('clears edge state when edge is removed via onEdgesChange', () => {
    const edge: CanvasEdge = {
      id: 'edge-1',
      source: 'node-1',
      target: 'node-2',
    }

    useCanvasStore.setState((s) => ({
      ...s,
      edges: [edge],
      selectedEdgeId: 'edge-1',
      mappingPanelEdgeId: 'edge-1',
    }))

    useCanvasStore.getState().actions.onEdgesChange([{ id: 'edge-1', type: 'remove' }])

    const state = useCanvasStore.getState()
    expect(state.edges).toHaveLength(0)
    expect(state.selectedEdgeId).toBeNull()
    expect(state.mappingPanelEdgeId).toBeNull()
  })

  it('creates smart connections once and ignores exact duplicates', () => {
    const sourceNode = createNode({
      id: 'src',
      data: {
        ...createNode().data,
        inputPorts: [],
        outputPorts: clonePortDefinitions(customOutputPorts),
      },
    })
    const targetNode = createNode({
      id: 'tgt',
      data: {
        ...createNode().data,
        inputPorts: clonePortDefinitions(customInputPorts),
        outputPorts: [],
      },
    })

    useCanvasStore.getState().actions.applyServerSnapshot({
      workflowId: 'workflow-1',
      nodes: [sourceNode, targetNode],
      edges: [],
      viewport: undefined,
      version: 1,
    })

    const edgeData = {
      ...createDefaultEdgeData(),
      rawCompatibilityLevel: 'PARTIAL' as const,
      visualLevel: 'L1' as const,
    }

    useCanvasStore.getState().actions.createConnection(
      {
        source: 'src',
        target: 'tgt',
        sourceHandle: 'result',
        targetHandle: 'input',
      },
      edgeData,
    )
    useCanvasStore.getState().actions.createConnection(
      {
        source: 'src',
        target: 'tgt',
        sourceHandle: 'result',
        targetHandle: 'input',
      },
      edgeData,
    )

    const state = useCanvasStore.getState()
    expect(state.edges).toHaveLength(1)
    expect(state.edges[0]).toMatchObject({
      type: 'smart',
      source: 'src',
      target: 'tgt',
      sourceHandle: 'result',
      targetHandle: 'input',
      data: edgeData,
    })
    expect(state.isDirty).toBe(true)
  })

  it('does not revalidate connected edges for generic node config edits', async () => {
    const sourceNode = createNode({
      id: 'src',
      data: {
        ...createNode().data,
        inputPorts: [],
        outputPorts: clonePortDefinitions(customOutputPorts),
      },
    })
    const targetNode = createNode({
      id: 'tgt',
      data: {
        ...createNode().data,
        inputPorts: clonePortDefinitions(customInputPorts),
        outputPorts: [],
      },
    })

    useCanvasStore.getState().actions.applyServerSnapshot({
      workflowId: 'workflow-1',
      nodes: [sourceNode, targetNode],
      edges: [
        {
          id: 'edge-1',
          source: 'src',
          target: 'tgt',
          sourceHandle: 'custom-output',
          targetHandle: 'custom-input',
          data: createDefaultEdgeData(),
        },
      ],
      viewport: undefined,
      version: 1,
    })

    useCanvasStore.getState().actions.updateNodeData('tgt', {
      config: { retries: 3 },
    })

    await flushMicrotasks()

    expect(evaluateCompatibilityMock).not.toHaveBeenCalled()
  })

  it('revalidates connected edges when port contract signatures change', async () => {
    const sourceNode = createNode({
      id: 'src',
      data: {
        ...createNode().data,
        inputPorts: [],
        outputPorts: clonePortDefinitions(customOutputPorts),
      },
    })
    const targetNode = createNode({
      id: 'tgt',
      data: {
        ...createNode().data,
        inputPorts: clonePortDefinitions(customInputPorts),
        outputPorts: [],
      },
    })

    useCanvasStore.getState().actions.applyServerSnapshot({
      workflowId: 'workflow-1',
      nodes: [sourceNode, targetNode],
      edges: [
        {
          id: 'edge-1',
          source: 'src',
          target: 'tgt',
          sourceHandle: 'custom-output',
          targetHandle: 'custom-input',
          data: {
            ...createDefaultEdgeData(),
            rawCompatibilityLevel: 'EXACT',
            visualLevel: 'L0',
          },
        },
      ],
      viewport: undefined,
      version: 1,
    })

    evaluateCompatibilityMock.mockResolvedValue({
      level: 'INCOMPATIBLE',
      reason: 'type_mismatch_no_transform',
      missingFields: [],
      candidateMappings: [],
      conflictPath: 'root.kind',
      transformFn: null,
      metadata: {},
    })

    useCanvasStore.getState().actions.updateNodeData('tgt', {
      inputPorts: [
        {
          ...customInputPorts[0]!,
          dataType: 'model',
          schema: { kind: 'model' },
        },
      ],
    })

    await flushMicrotasks()
    await flushMicrotasks()

    expect(evaluateCompatibilityMock).toHaveBeenCalledOnce()
    expect(useCanvasStore.getState().edges[0]?.data).toMatchObject({
      rawCompatibilityLevel: 'INCOMPATIBLE',
      visualLevel: 'error',
      reasonKey: 'type_mismatch_no_transform',
    })
    expect(useCanvasStore.getState().isDirty).toBe(true)
  })

  it('ignores stale revalidation results after applying a new server snapshot', async () => {
    const sourceNode = createNode({
      id: 'src',
      data: {
        ...createNode().data,
        inputPorts: [],
        outputPorts: clonePortDefinitions(customOutputPorts),
      },
    })
    const targetNode = createNode({
      id: 'tgt',
      data: {
        ...createNode().data,
        inputPorts: clonePortDefinitions(customInputPorts),
        outputPorts: [],
      },
    })
    const pendingEvaluation = createDeferred<TypeEngineCompatibilityResult>()

    useCanvasStore.getState().actions.applyServerSnapshot({
      workflowId: 'workflow-1',
      nodes: [sourceNode, targetNode],
      edges: [
        {
          id: 'edge-1',
          source: 'src',
          target: 'tgt',
          sourceHandle: 'custom-output',
          targetHandle: 'custom-input',
          data: {
            ...createDefaultEdgeData(),
            rawCompatibilityLevel: 'EXACT',
            visualLevel: 'L0',
          },
        },
      ],
      viewport: undefined,
      version: 1,
    })

    evaluateCompatibilityMock.mockImplementation(() => pendingEvaluation.promise)

    useCanvasStore.getState().actions.updateNodeData('tgt', {
      inputPorts: [
        {
          ...customInputPorts[0]!,
          dataType: 'model',
          schema: { kind: 'model' },
        },
      ],
    })

    await flushMicrotasks()
    expect(evaluateCompatibilityMock).toHaveBeenCalledOnce()

    useCanvasStore.getState().actions.applyServerSnapshot({
      workflowId: 'workflow-2',
      nodes: [sourceNode, targetNode],
      edges: [
        {
          id: 'edge-1',
          source: 'src',
          target: 'tgt',
          sourceHandle: 'custom-output',
          targetHandle: 'custom-input',
          data: {
            ...createDefaultEdgeData(),
            rawCompatibilityLevel: 'EXACT',
            visualLevel: 'L0',
          },
        },
      ],
      viewport: undefined,
      version: 2,
    })

    pendingEvaluation.resolve({
      level: 'INCOMPATIBLE',
      reason: 'type_mismatch_no_transform',
      missingFields: [],
      candidateMappings: [],
      conflictPath: 'root.kind',
      transformFn: null,
      metadata: {},
    })

    await flushMicrotasks()
    await flushMicrotasks()

    expect(useCanvasStore.getState()).toMatchObject({
      workflowId: 'workflow-2',
      version: 2,
      isDirty: false,
    })
    expect(useCanvasStore.getState().edges[0]?.data).toMatchObject({
      rawCompatibilityLevel: 'EXACT',
      visualLevel: 'L0',
      reasonKey: null,
    })
  })

  it('preserves the latest field mapping edits made while revalidation is in flight', async () => {
    const sourcePort = {
      ...customOutputPorts[0]!,
      schema: {
        kind: 'json' as const,
        shape: 'object' as const,
        properties: {
          profileName: { kind: 'text' as const, title: 'Profile Name' },
        },
        required: ['profileName'],
      },
    }
    const targetPort = {
      ...customInputPorts[0]!,
      dataType: 'json' as const,
      schema: {
        kind: 'json' as const,
        shape: 'object' as const,
        properties: {
          fullName: { kind: 'text' as const, title: 'Full Name' },
        },
        required: ['fullName'],
      },
    }
    const sourceNode = createNode({
      id: 'src',
      data: {
        ...createNode().data,
        inputPorts: [],
        outputPorts: [sourcePort],
      },
    })
    const targetNode = createNode({
      id: 'tgt',
      data: {
        ...createNode().data,
        inputPorts: [targetPort],
        outputPorts: [],
      },
    })
    const pendingEvaluation = createDeferred<TypeEngineCompatibilityResult>()

    useCanvasStore.getState().actions.applyServerSnapshot({
      workflowId: 'workflow-1',
      nodes: [sourceNode, targetNode],
      edges: [
        {
          id: 'edge-1',
          source: 'src',
          target: 'tgt',
          sourceHandle: sourcePort.id,
          targetHandle: targetPort.id,
          data: {
            ...createDefaultEdgeData(),
            rawCompatibilityLevel: 'PARTIAL',
            visualLevel: 'L1',
            missingFields: [
              {
                path: `${targetPort.id}.fullName`,
                expectedType: { kind: 'text' as const },
                required: true,
              },
            ],
          },
        },
      ],
      viewport: undefined,
      version: 1,
    })

    evaluateCompatibilityMock.mockImplementation(() => pendingEvaluation.promise)

    useCanvasStore.getState().actions.updateNodeData('tgt', {
      inputPorts: [
        {
          ...targetPort,
          description: 'trigger refresh',
        },
      ],
    })

    await flushMicrotasks()

    useCanvasStore.getState().actions.updateFieldMapping('edge-1', [
      {
        sourceField: `${sourcePort.id}.profileName`,
        targetField: `${targetPort.id}.fullName`,
        compatLevel: 'L1',
        autoRecommended: false,
      },
    ])

    pendingEvaluation.resolve({
      level: 'PARTIAL',
      reason: 'partial_field_match',
      missingFields: [
        {
          path: `${targetPort.id}.fullName`,
          expectedType: { kind: 'text' as const },
          required: true,
        },
      ],
      candidateMappings: [
        {
          sourcePath: `${sourcePort.id}.profileName`,
          targetPath: `${targetPort.id}.fullName`,
          confidence: 0.91,
          autoRecommended: true,
        },
      ],
      conflictPath: null,
      transformFn: null,
      metadata: {
        matchedRatio: 0,
        matchedRequiredCount: 0,
        totalRequiredCount: 1,
        unmappedRequiredCount: 1,
      },
    })

    await flushMicrotasks()
    await flushMicrotasks()

    expect(useCanvasStore.getState().edges[0]?.data).toMatchObject({
      rawCompatibilityLevel: 'PARTIAL',
      visualLevel: 'L1',
      fieldMapping: [
        {
          sourceField: `${sourcePort.id}.profileName`,
          targetField: `${targetPort.id}.fullName`,
          compatLevel: 'L1',
          autoRecommended: false,
        },
      ],
      mappingSummary: {
        autoMatchedCount: 0,
        manualCount: 1,
        requiredUnmappedCount: 0,
      },
    })
  })

  describe('search actions', () => {
    it('toggleSearch opens and closes search', () => {
      useCanvasStore.getState().actions.toggleSearch()
      expect(useCanvasStore.getState().isSearchOpen).toBe(true)

      useCanvasStore.getState().actions.toggleSearch()
      expect(useCanvasStore.getState().isSearchOpen).toBe(false)
    })

    it('toggleSearch clears search state when closing', () => {
      useCanvasStore.getState().actions.toggleSearch()
      useCanvasStore.getState().actions.setSearchQuery('agent')
      useCanvasStore.getState().actions.toggleSearch()

      const state = useCanvasStore.getState()
      expect(state.searchQuery).toBe('')
      expect(state.searchMatchIds).toEqual([])
      expect(state.currentSearchIndex).toBe(-1)
    })

    it('setSearchQuery finds matching nodes by label', () => {
      const nodeA = createNode({
        id: 'a',
        data: { ...createNode().data, label: 'LLM Agent' },
      })
      const nodeB = createNode({
        id: 'b',
        data: {
          ...createNode().data,
          label: 'HTTP Request',
          nodeType: 'http-tool',
        },
      })
      const nodeC = createNode({
        id: 'c',
        data: { ...createNode().data, label: 'Data Agent' },
      })
      useCanvasStore.setState((s) => ({ ...s, nodes: [nodeA, nodeB, nodeC] }))

      useCanvasStore.getState().actions.setSearchQuery('agent')

      const state = useCanvasStore.getState()
      expect(state.searchMatchIds).toEqual(['a', 'c'])
      expect(state.currentSearchIndex).toBe(0)
    })

    it('setSearchQuery is case-insensitive', () => {
      const node = createNode({
        id: 'x',
        data: { ...createNode().data, label: 'LLM Agent' },
      })
      useCanvasStore.setState((s) => ({ ...s, nodes: [node] }))

      useCanvasStore.getState().actions.setSearchQuery('llm')
      expect(useCanvasStore.getState().searchMatchIds).toEqual(['x'])
    })

    it('setSearchQuery also matches node type', () => {
      const node = createNode({
        id: 'http-node',
        data: {
          ...createNode().data,
          label: '请求节点',
          nodeType: 'http-tool',
        },
      })
      useCanvasStore.setState((s) => ({ ...s, nodes: [node] }))

      useCanvasStore.getState().actions.setSearchQuery('http')

      const state = useCanvasStore.getState()
      expect(state.searchMatchIds).toEqual(['http-node'])
      expect(state.currentSearchIndex).toBe(0)
    })

    it('setSearchQuery resets index when no matches', () => {
      const node = createNode()
      useCanvasStore.setState((s) => ({ ...s, nodes: [node] }))

      useCanvasStore.getState().actions.setSearchQuery('nonexistent')
      expect(useCanvasStore.getState().searchMatchIds).toEqual([])
      expect(useCanvasStore.getState().currentSearchIndex).toBe(-1)
    })

    it('setSearchQuery clears matches for empty/whitespace query', () => {
      const node = createNode()
      useCanvasStore.setState((s) => ({ ...s, nodes: [node] }))

      useCanvasStore.getState().actions.setSearchQuery('Server')
      expect(useCanvasStore.getState().searchMatchIds.length).toBeGreaterThan(0)

      useCanvasStore.getState().actions.setSearchQuery('  ')
      expect(useCanvasStore.getState().searchMatchIds).toEqual([])
      expect(useCanvasStore.getState().currentSearchIndex).toBe(-1)
    })

    it('nextSearchResult cycles forward through matches', () => {
      const nodes = [
        createNode({
          id: 'a',
          data: { ...createNode().data, label: 'Agent 1' },
        }),
        createNode({
          id: 'b',
          data: { ...createNode().data, label: 'Agent 2' },
        }),
        createNode({
          id: 'c',
          data: { ...createNode().data, label: 'Agent 3' },
        }),
      ]
      useCanvasStore.setState((s) => ({ ...s, nodes }))
      useCanvasStore.getState().actions.setSearchQuery('Agent')

      expect(useCanvasStore.getState().currentSearchIndex).toBe(0)
      useCanvasStore.getState().actions.nextSearchResult()
      expect(useCanvasStore.getState().currentSearchIndex).toBe(1)
      useCanvasStore.getState().actions.nextSearchResult()
      expect(useCanvasStore.getState().currentSearchIndex).toBe(2)
      useCanvasStore.getState().actions.nextSearchResult()
      expect(useCanvasStore.getState().currentSearchIndex).toBe(0)
    })

    it('prevSearchResult cycles backward through matches', () => {
      const nodes = [
        createNode({
          id: 'a',
          data: { ...createNode().data, label: 'Agent 1' },
        }),
        createNode({
          id: 'b',
          data: { ...createNode().data, label: 'Agent 2' },
        }),
      ]
      useCanvasStore.setState((s) => ({ ...s, nodes }))
      useCanvasStore.getState().actions.setSearchQuery('Agent')

      expect(useCanvasStore.getState().currentSearchIndex).toBe(0)
      useCanvasStore.getState().actions.prevSearchResult()
      expect(useCanvasStore.getState().currentSearchIndex).toBe(1)
      useCanvasStore.getState().actions.prevSearchResult()
      expect(useCanvasStore.getState().currentSearchIndex).toBe(0)
    })

    it('next/prev does nothing when no matches', () => {
      useCanvasStore.getState().actions.nextSearchResult()
      expect(useCanvasStore.getState().currentSearchIndex).toBe(-1)
      useCanvasStore.getState().actions.prevSearchResult()
      expect(useCanvasStore.getState().currentSearchIndex).toBe(-1)
    })

    it('clearSearch resets all search state', () => {
      useCanvasStore.getState().actions.toggleSearch()
      useCanvasStore.getState().actions.setSearchQuery('test')
      useCanvasStore.getState().actions.clearSearch()

      const state = useCanvasStore.getState()
      expect(state.isSearchOpen).toBe(false)
      expect(state.searchQuery).toBe('')
      expect(state.searchMatchIds).toEqual([])
      expect(state.currentSearchIndex).toBe(-1)
    })
  })

  describe('minimap actions', () => {
    it('toggleMiniMap toggles collapsed state', () => {
      expect(useCanvasStore.getState().isMiniMapCollapsed).toBe(false)

      useCanvasStore.getState().actions.toggleMiniMap()
      expect(useCanvasStore.getState().isMiniMapCollapsed).toBe(true)

      useCanvasStore.getState().actions.toggleMiniMap()
      expect(useCanvasStore.getState().isMiniMapCollapsed).toBe(false)
    })
  })

  describe('hover actions', () => {
    it('setHoveredNodeId sets and clears hover', () => {
      useCanvasStore.getState().actions.setHoveredNodeId('node-1')
      expect(useCanvasStore.getState().hoveredNodeId).toBe('node-1')

      useCanvasStore.getState().actions.setHoveredNodeId(null)
      expect(useCanvasStore.getState().hoveredNodeId).toBeNull()
    })
  })

  describe('addNode with MCP dynamic ports', () => {
    beforeEach(() => {
      useCanvasStore.getState().actions.reset()
    })

    it('uses input.inputPorts when provided instead of config defaults', () => {
      useCanvasStore.getState().actions.addNode({
        ...mockAddNodeInput,
        nodeType: 'mcp-tool',
        category: 'tool',
        inputPorts: customInputPorts,
      })

      const node = useCanvasStore.getState().nodes[0]
      expect(node?.data.inputPorts).toHaveLength(1)
      expect(node?.data.inputPorts[0]?.id).toBe('custom-input')
    })

    it('uses input.outputPorts when provided instead of config defaults', () => {
      useCanvasStore.getState().actions.addNode({
        ...mockAddNodeInput,
        nodeType: 'mcp-tool',
        category: 'tool',
        outputPorts: customOutputPorts,
      })

      const node = useCanvasStore.getState().nodes[0]
      expect(node?.data.outputPorts).toHaveLength(1)
      expect(node?.data.outputPorts[0]?.id).toBe('custom-output')
    })

    it('stores mcpToolDefinitionId in node data', () => {
      useCanvasStore.getState().actions.addNode({
        ...mockAddNodeInput,
        nodeType: 'mcp-tool',
        category: 'tool',
        mcpToolDefinitionId: 'mcp-tool-def-123',
      })

      const node = useCanvasStore.getState().nodes[0]
      expect(node?.data.mcpToolDefinitionId).toBe('mcp-tool-def-123')
    })
  })

  it('reset clears search, minimap, and hover state', () => {
    useCanvasStore.getState().actions.toggleSearch()
    useCanvasStore.getState().actions.setSearchQuery('test')
    useCanvasStore.getState().actions.toggleMiniMap()
    useCanvasStore.getState().actions.setHoveredNodeId('node-1')

    useCanvasStore.getState().actions.reset()

    const state = useCanvasStore.getState()
    expect(state.isSearchOpen).toBe(false)
    expect(state.searchQuery).toBe('')
    expect(state.searchMatchIds).toEqual([])
    expect(state.currentSearchIndex).toBe(-1)
    expect(state.isMiniMapCollapsed).toBe(false)
    expect(state.hoveredNodeId).toBeNull()
  })

  describe('field mapping undo/batch actions', () => {
    const setupEdgeWithMappings = (mappings: import('../types').FieldMapping[] = []) => {
      const defaultData = createDefaultEdgeData()
      defaultData.missingFields = [
        {
          path: 'name',
          expectedType: { kind: 'text', title: 'name' },
          required: true,
        },
        {
          path: 'age',
          expectedType: {
            kind: 'json',
            shape: 'object',
            title: 'age',
            properties: {},
            additionalProperties: false,
          },
          required: true,
        },
      ]
      defaultData.fieldMapping = mappings
      const edge: CanvasEdge = {
        id: 'edge-1',
        source: 'node-1',
        target: 'node-2',
        data: defaultData,
      }
      useCanvasStore.setState((s) => ({ ...s, edges: [edge] }))
      return edge
    }

    const mapping1: import('../types').FieldMapping = {
      sourceField: 'fullName',
      targetField: 'name',
      compatLevel: 'L0',
      autoRecommended: true,
      confidence: 0.95,
    }

    const mapping2: import('../types').FieldMapping = {
      sourceField: 'userAge',
      targetField: 'age',
      compatLevel: 'L1',
      autoRecommended: false,
    }

    describe('batchUpdateFieldMappings', () => {
      it('replaces field mappings and recalculates summary', () => {
        setupEdgeWithMappings()

        useCanvasStore.getState().actions.batchUpdateFieldMappings('edge-1', [mapping1, mapping2])

        const state = useCanvasStore.getState()
        const updated = state.edges[0]?.data
        expect(updated?.fieldMapping).toHaveLength(2)
        expect(updated?.mappingSummary.autoMatchedCount).toBe(1)
        expect(updated?.mappingSummary.manualCount).toBe(1)
        expect(updated?.mappingSummary.requiredUnmappedCount).toBe(0)
        expect(state.isDirty).toBe(true)
      })

      it('does nothing for non-existent edge', () => {
        setupEdgeWithMappings()

        useCanvasStore.getState().actions.batchUpdateFieldMappings('non-existent', [mapping1])

        const state = useCanvasStore.getState()
        expect(state.edges[0]?.data?.fieldMapping).toEqual([])
      })
    })

    describe('saveMappingSnapshot', () => {
      it('pushes current mappings onto undo stack', () => {
        setupEdgeWithMappings([mapping1])

        useCanvasStore.getState().actions.saveMappingSnapshot('edge-1')

        const state = useCanvasStore.getState()
        expect(state.fieldMappingUndoStack).toHaveLength(1)
        expect(state.fieldMappingUndoStack[0]).toEqual({
          edgeId: 'edge-1',
          mappings: [mapping1],
        })
      })

      it('caps undo stack at 10 entries (FIFO)', () => {
        setupEdgeWithMappings([mapping1])

        for (let i = 0; i < 12; i++) {
          useCanvasStore.getState().actions.saveMappingSnapshot('edge-1')
        }

        const state = useCanvasStore.getState()
        expect(state.fieldMappingUndoStack).toHaveLength(10)
      })

      it('does nothing for non-existent edge', () => {
        setupEdgeWithMappings()

        useCanvasStore.getState().actions.saveMappingSnapshot('non-existent')

        const state = useCanvasStore.getState()
        expect(state.fieldMappingUndoStack).toHaveLength(0)
      })

      it('saves empty mappings array when edge has no mappings', () => {
        setupEdgeWithMappings([])

        useCanvasStore.getState().actions.saveMappingSnapshot('edge-1')

        const state = useCanvasStore.getState()
        expect(state.fieldMappingUndoStack).toHaveLength(1)
        expect(state.fieldMappingUndoStack[0]?.mappings).toEqual([])
      })
    })

    describe('undoFieldMapping', () => {
      it('pops last snapshot for the specific edge and applies it', () => {
        setupEdgeWithMappings([mapping1])

        useCanvasStore.getState().actions.saveMappingSnapshot('edge-1')
        useCanvasStore.getState().actions.batchUpdateFieldMappings('edge-1', [mapping1, mapping2])

        useCanvasStore.getState().actions.undoFieldMapping('edge-1')

        const state = useCanvasStore.getState()
        expect(state.edges[0]?.data?.fieldMapping).toEqual([mapping1])
        expect(state.fieldMappingUndoStack).toHaveLength(0)
      })

      it('does nothing when undo stack is empty for the edge', () => {
        setupEdgeWithMappings([mapping1, mapping2])

        useCanvasStore.getState().actions.undoFieldMapping('edge-1')

        const state = useCanvasStore.getState()
        expect(state.edges[0]?.data?.fieldMapping).toEqual([mapping1, mapping2])
      })

      it('only pops snapshot for the matching edge', () => {
        setupEdgeWithMappings([mapping1])

        useCanvasStore.getState().actions.saveMappingSnapshot('edge-1')

        const edge2Data = createDefaultEdgeData()
        edge2Data.fieldMapping = [mapping2]
        useCanvasStore.setState((s) => ({
          ...s,
          edges: [
            ...s.edges,
            {
              id: 'edge-2',
              source: 'node-2',
              target: 'node-3',
              data: edge2Data,
            },
          ],
        }))

        useCanvasStore.getState().actions.saveMappingSnapshot('edge-2')

        useCanvasStore.getState().actions.undoFieldMapping('edge-1')

        const state = useCanvasStore.getState()
        expect(state.edges[0]?.data?.fieldMapping).toEqual([mapping1])
        expect(state.fieldMappingUndoStack).toHaveLength(1)
        expect(state.fieldMappingUndoStack[0]?.edgeId).toBe('edge-2')
      })

      it('recalculates mappingSummary after undo', () => {
        setupEdgeWithMappings([])

        useCanvasStore.getState().actions.saveMappingSnapshot('edge-1')
        useCanvasStore.getState().actions.batchUpdateFieldMappings('edge-1', [mapping1, mapping2])

        useCanvasStore.getState().actions.undoFieldMapping('edge-1')

        const summary = useCanvasStore.getState().edges[0]?.data?.mappingSummary
        expect(summary?.autoMatchedCount).toBe(0)
        expect(summary?.manualCount).toBe(0)
        expect(summary?.requiredUnmappedCount).toBe(2)
      })
    })

    it('reset clears fieldMappingUndoStack', () => {
      setupEdgeWithMappings([mapping1])
      useCanvasStore.getState().actions.saveMappingSnapshot('edge-1')

      expect(useCanvasStore.getState().fieldMappingUndoStack).toHaveLength(1)

      useCanvasStore.getState().actions.reset()

      expect(useCanvasStore.getState().fieldMappingUndoStack).toHaveLength(0)
    })
  })
})
