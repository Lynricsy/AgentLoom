import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CanvasNode } from '../types'
import type { TypeEngineServiceLike } from './typeEngine/contracts'
import { setTypeEngineServiceForTesting } from './typeEngine/service'
import {
  adaptCompatibilityToEdgeData,
  arePortDataTypesCompatible,
  evaluateConnection,
  getCachedConnectionEvaluation,
  mergeEdgeDataWithStoredMappings,
  resolveConnectionPorts,
} from './connectionCompatibility'

function createNode(overrides: Partial<CanvasNode>): CanvasNode {
  return {
    id: 'node',
    type: 'agent',
    position: { x: 0, y: 0 },
    data: {
      label: 'Node',
      nodeType: 'agent',
      category: 'agent',
      config: {},
      inputPorts: [],
      outputPorts: [],
    },
    ...overrides,
  }
}

const evaluateCompatibilityMock = vi.fn()
const getCachedCompatibilityMock = vi.fn()

const mockService: TypeEngineServiceLike = {
  warmup: vi.fn(async () => undefined),
  getCachedCompatibility: (sourcePort, targetPort) =>
    getCachedCompatibilityMock(sourcePort, targetPort),
  evaluateCompatibility: (sourcePort, targetPort, context) =>
    evaluateCompatibilityMock(sourcePort, targetPort, context),
  getRuntimeState: () => ({
    wasmReady: false,
    workerBusy: false,
    lastError: null,
  }),
}

