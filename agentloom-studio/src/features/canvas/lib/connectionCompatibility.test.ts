import { describe, expect, it } from 'vitest'
import type { CanvasNode } from '../types'
import type { Edge } from '@xyflow/react'
import { evaluateConnection } from './connectionCompatibility'

function createNode(overrides: Partial<CanvasNode>): CanvasNode {
  return {
    id: 'node',
    type: 'agent',
    position: { x: 0, y: 0 },
    data: {
      label: 'Node',
      nodeType: 'llm-agent',
      category: 'agent',
      config: {},
      inputPorts: [],
      outputPorts: [],
    },
    ...overrides,
  }
}

describe('evaluateConnection', () => {
  it('returns L0 for exact scalar matches', () => {
    const source = createNode({
      id: 'source',
      data: {
        ...createNode({}).data,
        outputPorts: [
          {
            id: 'result',
            label: 'Result',
            direction: 'output',
            dataType: 'text',
            required: false,
            multiple: false,
            maxConnections: null,
            schema: { kind: 'text' },
          },
        ],
      },
    })
    const target = createNode({
      id: 'target',
      data: {
        ...createNode({}).data,
        inputPorts: [
          {
            id: 'input',
            label: 'Input',
            direction: 'input',
            dataType: 'text',
            required: true,
            multiple: false,
            maxConnections: null,
            schema: { kind: 'text' },
          },
        ],
      },
    })

    const result = evaluateConnection([source, target], {
      source: 'source',
      sourceHandle: 'result',
      target: 'target',
      targetHandle: 'input',
    })

    expect(result.compatible).toBe(true)
    expect(result.edgeData.visualLevel).toBe('L0')
    expect(result.edgeData.rawCompatibilityLevel).toBe('EXACT')
  })

  it('returns L1 with candidate mappings and missing required fields for json objects', () => {
    const source = createNode({
      id: 'source',
      data: {
        ...createNode({}).data,
        outputPorts: [
          {
            id: 'payload',
            label: 'Payload',
            direction: 'output',
            dataType: 'json',
            required: false,
            multiple: false,
            maxConnections: null,
            schema: {
              kind: 'json',
              shape: 'object',
              properties: {
                name: { kind: 'text' },
                age: { kind: 'text' },
              },
              required: ['name'],
            },
          },
        ],
      },
    })
    const target = createNode({
      id: 'target',
      data: {
        ...createNode({}).data,
        inputPorts: [
          {
            id: 'payload',
            label: 'Payload',
            direction: 'input',
            dataType: 'json',
            required: true,
            multiple: false,
            maxConnections: null,
            schema: {
              kind: 'json',
              shape: 'object',
              properties: {
                name: { kind: 'text' },
                email: { kind: 'text' },
              },
              required: ['name', 'email'],
            },
          },
        ],
      },
    })

    const result = evaluateConnection([source, target], {
      source: 'source',
      sourceHandle: 'payload',
      target: 'target',
      targetHandle: 'payload',
    })

    expect(result.compatible).toBe(true)
    expect(result.edgeData.visualLevel).toBe('L1')
    expect(result.edgeData.reasonKey).toBe('需要字段映射')
    expect(result.edgeData.candidateMappings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourcePath: 'payload.name',
          targetPath: 'payload.name',
          autoRecommended: true,
        }),
      ])
    )
    expect(result.edgeData.metadata).toMatchObject({
      matchedRequiredCount: 1,
      totalRequiredCount: 2,
      unmappedRequiredCount: 1,
    })
    expect(result.edgeData.missingFields).toEqual([
      expect.objectContaining({ path: 'payload.email', required: true }),
    ])
  })

  it('returns error for incompatible data types', () => {
    const source = createNode({
      id: 'source',
      data: {
        ...createNode({}).data,
        outputPorts: [
          {
            id: 'image',
            label: 'Image',
            direction: 'output',
            dataType: 'image',
            required: false,
            multiple: false,
            maxConnections: null,
            schema: { kind: 'image' },
          },
        ],
      },
    })
    const target = createNode({
      id: 'target',
      data: {
        ...createNode({}).data,
        inputPorts: [
          {
            id: 'model',
            label: 'Model',
            direction: 'input',
            dataType: 'model',
            required: true,
            multiple: false,
            maxConnections: null,
            schema: { kind: 'model' },
          },
        ],
      },
    })

    const result = evaluateConnection([source, target], {
      source: 'source',
      sourceHandle: 'image',
      target: 'target',
      targetHandle: 'model',
    })

    expect(result.compatible).toBe(false)
    expect(result.edgeData.visualLevel).toBe('error')
    expect(result.edgeData.reasonKey).toBe('image → model')
  })

  it('AC1: tool→tool exact match succeeds for Agent tools port', () => {
    const toolProvider = createNode({
      id: 'tool-provider',
      data: {
        ...createNode({}).data,
        nodeType: 'http-tool',
        category: 'tool',
        outputPorts: [
          {
            id: 'tool-out',
            label: 'Tool Output',
            direction: 'output',
            dataType: 'tool',
            required: false,
            multiple: false,
            maxConnections: null,
            schema: { kind: 'tool' },
          },
        ],
      },
    })
    const agent = createNode({
      id: 'agent',
      data: {
        ...createNode({}).data,
        inputPorts: [
          {
            id: 'tools',
            label: 'Tools',
            direction: 'input',
            dataType: 'tool',
            required: false,
            multiple: true,
            maxConnections: null,
            schema: { kind: 'tool' },
          },
        ],
      },
    })

    const result = evaluateConnection([toolProvider, agent], {
      source: 'tool-provider',
      sourceHandle: 'tool-out',
      target: 'agent',
      targetHandle: 'tools',
    })

    expect(result.compatible).toBe(true)
    expect(result.edgeData.visualLevel).toBe('L0')
    expect(result.edgeData.rawCompatibilityLevel).toBe('EXACT')
  })

  it('AC2: multiple knowledge sources bind to Agent knowledge port', () => {
    const makeKnowledgeNode = (id: string) =>
      createNode({
        id,
        data: {
          ...createNode({}).data,
          nodeType: 'knowledge-base',
          category: 'knowledge',
          outputPorts: [
            {
              id: 'knowledge-out',
              label: 'Knowledge',
              direction: 'output',
              dataType: 'knowledge',
              required: false,
              multiple: true,
              maxConnections: null,
              schema: { kind: 'knowledge' },
            },
          ],
        },
      })

    const agent = createNode({
      id: 'agent',
      data: {
        ...createNode({}).data,
        inputPorts: [
          {
            id: 'knowledge',
            label: 'Knowledge',
            direction: 'input',
            dataType: 'knowledge',
            required: false,
            multiple: true,
            maxConnections: null,
            schema: { kind: 'knowledge' },
          },
        ],
      },
    })

    const kb1 = makeKnowledgeNode('kb1')
    const kb2 = makeKnowledgeNode('kb2')
    const kb3 = makeKnowledgeNode('kb3')
    const nodes = [kb1, kb2, kb3, agent]

    const existingEdges: Edge[] = [
      {
        id: 'e1',
        source: 'kb1',
        sourceHandle: 'knowledge-out',
        target: 'agent',
        targetHandle: 'knowledge',
      },
      {
        id: 'e2',
        source: 'kb2',
        sourceHandle: 'knowledge-out',
        target: 'agent',
        targetHandle: 'knowledge',
      },
    ]

    const result = evaluateConnection(
      nodes,
      {
        source: 'kb3',
        sourceHandle: 'knowledge-out',
        target: 'agent',
        targetHandle: 'knowledge',
      },
      existingEdges,
    )

    expect(result.compatible).toBe(true)
    expect(result.edgeData.visualLevel).toBe('L0')
  })

  it('AC3: rejects incompatible text→tool type mismatch', () => {
    const textSource = createNode({
      id: 'text-source',
      data: {
        ...createNode({}).data,
        outputPorts: [
          {
            id: 'text-out',
            label: 'Text Output',
            direction: 'output',
            dataType: 'text',
            required: false,
            multiple: false,
            maxConnections: null,
            schema: { kind: 'text' },
          },
        ],
      },
    })
    const agent = createNode({
      id: 'agent',
      data: {
        ...createNode({}).data,
        inputPorts: [
          {
            id: 'tools',
            label: 'Tools',
            direction: 'input',
            dataType: 'tool',
            required: false,
            multiple: true,
            maxConnections: null,
            schema: { kind: 'tool' },
          },
        ],
      },
    })

    const result = evaluateConnection([textSource, agent], {
      source: 'text-source',
      sourceHandle: 'text-out',
      target: 'agent',
      targetHandle: 'tools',
    })

    expect(result.compatible).toBe(false)
    expect(result.edgeData.visualLevel).toBe('error')
    expect(result.edgeData.reasonKey).toBe('text → tool')
  })

  it('AC3: enforces maxConnections and returns error with message', () => {
    const modelA = createNode({
      id: 'model-a',
      data: {
        ...createNode({}).data,
        nodeType: 'llm-model',
        category: 'agent',
        outputPorts: [
          {
            id: 'model-out',
            label: 'Model',
            direction: 'output',
            dataType: 'model',
            required: false,
            multiple: true,
            maxConnections: 5,
            schema: { kind: 'model' },
          },
        ],
      },
    })
    const modelB = createNode({
      id: 'model-b',
      data: {
        ...createNode({}).data,
        nodeType: 'llm-model',
        category: 'agent',
        outputPorts: [
          {
            id: 'model-out',
            label: 'Model',
            direction: 'output',
            dataType: 'model',
            required: false,
            multiple: true,
            maxConnections: 5,
            schema: { kind: 'model' },
          },
        ],
      },
    })
    const agent = createNode({
      id: 'agent',
      data: {
        ...createNode({}).data,
        inputPorts: [
          {
            id: 'model',
            label: 'Model',
            direction: 'input',
            dataType: 'model',
            required: true,
            multiple: false,
            maxConnections: 1,
            schema: { kind: 'model' },
          },
        ],
      },
    })

    const existingEdges: Edge[] = [
      {
        id: 'e-existing',
        source: 'model-a',
        sourceHandle: 'model-out',
        target: 'agent',
        targetHandle: 'model',
      },
    ]

    const result = evaluateConnection(
      [modelA, modelB, agent],
      {
        source: 'model-b',
        sourceHandle: 'model-out',
        target: 'agent',
        targetHandle: 'model',
      },
      existingEdges,
    )

    expect(result.compatible).toBe(false)
    expect(result.edgeData.visualLevel).toBe('error')
    expect(result.edgeData.reasonKey).toContain('最大连接数')
  })

  it('AC4: model→model match succeeds for Agent model port', () => {
    const modelNode = createNode({
      id: 'model-provider',
      data: {
        ...createNode({}).data,
        nodeType: 'llm-model',
        category: 'agent',
        outputPorts: [
          {
            id: 'model-out',
            label: 'Model',
            direction: 'output',
            dataType: 'model',
            required: false,
            multiple: true,
            maxConnections: 5,
            schema: { kind: 'model' },
          },
        ],
      },
    })
    const agent = createNode({
      id: 'agent',
      data: {
        ...createNode({}).data,
        inputPorts: [
          {
            id: 'model',
            label: 'Model',
            direction: 'input',
            dataType: 'model',
            required: true,
            multiple: false,
            maxConnections: 1,
            schema: { kind: 'model' },
          },
        ],
      },
    })

    const result = evaluateConnection([modelNode, agent], {
      source: 'model-provider',
      sourceHandle: 'model-out',
      target: 'agent',
      targetHandle: 'model',
    })

    expect(result.compatible).toBe(true)
    expect(result.edgeData.visualLevel).toBe('L0')
    expect(result.edgeData.rawCompatibilityLevel).toBe('EXACT')
  })
})
