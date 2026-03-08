import { describe, expect, it } from 'vitest'
import {
  buildMcpToolPorts,
  mapBackendDataType,
  mapPortMappingToPortDefinition,
  type BackendPortMapping,
  type BackendPortMappingMetadata,
} from '../mcpToolMapping'

describe('mcpToolMapping', () => {
  describe('mapBackendDataType', () => {
    it.each([
      ['text', 'text'],
      ['json', 'json'],
      ['image', 'image'],
      ['audio', 'audio'],
      ['number', 'json'],
      ['boolean', 'json'],
    ] as const)('maps backend "%s" to frontend "%s"', (backend, expected) => {
      expect(mapBackendDataType(backend)).toBe(expected)
    })
  })

  describe('mapPortMappingToPortDefinition', () => {
    it('creates an input PortDefinition from a BackendPortMapping', () => {
      const mapping: BackendPortMapping = {
        name: 'query',
        dataType: 'text',
        description: '搜索关键词',
        required: true,
      }

      const port = mapPortMappingToPortDefinition(mapping, 'input')

      expect(port).toMatchObject({
        id: 'query',
        label: 'query',
        direction: 'input',
        dataType: 'text',
        description: '搜索关键词',
        required: true,
      })
      expect(port.schema.kind).toBe('text')
    })

    it('creates an output PortDefinition from a BackendPortMapping', () => {
      const mapping: BackendPortMapping = {
        name: 'result',
        dataType: 'json',
      }

      const port = mapPortMappingToPortDefinition(mapping, 'output')

      expect(port).toMatchObject({
        id: 'result',
        label: 'result',
        direction: 'output',
        dataType: 'json',
        required: false,
      })
      expect(port.schema).toMatchObject({ kind: 'json', shape: 'object' })
    })

    it('maps number dataType to json with object schema', () => {
      const mapping: BackendPortMapping = { name: 'count', dataType: 'number' }

      const port = mapPortMappingToPortDefinition(mapping, 'input')

      expect(port.dataType).toBe('json')
      expect(port.schema.kind).toBe('json')
    })
  })

  describe('buildMcpToolPorts', () => {
    it('builds input ports from metadata and always includes tool output', () => {
      const metadata: BackendPortMappingMetadata = {
        inputs: [
          { name: 'query', dataType: 'text', description: '搜索词', required: true },
          { name: 'limit', dataType: 'number', description: '结果数量' },
        ],
        outputs: [{ name: 'results', dataType: 'json' }],
      }

      const { inputPorts, outputPorts } = buildMcpToolPorts(metadata)

      expect(inputPorts).toHaveLength(2)
      expect(inputPorts[0]).toMatchObject({ id: 'query', dataType: 'text', direction: 'input', required: true })
      expect(inputPorts[1]).toMatchObject({ id: 'limit', dataType: 'json', direction: 'input', required: false })

      expect(outputPorts).toHaveLength(1)
      expect(outputPorts[0]).toMatchObject({ id: 'tool-output', dataType: 'tool', direction: 'output' })
    })

    it('returns only tool output when metadata is null', () => {
      const { inputPorts, outputPorts } = buildMcpToolPorts(null)

      expect(inputPorts).toHaveLength(0)
      expect(outputPorts).toHaveLength(1)
      expect(outputPorts[0].dataType).toBe('tool')
    })

    it('returns only tool output when metadata has empty inputs', () => {
      const metadata: BackendPortMappingMetadata = { inputs: [], outputs: [] }

      const { inputPorts, outputPorts } = buildMcpToolPorts(metadata)

      expect(inputPorts).toHaveLength(0)
      expect(outputPorts).toHaveLength(1)
    })
  })
})
