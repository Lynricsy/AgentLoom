import { describe, expect, it } from 'vitest'
import type { CanvasNode } from '../types'
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
})
