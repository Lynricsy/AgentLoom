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
    it('builds input ports from metadata and always includes tool output', () => {
      const metadata: BackendPortMappingMetadata = {
        inputs: [
          { name: 'query', dataType: 'text', description: '搜索词', required: true },
          { name: 'modelConfig', dataType: 'model', description: '模型标识' },
          { name: 'selectedTool', dataType: 'tool', description: '目标工具' },
          { name: 'sandboxSession', dataType: 'sandbox', description: '沙箱会话' },
          { name: 'knowledgeBase', dataType: 'knowledge', description: '知识库' },
          { name: 'limit', dataType: 'number', description: '结果数量' },
        ],
        outputs: [{ name: 'results', dataType: 'json' }],
      }

      const { inputPorts, outputPorts } = buildMcpToolPorts(metadata)

      expect(inputPorts).toHaveLength(6)
      expect(inputPorts[0]).toMatchObject({ id: 'query', dataType: 'text', direction: 'input', required: true })
      expect(inputPorts[1]).toMatchObject({ id: 'modelConfig', dataType: 'model', direction: 'input', required: false })
      expect(inputPorts[2]).toMatchObject({ id: 'selectedTool', dataType: 'tool', direction: 'input', required: false })
      expect(inputPorts[3]).toMatchObject({ id: 'sandboxSession', dataType: 'sandbox', direction: 'input', required: false })
      expect(inputPorts[4]).toMatchObject({ id: 'knowledgeBase', dataType: 'knowledge', direction: 'input', required: false })
      expect(inputPorts[5]).toMatchObject({ id: 'limit', dataType: 'json', direction: 'input', required: false })

      expect(outputPorts).toHaveLength(1)
      expect(outputPorts[0]).toMatchObject({ id: 'tool-output', dataType: 'tool', direction: 'output' })
    })

    it('returns only tool output when metadata is null', () => {
      const { inputPorts, outputPorts } = buildMcpToolPorts(null)

      expect(inputPorts).toHaveLength(0)
      expect(outputPorts).toHaveLength(1)
      expect(outputPorts[0]!.dataType).toBe('tool')
    })

    it('returns only tool output when metadata has empty inputs', () => {
      const metadata: BackendPortMappingMetadata = { inputs: [], outputs: [] }

      const { inputPorts, outputPorts } = buildMcpToolPorts(metadata)

      expect(inputPorts).toHaveLength(0)
      expect(outputPorts).toHaveLength(1)
    })
  })
})
