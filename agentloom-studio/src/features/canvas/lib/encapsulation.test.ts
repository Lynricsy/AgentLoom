import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CanvasEdge, CanvasNode } from '../types'
import { analyzeEncapsulation, replaceNodesWithBlock } from './encapsulation'

type Uuid = `${string}-${string}-${string}-${string}-${string}`

const DERIVED_INPUT_ID: Uuid = '00000000-0000-0000-0000-000000000001'
const DERIVED_OUTPUT_ID: Uuid = '00000000-0000-0000-0000-000000000002'
const BLOCK_NODE_ID: Uuid = '00000000-0000-0000-0000-000000000003'
const BLOCK_EDGE_IN_ID: Uuid = '00000000-0000-0000-0000-000000000004'
const BLOCK_EDGE_OUT_ID: Uuid = '00000000-0000-0000-0000-000000000005'

function createPort(
  id: string,
  label: string,
  direction: 'input' | 'output',
  dataType: 'text' | 'json',
) {
  return {
    id,
    label,
    direction,
    dataType,
    required: false,
    multiple: false,
    maxConnections: 1,
    schema:
      dataType === 'json'
        ? {
            kind: 'json' as const,
            shape: 'object' as const,
            title: label,
            properties: {},
            additionalProperties: true,
          }
        : {
            kind: 'text' as const,
            title: label,
          },
  }
}

function createNode(
  id: string,
  position: { x: number; y: number },
  overrides: Partial<CanvasNode> = {},
): CanvasNode {
  return {
    id,
    type: 'tool',
    position,
    data: {
      label: id,
      nodeType: 'code-tool',
      category: 'tool',
      description: `${id} description`,
      config: {},
      inputPorts: [createPort('input', '输入', 'input', 'json')],
      outputPorts: [createPort('result', '结果', 'output', 'json')],
    },
    ...overrides,
  }
}

