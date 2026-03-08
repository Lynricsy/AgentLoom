import { describe, expect, it } from 'vitest'
import { buildPaletteGroups } from '../components/nodeCategories'
import { PORT_DATA_TYPES } from './typeSchema'
import {
  clonePortDefinitions,
  getAllNodeTypes,
  getNodeTypeConfig,
  getNodeTypeConfigOrNull,
  NODE_TYPE_REGISTRY,
  NODE_TYPES,
  PORT_DATA_TYPE_META,
  type NodeType,
  type PortDefinition,
} from './nodeTypeRegistry'

describe('nodeTypeRegistry', () => {
  it('exports all supported node types in a stable order', () => {
    expect(NODE_TYPES).toEqual([
      'llm-agent',
      'chat-agent',
      'llm-model',
      'http-tool',
      'code-tool',
      'manual-trigger',
      'schedule-trigger',
      'knowledge-base',
      'text-output',
      'json-output',
      'condition',
      'loop',
    ])
  })

  it('keeps port type metadata aligned with the supported data types', () => {
    expect(Object.keys(PORT_DATA_TYPE_META).sort()).toEqual([...PORT_DATA_TYPES].sort())
    expect(PORT_DATA_TYPE_META.model).toEqual({
      label: 'Model',
      colorToken: 'var(--color-type-model)',
      shape: 'circle',
    })
    expect(PORT_DATA_TYPE_META.text).toEqual({
      label: 'Text',
      colorToken: 'var(--color-type-text)',
      shape: 'circle',
    })
    expect(PORT_DATA_TYPE_META.json).toEqual({
      label: 'JSON',
      colorToken: 'var(--color-type-json)',
      shape: 'square',
    })
    expect(PORT_DATA_TYPE_META.image).toEqual({
      label: 'Image',
      colorToken: 'var(--color-type-image)',
      shape: 'diamond',
    })
    expect(PORT_DATA_TYPE_META.audio).toEqual({
      label: 'Audio',
      colorToken: 'var(--color-type-audio)',
      shape: 'capsule',
    })
    expect(PORT_DATA_TYPE_META.tool).toEqual({
      label: 'Tool',
      colorToken: 'var(--color-type-tool)',
      shape: 'hexagon',
    })
    expect(PORT_DATA_TYPE_META.sandbox).toEqual({
      label: 'Sandbox',
      colorToken: 'var(--color-type-sandbox)',
      shape: 'triangle',
    })
    expect(PORT_DATA_TYPE_META.knowledge).toEqual({
      label: 'Knowledge',
      colorToken: 'var(--color-type-knowledge)',
      shape: 'book',
    })
  })

  it('returns configs for known node types and throws for unknown types', () => {
    const config = getNodeTypeConfig('llm-agent')
    const systemPrompt = config.configSchema.properties.systemPrompt

    if (!systemPrompt) {
      throw new Error('Expected llm-agent to expose a systemPrompt field')
    }

    expect(config.type).toBe('llm-agent')
    expect(systemPrompt.title).toBe('System Prompt')
    expect(() => getNodeTypeConfig('unknown-node' as NodeType)).toThrow('Unknown node type')
  })

  it('returns null for unknown node types in safe lookups', () => {
    expect(getNodeTypeConfigOrNull('llm-agent')?.label).toBe('LLM Agent')
    expect(getNodeTypeConfigOrNull('not-real')).toBeNull()
  })

  it('exposes every registry entry through ordered helpers and palette groups', () => {
    const orderedTypes = getAllNodeTypes().map((config) => config.type)
    const groupedTypes = buildPaletteGroups().flatMap((group) => group.items.map((item) => item.type))

    expect(orderedTypes).toEqual([...NODE_TYPES])
    expect(groupedTypes).toEqual([...NODE_TYPES])
    expect(Object.keys(NODE_TYPE_REGISTRY).sort()).toEqual([...NODE_TYPES].sort())
  })

  it('deep clones nested port schemas when duplicating definitions', () => {
    const ports: PortDefinition[] = [
      {
        id: 'payload',
        label: 'Payload',
        direction: 'input',
        dataType: 'json',
        required: false,
        multiple: false,
        maxConnections: 1,
        schema: {
          kind: 'json',
          shape: 'object',
          title: 'Payload',
          properties: {
            items: {
              kind: 'json',
              shape: 'array',
              title: 'Items',
              items: {
                kind: 'text',
                title: 'Item',
              },
            },
          },
          additionalProperties: false,
        },
      },
    ]

    const cloned = clonePortDefinitions(ports)
    const originalPort = ports[0]
    const clonedPort = cloned[0]

    if (!originalPort || !clonedPort) {
      throw new Error('Expected cloned port definitions to contain one port')
    }

    expect(cloned).not.toBe(ports)
    expect(clonedPort).not.toBe(originalPort)
    expect(clonedPort.schema).not.toBe(originalPort.schema)

    const originalSchema = originalPort.schema
    const clonedSchema = clonedPort.schema

    if (originalSchema.kind !== 'json' || originalSchema.shape !== 'object') {
      throw new Error('Expected original schema to be a JSON object schema')
    }

    if (clonedSchema.kind !== 'json' || clonedSchema.shape !== 'object') {
      throw new Error('Expected cloned schema to be a JSON object schema')
    }

    expect(clonedSchema.properties.items).not.toBe(originalSchema.properties.items)

    const clonedItems = clonedSchema.properties.items
    const originalItems = originalSchema.properties.items

    if (
      !clonedItems ||
      clonedItems.kind !== 'json' ||
      clonedItems.shape !== 'array' ||
      !originalItems ||
      originalItems.kind !== 'json' ||
      originalItems.shape !== 'array'
    ) {
      throw new Error('Expected nested items schema to be a JSON array schema')
    }

    expect(clonedItems.items).not.toBe(originalItems.items)
  })
})
