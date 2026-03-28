import { describe, expect, it } from 'vitest'
import {
  buildMcpToolPorts,
  mapBackendDataType,
  mapPortMappingToPortDefinition,
  type BackendPortMapping,
} from '../mcpToolMapping'

describe('mcpToolMapping', () => {
  describe('mapBackendDataType', () => {
    it.each([
      ['model', 'model'],
      ['text', 'text'],
      ['json', 'json'],
      ['image', 'image'],
      ['audio', 'audio'],
      ['tool', 'tool'],
      ['sandbox', 'sandbox'],
      ['knowledge', 'knowledge'],
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
        dataType: 'tool',
      }

      const port = mapPortMappingToPortDefinition(mapping, 'output')

      expect(port).toMatchObject({
        id: 'result',
        label: 'result',
        direction: 'output',
        dataType: 'tool',
        required: false,
      })
      expect(port.schema).toMatchObject({ kind: 'tool' })
    })

    it.each(['number', 'boolean'] as const)(
      'maps legacy %s dataType to json with object schema',
      (dataType) => {
        const mapping: BackendPortMapping = { name: 'count', dataType }

        const port = mapPortMappingToPortDefinition(mapping, 'input')

        expect(port.dataType).toBe('json')
        expect(port.schema.kind).toBe('json')
      },
    )
  })

  describe('buildMcpToolPorts', () => {
    it('returns empty inputPorts and a single tool output port', () => {
      const { inputPorts, outputPorts } = buildMcpToolPorts()

      expect(inputPorts).toHaveLength(0)
      expect(outputPorts).toHaveLength(1)
      expect(outputPorts[0]).toMatchObject({ id: 'tool-output', dataType: 'tool', direction: 'output' })
    })
  })
})