describe('encapsulation', () => {
  let randomUUID: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    randomUUID = vi.spyOn(globalThis.crypto, 'randomUUID')
    randomUUID.mockReset()
  })

  afterEach(() => {
    randomUUID.mockRestore()
  })

  it('analyzeEncapsulation correctly classifies internal, incoming, and outgoing edges', () => {
    const externalIn = createNode('external-in', { x: 0, y: 0 }, {
      data: {
        label: 'External In',
        nodeType: 'manual-trigger',
        category: 'trigger',
        config: {},
        inputPorts: [],
        outputPorts: [createPort('payload', '负载', 'output', 'json')],
      },
      type: 'trigger',
    })
    const selectedA = createNode('selected-a', { x: 100, y: 200 }, {
      data: {
        label: 'Selected A',
        nodeType: 'code-tool',
        category: 'tool',
        config: {},
        inputPorts: [createPort('context', '上下文', 'input', 'json')],
        outputPorts: [createPort('stdout', '标准输出', 'output', 'text')],
      },
    })
    const selectedB = createNode('selected-b', { x: 300, y: 400 }, {
      data: {
        label: 'Selected B',
        nodeType: 'http-tool',
        category: 'tool',
        config: {},
        inputPorts: [createPort('request', '请求', 'input', 'json')],
        outputPorts: [createPort('response', '响应', 'output', 'json')],
      },
    })
    const externalOut = createNode('external-out', { x: 500, y: 100 }, {
      data: {
        label: 'External Out',
        nodeType: 'json-output',
        category: 'output',
        config: {},
        inputPorts: [createPort('content', '内容', 'input', 'json')],
        outputPorts: [],
      },
      type: 'output',
    })

    const edges: CanvasEdge[] = [
      {
        id: 'incoming-1',
        source: 'external-in',
        sourceHandle: 'payload',
        target: 'selected-a',
        targetHandle: 'context',
      },
      {
        id: 'internal-1',
        source: 'selected-a',
        sourceHandle: 'stdout',
        target: 'selected-b',
        targetHandle: 'request',
      },
      {
        id: 'outgoing-1',
        source: 'selected-b',
        sourceHandle: 'response',
        target: 'external-out',
        targetHandle: 'content',
      },
    ]

    const analysis = analyzeEncapsulation(
      new Set(['selected-a', 'selected-b']),
      [externalIn, selectedA, selectedB, externalOut],
      edges,
    )

    expect(analysis.selectedNodes.map((node) => node.id)).toEqual(['selected-a', 'selected-b'])
    expect(analysis.selectedEdges.map((edge) => edge.id)).toEqual(['internal-1'])
    expect(analysis.incomingEdges.map((edge) => edge.id)).toEqual(['incoming-1'])
    expect(analysis.outgoingEdges.map((edge) => edge.id)).toEqual(['outgoing-1'])
  })

  it('analyzeEncapsulation derives input and output ports from selected-side ports', () => {
    randomUUID
      .mockReturnValueOnce(DERIVED_INPUT_ID)
      .mockReturnValueOnce(DERIVED_OUTPUT_ID)

    const selected = createNode('selected-node', { x: 120, y: 220 }, {
      data: {
        label: 'Selected',
        nodeType: 'code-tool',
        category: 'tool',
        config: {},
        inputPorts: [createPort('payload', '入站负载', 'input', 'json')],
        outputPorts: [createPort('summary', '摘要文本', 'output', 'text')],
      },
    })
    const sourceNode = createNode('source-node', { x: 0, y: 0 }, {
      data: {
        label: 'Source',
        nodeType: 'manual-trigger',
        category: 'trigger',
        config: {},
        inputPorts: [],
        outputPorts: [createPort('payload', '负载', 'output', 'json')],
      },
      type: 'trigger',
    })
    const targetNode = createNode('target-node', { x: 500, y: 500 }, {
      data: {
        label: 'Target',
        nodeType: 'text-output',
        category: 'output',
        config: {},
        inputPorts: [createPort('content', '内容', 'input', 'text')],
        outputPorts: [],
      },
      type: 'output',
    })

    const analysis = analyzeEncapsulation(
      new Set(['selected-node']),
      [selected, sourceNode, targetNode],
      [
        {
          id: 'edge-in',
          source: 'source-node',
          sourceHandle: 'payload',
          target: 'selected-node',
          targetHandle: 'payload',
        },
        {
          id: 'edge-out',
          source: 'selected-node',
          sourceHandle: 'summary',
          target: 'target-node',
          targetHandle: 'content',
        },
      ],
    )

    expect(analysis.inputPorts).toEqual([
      {
        id: DERIVED_INPUT_ID,
        label: '入站负载',
        dataType: 'json',
        sourceNodeId: 'selected-node',
        sourcePortId: 'payload',
      },
    ])
    expect(analysis.outputPorts).toEqual([
      {
        id: DERIVED_OUTPUT_ID,
        label: '摘要文本',
        dataType: 'text',
        sourceNodeId: 'selected-node',
        sourcePortId: 'summary',
      },
    ])
  })

  it('analyzeEncapsulation deduplicates derived ports by selected node and port pair', () => {
    randomUUID
      .mockReturnValueOnce(DERIVED_INPUT_ID)
      .mockReturnValueOnce('00000000-0000-0000-0000-000000000011')
      .mockReturnValueOnce(DERIVED_OUTPUT_ID)
      .mockReturnValueOnce('00000000-0000-0000-0000-000000000012')

    const externalA = createNode('external-a', { x: 0, y: 0 }, {
      data: {
        label: 'External A',
        nodeType: 'manual-trigger',
        category: 'trigger',
        config: {},
        inputPorts: [],
        outputPorts: [createPort('payload', '负载', 'output', 'json')],
      },
      type: 'trigger',
    })
    const externalB = createNode('external-b', { x: 50, y: 0 }, {
      data: {
        label: 'External B',
        nodeType: 'manual-trigger',
        category: 'trigger',
        config: {},
        inputPorts: [],
        outputPorts: [createPort('payload', '负载', 'output', 'json')],
      },
      type: 'trigger',
    })
    const selected = createNode('selected', { x: 100, y: 100 }, {
      data: {
        label: 'Selected',
        nodeType: 'code-tool',
        category: 'tool',
        config: {},
        inputPorts: [createPort('context', '上下文', 'input', 'json')],
        outputPorts: [createPort('result', '结果', 'output', 'json')],
      },
    })
    const externalTargetA = createNode('external-target-a', { x: 300, y: 0 }, {
      data: {
        label: 'External Target A',
        nodeType: 'json-output',
        category: 'output',
        config: {},
        inputPorts: [createPort('content', '内容', 'input', 'json')],
        outputPorts: [],
      },
      type: 'output',
    })
    const externalTargetB = createNode('external-target-b', { x: 350, y: 0 }, {
      data: {
        label: 'External Target B',
        nodeType: 'json-output',
        category: 'output',
        config: {},
        inputPorts: [createPort('content', '内容', 'input', 'json')],
        outputPorts: [],
      },
      type: 'output',
    })

    const analysis = analyzeEncapsulation(
      new Set(['selected']),
      [externalA, externalB, selected, externalTargetA, externalTargetB],
      [
        {
          id: 'incoming-a',
          source: 'external-a',
          sourceHandle: 'payload',
          target: 'selected',
          targetHandle: 'context',
        },
        {
          id: 'incoming-b',
          source: 'external-b',
          sourceHandle: 'payload',
          target: 'selected',
          targetHandle: 'context',
        },
        {
          id: 'outgoing-a',
          source: 'selected',
          sourceHandle: 'result',
          target: 'external-target-a',
          targetHandle: 'content',
        },
        {
          id: 'outgoing-b',
          source: 'selected',
          sourceHandle: 'result',
          target: 'external-target-b',
          targetHandle: 'content',
        },
      ],
    )

    expect(analysis.inputPorts).toHaveLength(1)
    expect(analysis.outputPorts).toHaveLength(1)
    expect(analysis.inputPorts[0]).toMatchObject({
      id: DERIVED_INPUT_ID,
      sourceNodeId: 'selected',
      sourcePortId: 'context',
    })
    expect(analysis.outputPorts[0]).toMatchObject({
      id: DERIVED_OUTPUT_ID,
      sourceNodeId: 'selected',
      sourcePortId: 'result',
    })
  })

  it('analyzeEncapsulation calculates centroid from selected node positions', () => {
    const selectedA = createNode('selected-a', { x: 100, y: 200 })
    const selectedB = createNode('selected-b', { x: 300, y: 400 })

    const analysis = analyzeEncapsulation(
      new Set(['selected-a', 'selected-b']),
      [selectedA, selectedB],
      [],
    )

    expect(analysis.centroid).toEqual({ x: 200, y: 300 })
  })

  it('replaceNodesWithBlock removes selected nodes and internal edges, creates a block node, and reconnects external edges', () => {
    const uuidQueue: Uuid[] = [
      DERIVED_INPUT_ID,
      DERIVED_OUTPUT_ID,
      BLOCK_NODE_ID,
      BLOCK_EDGE_IN_ID,
      BLOCK_EDGE_OUT_ID,
    ]

    randomUUID.mockImplementation(() => {
      const next = uuidQueue.shift()

      if (!next) {
        throw new Error('No more UUIDs queued')
      }

      return next
    })

    const externalIn = createNode('external-in', { x: 0, y: 0 }, {
      data: {
        label: 'External In',
        nodeType: 'manual-trigger',
        category: 'trigger',
        config: {},
        inputPorts: [],
        outputPorts: [createPort('payload', '负载', 'output', 'json')],
      },
      type: 'trigger',
    })
    const selectedA = createNode('selected-a', { x: 100, y: 200 }, {
      data: {
        label: 'Selected A',
        nodeType: 'code-tool',
        category: 'tool',
        config: {},
        inputPorts: [createPort('context', '上下文', 'input', 'json')],
        outputPorts: [createPort('stdout', '标准输出', 'output', 'text')],
      },
    })
    const selectedB = createNode('selected-b', { x: 300, y: 400 }, {
      data: {
        label: 'Selected B',
        nodeType: 'http-tool',
        category: 'tool',
        config: {},
        inputPorts: [createPort('request', '请求', 'input', 'text')],
        outputPorts: [createPort('response', '响应', 'output', 'text')],
      },
    })
    const externalOut = createNode('external-out', { x: 500, y: 100 }, {
      data: {
        label: 'External Out',
        nodeType: 'text-output',
        category: 'output',
        config: {},
        inputPorts: [createPort('content', '内容', 'input', 'text')],
        outputPorts: [],
      },
      type: 'output',
    })

    const edges: CanvasEdge[] = [
      {
        id: 'incoming-1',
        source: 'external-in',
        sourceHandle: 'payload',
        target: 'selected-a',
        targetHandle: 'context',
      },
      {
        id: 'internal-1',
        source: 'selected-a',
        sourceHandle: 'stdout',
        target: 'selected-b',
        targetHandle: 'request',
      },
      {
        id: 'outgoing-1',
        source: 'selected-b',
        sourceHandle: 'response',
        target: 'external-out',
        targetHandle: 'content',
      },
    ]

    const analysis = analyzeEncapsulation(
      new Set(['selected-a', 'selected-b']),
      [externalIn, selectedA, selectedB, externalOut],
      edges,
    )

    const result = replaceNodesWithBlock(
      analysis,
      'block-definition-1',
      '分析块',
      [externalIn, selectedA, selectedB, externalOut],
      edges,
    )

    expect(result.nodes.map((node) => node.id)).toEqual([
      'external-in',
      'external-out',
      BLOCK_NODE_ID,
    ])

    const blockNode = result.nodes.find((node) => node.id === BLOCK_NODE_ID)

    expect(blockNode).toMatchObject({
      id: BLOCK_NODE_ID,
      type: 'control',
      position: { x: 200, y: 300 },
      data: {
        label: '分析块',
        nodeType: 'reusable-block',
        category: 'control',
        blockId: 'block-definition-1',
        blockName: '分析块',
        isExpanded: false,
      },
    })

    expect(blockNode?.data.inputPorts).toHaveLength(1)
    expect(blockNode?.data.outputPorts).toHaveLength(1)
    expect(blockNode?.data.blockDefinition).toMatchObject({
      nodes: [selectedA, selectedB],
      edges: [edges[1]],
      inputPorts: [
        {
          id: DERIVED_INPUT_ID,
          label: '上下文',
          sourceNodeId: 'selected-a',
          sourcePortId: 'context',
        },
      ],
      outputPorts: [
        {
          id: DERIVED_OUTPUT_ID,
          label: '响应',
          sourceNodeId: 'selected-b',
          sourcePortId: 'response',
        },
      ],
    })

    expect(result.edges).toHaveLength(2)
    expect(result.edges).toMatchObject([
      {
        id: BLOCK_EDGE_IN_ID,
        source: 'external-in',
        sourceHandle: 'payload',
        target: BLOCK_NODE_ID,
        targetHandle: DERIVED_INPUT_ID,
      },
      {
        id: BLOCK_EDGE_OUT_ID,
        source: BLOCK_NODE_ID,
        sourceHandle: DERIVED_OUTPUT_ID,
        target: 'external-out',
        targetHandle: 'content',
      },
    ])
  })
})