describe('connectionCompatibility', () => {
  beforeEach(() => {
    evaluateCompatibilityMock.mockReset()
    getCachedCompatibilityMock.mockReset()
    setTypeEngineServiceForTesting(mockService)
  })

  it('resolveConnectionPorts resolves source and target ports', () => {
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

    const resolved = resolveConnectionPorts([source, target], {
      source: 'source',
      sourceHandle: 'result',
      target: 'target',
      targetHandle: 'input',
    })

    expect(resolved).not.toBeNull()
    expect(resolved?.source.port.id).toBe('result')
    expect(resolved?.target.port.id).toBe('input')
  })

  it('adapts partial TypeEngine results into stable CanvasEdgeData', () => {
    const edgeData = adaptCompatibilityToEdgeData(
      {
        level: 'PARTIAL',
        reason: 'partial_field_match',
        transformFn: null,
        conflictPath: null,
        missingFields: [
          {
            path: 'email',
            expectedType: { kind: 'text', title: 'Email' },
            required: true,
          },
        ],
        candidateMappings: [
          {
            sourcePath: 'contactEmail',
            targetPath: 'email',
            confidence: 0.8,
            autoRecommended: false,
          },
        ],
        metadata: {
          matchedRatio: 0.5,
          matchedRequiredCount: 1,
          totalRequiredCount: 2,
          unmappedRequiredCount: 1,
        },
      },
      {
        id: 'payload-out',
        label: 'Payload Out',
        direction: 'output',
        dataType: 'json',
        required: false,
        multiple: false,
        maxConnections: null,
        schema: {
          kind: 'json',
          shape: 'object',
          properties: {
            contactEmail: { kind: 'text' },
          },
          required: ['contactEmail'],
        },
      },
      {
        id: 'payload-in',
        label: 'Payload In',
        direction: 'input',
        dataType: 'json',
        required: true,
        multiple: false,
        maxConnections: null,
        schema: {
          kind: 'json',
          shape: 'object',
          properties: {
            email: { kind: 'text' },
          },
          required: ['email'],
        },
      },
    )

    expect(edgeData.rawCompatibilityLevel).toBe('PARTIAL')
    expect(edgeData.visualLevel).toBe('L1')
    expect(edgeData.reasonKey).toBe('partial_field_match')
    expect(edgeData.candidateMappings).toEqual([
      {
        sourcePath: 'payload-out.contactEmail',
        targetPath: 'payload-in.email',
        confidence: 0.8,
        autoRecommended: false,
      },
    ])
    expect(edgeData.missingFields).toEqual([
      {
        path: 'payload-in.email',
        expectedType: { kind: 'text', title: 'Email' },
        required: true,
      },
    ])
    expect(edgeData.metadata).toEqual({
      matchedRatio: 0.5,
      matchedRequiredCount: 1,
      totalRequiredCount: 2,
      unmappedRequiredCount: 1,
    })
    expect(edgeData.mappingSummary).toEqual({
      autoMatchedCount: 0,
      manualCount: 0,
      requiredUnmappedCount: 1,
    })
  })

  it('maps exact / transform / incompatible levels to visual levels', () => {
    const sourcePort = {
      id: 'source',
      label: 'Source',
      direction: 'output' as const,
      dataType: 'text' as const,
      required: false,
      multiple: false,
      maxConnections: null,
      schema: { kind: 'text' as const },
    }
    const targetPort = {
      id: 'target',
      label: 'Target',
      direction: 'input' as const,
      dataType: 'text' as const,
      required: true,
      multiple: false,
      maxConnections: null,
      schema: { kind: 'text' as const },
    }

    expect(
      adaptCompatibilityToEdgeData(
        {
          level: 'EXACT',
          reason: null,
          transformFn: null,
          conflictPath: null,
          missingFields: [],
          candidateMappings: [],
          metadata: {},
        },
        sourcePort,
        targetPort,
      ).visualLevel,
    ).toBe('L0')

    expect(
      adaptCompatibilityToEdgeData(
        {
          level: 'TRANSFORM',
          reason: 'text_to_json_parse',
          transformFn: 'parse_json',
          conflictPath: null,
          missingFields: [],
          candidateMappings: [],
          metadata: { matchedRatio: 1 },
        },
        sourcePort,
        { ...targetPort, dataType: 'json', schema: { kind: 'json', shape: 'object', properties: {} } },
      ).visualLevel,
    ).toBe('L1')

    expect(
      adaptCompatibilityToEdgeData(
        {
          level: 'INCOMPATIBLE',
          reason: 'type_mismatch_no_transform',
          transformFn: null,
          conflictPath: 'root.kind',
          missingFields: [],
          candidateMappings: [],
          metadata: {},
        },
        sourcePort,
        { ...targetPort, dataType: 'image', schema: { kind: 'image' } },
      ).visualLevel,
    ).toBe('error')
  })

  it('returns synchronous guard errors before consulting the service', () => {
    const node = createNode({
      id: 'node-1',
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
            maxConnections: 1,
            schema: { kind: 'text' },
          },
        ],
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

    const selfResult = getCachedConnectionEvaluation([node], {
      source: 'node-1',
      sourceHandle: 'result',
      target: 'node-1',
      targetHandle: 'input',
    })

    expect(selfResult).toMatchObject({
      compatible: false,
      edgeData: {
        visualLevel: 'error',
        reasonKey: '节点不能连接到自身',
      },
    })
    expect(getCachedCompatibilityMock).not.toHaveBeenCalled()
  })

  it('returns cached compatibility data synchronously when available', () => {
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

    getCachedCompatibilityMock.mockReturnValue({
      level: 'INCOMPATIBLE',
      reason: 'type_mismatch_no_transform',
      transformFn: null,
      conflictPath: 'root.kind',
      missingFields: [],
      candidateMappings: [],
      metadata: {},
    })

    const result = getCachedConnectionEvaluation([source, target], {
      source: 'source',
      sourceHandle: 'result',
      target: 'target',
      targetHandle: 'input',
    })

    expect(result).toMatchObject({
      compatible: false,
      edgeData: {
        rawCompatibilityLevel: 'INCOMPATIBLE',
        visualLevel: 'error',
        reasonKey: 'type_mismatch_no_transform',
      },
    })
  })

  it('awaits authoritative compatibility data from the service', async () => {
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
            id: 'payload',
            label: 'Payload',
            direction: 'input',
            dataType: 'json',
            required: true,
            multiple: false,
            maxConnections: null,
            schema: { kind: 'json', shape: 'object', properties: {} },
          },
        ],
      },
    })

    evaluateCompatibilityMock.mockResolvedValue({
      level: 'TRANSFORM',
      reason: 'text_to_json_parse',
      transformFn: 'parse_json',
      conflictPath: null,
      missingFields: [],
      candidateMappings: [],
      metadata: { matchedRatio: 1 },
    })

    const result = await evaluateConnection([source, target], {
      source: 'source',
      sourceHandle: 'result',
      target: 'target',
      targetHandle: 'payload',
    })

    expect(result.compatible).toBe(true)
    expect(result.edgeData).toMatchObject({
      rawCompatibilityLevel: 'TRANSFORM',
      visualLevel: 'L1',
      reasonKey: 'text_to_json_parse',
      transformFn: 'parse_json',
      metadata: { matchedRatio: 1 },
    })
    expect(evaluateCompatibilityMock).toHaveBeenCalledOnce()
  })

  it('preserves still-valid field mappings when edge data is refreshed', () => {
    const sourcePort = {
      id: 'payload-out',
      label: 'Payload Out',
      direction: 'output' as const,
      dataType: 'json' as const,
      required: false,
      multiple: false,
      maxConnections: null,
      schema: {
        kind: 'json' as const,
        shape: 'object' as const,
        properties: {
          name: { kind: 'text' as const },
          email: { kind: 'text' as const },
        },
        required: ['name'],
      },
    }
    const targetPort = {
      id: 'payload-in',
      label: 'Payload In',
      direction: 'input' as const,
      dataType: 'json' as const,
      required: true,
      multiple: false,
      maxConnections: null,
      schema: {
        kind: 'json' as const,
        shape: 'object' as const,
        properties: {
          name: { kind: 'text' as const },
          email: { kind: 'text' as const },
        },
        required: ['name', 'email'],
      },
    }

    const refreshed = mergeEdgeDataWithStoredMappings(
      sourcePort,
      targetPort,
      adaptCompatibilityToEdgeData(
        {
          level: 'PARTIAL',
          reason: 'partial_field_match',
          transformFn: null,
          conflictPath: null,
          missingFields: [
            {
              path: 'email',
              expectedType: { kind: 'text', title: 'Email' },
              required: true,
            },
          ],
          candidateMappings: [],
          metadata: {
            matchedRatio: 0.5,
            matchedRequiredCount: 1,
            totalRequiredCount: 2,
            unmappedRequiredCount: 1,
          },
        },
        sourcePort,
        targetPort,
      ),
      {
        ...adaptCompatibilityToEdgeData(
          {
            level: 'PARTIAL',
            reason: 'partial_field_match',
            transformFn: null,
            conflictPath: null,
            missingFields: [],
            candidateMappings: [],
            metadata: {},
          },
          sourcePort,
          targetPort,
        ),
        fieldMapping: [
          {
            sourceField: 'payload-out.name',
            targetField: 'payload-in.name',
            compatLevel: 'L1',
            autoRecommended: true,
          },
          {
            sourceField: 'payload-out.legacy',
            targetField: 'payload-in.email',
            compatLevel: 'L1',
            autoRecommended: false,
          },
        ],
      },
    )

    expect(refreshed.fieldMapping).toEqual([
      {
        sourceField: 'payload-out.name',
        targetField: 'payload-in.name',
        compatLevel: 'L1',
        autoRecommended: true,
      },
    ])
    expect(refreshed.mappingSummary).toEqual({
      autoMatchedCount: 1,
      manualCount: 0,
      requiredUnmappedCount: 1,
    })
  })
})

