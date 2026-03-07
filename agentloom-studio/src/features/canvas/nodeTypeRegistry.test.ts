import { describe, it, expect } from 'vitest'
import {
  NODE_TYPES,
  PORT_DATA_TYPE_META,
  getNodeTypeConfig,
  getNodeTypeConfigOrNull,
  getAllNodeTypes,
  clonePortDefinitions,
  buildPaletteGroups,
} from './nodeTypeRegistry'
import { PORT_DATA_TYPES } from './typeSchema'
import { NODE_CATEGORIES } from './components/nodeCategories'

describe('nodeTypeRegistry', () => {
  describe('NODE_TYPES', () => {
    it('应该包含 11 种节点类型', () => {
      expect(NODE_TYPES).toHaveLength(11)
    })

    it('应该包含所有预期的节点类型', () => {
      const expectedTypes = [
        'llm-agent', 'chat-agent', 'http-tool', 'code-tool',
        'manual-trigger', 'schedule-trigger',
        'knowledge-base', 'text-output', 'json-output', 'condition', 'loop',
      ]
      for (const t of expectedTypes) {
        expect(NODE_TYPES).toContain(t)
      }
    })
  })

  describe('PORT_DATA_TYPE_META', () => {
    it('应该为每种端口数据类型提供元数据', () => {
      for (const dt of PORT_DATA_TYPES) {
        const meta = PORT_DATA_TYPE_META[dt]
        expect(meta).toBeDefined()
        expect(meta.label).toBeTruthy()
        expect(meta.colorToken).toBeTruthy()
        expect(meta.shape).toBeTruthy()
      }
    })

    it('端口数据类型元数据应有 8 个条目', () => {
      expect(Object.keys(PORT_DATA_TYPE_META)).toHaveLength(8)
    })
  })

  describe('getNodeTypeConfig', () => {
    it('应该返回已知节点类型的配置', () => {
      const config = getNodeTypeConfig('llm-agent')
      expect(config.type).toBe('llm-agent')
      expect(config.category).toBe('agent')
      expect(config.label).toBe('LLM Agent')
      expect(config.icon).toBeTruthy()
      expect(config.description).toBeTruthy()
      expect(config.colorToken).toBeTruthy()
      expect(config.inputPorts.length).toBeGreaterThan(0)
      expect(config.outputPorts.length).toBeGreaterThan(0)
    })

    it('应该对所有 11 种节点类型都能返回配置', () => {
      for (const type of NODE_TYPES) {
        const config = getNodeTypeConfig(type)
        expect(config.type).toBe(type)
      }
    })

    it('应该对未知节点类型抛出错误', () => {
      expect(() => getNodeTypeConfig('unknown-type' as never)).toThrow()
    })
  })

  describe('getNodeTypeConfigOrNull', () => {
    it('应该返回已知类型的配置', () => {
      const config = getNodeTypeConfigOrNull('llm-agent')
      expect(config).not.toBeNull()
      expect(config!.type).toBe('llm-agent')
    })

    it('应该对未知类型返回 null', () => {
      expect(getNodeTypeConfigOrNull('unknown-type')).toBeNull()
    })
  })

  describe('getAllNodeTypes', () => {
    it('应该返回所有 11 种节点类型的配置', () => {
      const configs = getAllNodeTypes()
      expect(configs).toHaveLength(11)
    })

    it('返回的配置类型应唯一', () => {
      const configs = getAllNodeTypes()
      const types = configs.map((c) => c.type)
      expect(new Set(types).size).toBe(types.length)
    })
  })

  describe('clonePortDefinitions', () => {
    it('应该返回深拷贝的端口定义', () => {
      const config = getNodeTypeConfig('llm-agent')
      const cloned = clonePortDefinitions(config.inputPorts)

      expect(cloned).toHaveLength(config.inputPorts.length)
      expect(cloned).not.toBe(config.inputPorts)
      cloned.forEach((port, i) => {
        expect(port).not.toBe(config.inputPorts[i])
        expect(port.id).toBe(config.inputPorts[i]!.id)
        expect(port.label).toBe(config.inputPorts[i]!.label)
        expect(port.dataType).toBe(config.inputPorts[i]!.dataType)
      })
    })

    it('修改克隆端口不应影响原始端口', () => {
      const config = getNodeTypeConfig('llm-agent')
      const cloned = clonePortDefinitions(config.inputPorts)

      if (cloned.length > 0) {
        cloned[0]!.label = 'MUTATED'
        expect(config.inputPorts[0]!.label).not.toBe('MUTATED')
      }
    })
  })

  describe('buildPaletteGroups', () => {
    it('应该生成 6 个调色板分组', () => {
      const groups = buildPaletteGroups(NODE_CATEGORIES)
      expect(groups).toHaveLength(6)
    })

    it('分组顺序应为 agent → tool → trigger → knowledge → output → control', () => {
      const groups = buildPaletteGroups(NODE_CATEGORIES)
      const categories = groups.map((g) => g.category)
      expect(categories).toEqual([
        'agent', 'tool', 'trigger', 'knowledge', 'output', 'control',
      ])
    })

    it('每个分组至少有一个节点项', () => {
      const groups = buildPaletteGroups(NODE_CATEGORIES)
      for (const group of groups) {
        expect(group.items.length).toBeGreaterThan(0)
      }
    })

    it('Agent 分组应包含 LLM Agent 和 Chat Agent', () => {
      const groups = buildPaletteGroups(NODE_CATEGORIES)
      const agentGroup = groups.find((g) => g.category === 'agent')
      expect(agentGroup).toBeDefined()

      const types = agentGroup!.items.map((i) => i.type)
      expect(types).toContain('llm-agent')
      expect(types).toContain('chat-agent')
    })

    it('调色板项应包含完整的类型信息', () => {
      const groups = buildPaletteGroups(NODE_CATEGORIES)
      for (const group of groups) {
        for (const item of group.items) {
          expect(item.type).toBeTruthy()
          expect(item.label).toBeTruthy()
          expect(item.category).toBe(group.category)
          expect(item.icon).toBeTruthy()
          expect(item.description).toBeTruthy()
        }
      }
    })
  })

  describe('节点类型配置完整性', () => {
    it('每种节点类型应有必要字段', () => {
      const configs = getAllNodeTypes()
      for (const config of configs) {
        expect(config.type).toBeTruthy()
        expect(config.category).toBeTruthy()
        expect(config.label).toBeTruthy()
        expect(config.icon).toBeTruthy()
        expect(config.description).toBeTruthy()
        expect(config.colorToken).toBeTruthy()
        expect(Array.isArray(config.inputPorts)).toBe(true)
        expect(Array.isArray(config.outputPorts)).toBe(true)
      }
    })

    it('端口定义应有正确的方向标记', () => {
      const configs = getAllNodeTypes()
      for (const config of configs) {
        for (const port of config.inputPorts) {
          expect(port.direction).toBe('input')
        }
        for (const port of config.outputPorts) {
          expect(port.direction).toBe('output')
        }
      }
    })

    it('端口 ID 在同一节点类型内应唯一', () => {
      const configs = getAllNodeTypes()
      for (const config of configs) {
        const allPorts = [...config.inputPorts, ...config.outputPorts]
        const ids = allPorts.map((p) => p.id)
        expect(new Set(ids).size).toBe(ids.length)
      }
    })
  })
})