describe('arePortDataTypesCompatible', () => {
  it('同类型恒兼容', () => {
    expect(arePortDataTypesCompatible('json', 'json')).toBe(true)
    expect(arePortDataTypesCompatible('array', 'array')).toBe(true)
  })

  it('放行 contracts canonical 表的三条变换', () => {
    expect(arePortDataTypesCompatible('text', 'json')).toBe(true)
    expect(arePortDataTypesCompatible('json', 'text')).toBe(true)
    expect(arePortDataTypesCompatible('skill', 'text')).toBe(true)
  })

  it('json 与 array 之间不再互通（同步 guard 曾比深层求值更宽松）', () => {
    expect(arePortDataTypesCompatible('json', 'array')).toBe(false)
    expect(arePortDataTypesCompatible('array', 'json')).toBe(false)
  })

  it('exec / volume / memory 保持专有严格匹配', () => {
    expect(arePortDataTypesCompatible('exec', 'exec')).toBe(true)
    expect(arePortDataTypesCompatible('exec', 'json')).toBe(false)
    expect(arePortDataTypesCompatible('volume', 'volume')).toBe(true)
    expect(arePortDataTypesCompatible('volume', 'json')).toBe(false)
    expect(arePortDataTypesCompatible('memory', 'memory')).toBe(true)
    expect(arePortDataTypesCompatible('json', 'memory')).toBe(false)
  })
})
