import { describe, it, expect } from 'vitest'
import { createDefaultAgentNodeData } from '../../types'
import type { AgentNodeData, AgentModelConfig } from '../../types'
import { getNodeTypeConfig } from '../nodeTypeRegistry'
import type { PortDefinition } from '../nodeTypeRegistry'

function findPort(ports: PortDefinition[], id: string): PortDefinition {
  const port = ports.find((p) => p.id === id)
  if (!port) throw new Error(`port '${id}' not found`)
  return port
}

describe('createDefaultAgentNodeData', () => {
  it('返回所有 Agent 专属字段的默认值', () => {
    const defaults = createDefaultAgentNodeData()

    expect(defaults.modelConfig).toEqual<AgentModelConfig>({
      connectedModelNodeId: null,
    })

    expect(defaults.autonomyConfig).toEqual({})
    expect(defaults.outputFormatStrategy).toEqual({})

    expect(defaults.toolBindings).toEqual([])
    expect(defaults.knowledgeBindings).toEqual([])
  })

  it('返回的对象与 AgentNodeData 部分字段类型兼容', () => {
    const defaults = createDefaultAgentNodeData()

    const partial: Pick<
      AgentNodeData,
      | 'modelConfig'
      | 'autonomyConfig'
      | 'outputFormatStrategy'
      | 'toolBindings'
      | 'knowledgeBindings'
    > = defaults

    expect(partial).toBeDefined()
  })

  it('autonomyConfig / outputFormatStrategy 可自由扩展', () => {
    const defaults = createDefaultAgentNodeData()

    const extended: AgentNodeData['autonomyConfig'] = {
      ...defaults.autonomyConfig,
      maxIterations: 5,
      earlyStop: true,
    }
    expect(extended).toHaveProperty('maxIterations', 5)

    const format: AgentNodeData['outputFormatStrategy'] = {
      ...defaults.outputFormatStrategy,
      type: 'markdown',
    }
    expect(format).toHaveProperty('type', 'markdown')
  })

  it('每次调用返回全新实例（无共享引用）', () => {
    const a = createDefaultAgentNodeData()
    const b = createDefaultAgentNodeData()

    expect(a).not.toBe(b)
    expect(a.modelConfig).not.toBe(b.modelConfig)
    expect(a.toolBindings).not.toBe(b.toolBindings)
    expect(a.knowledgeBindings).not.toBe(b.knowledgeBindings)
    expect(a.autonomyConfig).not.toBe(b.autonomyConfig)
    expect(a.outputFormatStrategy).not.toBe(b.outputFormatStrategy)
  })
})

describe('llm-agent 端口定义', () => {
  const agentType = getNodeTypeConfig('llm-agent')

  it('包含 9 个输入端口和 4 个输出端口', () => {
    expect(agentType.inputPorts).toHaveLength(9)
    expect(agentType.outputPorts).toHaveLength(4)
  })

  describe('输入端口', () => {
    it('tools 端口: tool 类型, multiple, 无连接上限', () => {
      const port = findPort(agentType.inputPorts, 'tools')
      expect(port.dataType).toBe('tool')
      expect(port.multiple).toBe(true)
      expect(port.maxConnections).toBeNull()
      expect(port.required).toBe(false)
    })

    it('knowledge 端口: knowledge 类型, multiple, 无连接上限', () => {
      const port = findPort(agentType.inputPorts, 'knowledge')
      expect(port.dataType).toBe('knowledge')
      expect(port.multiple).toBe(true)
      expect(port.maxConnections).toBeNull()
    })

    it('sandbox 端口: sandbox 类型, 单连接', () => {
      const port = findPort(agentType.inputPorts, 'sandbox')
      expect(port.dataType).toBe('sandbox')
      expect(port.multiple).toBe(false)
      expect(port.maxConnections).toBe(1)
    })

    it('model 端口: model 类型, required', () => {
      const port = findPort(agentType.inputPorts, 'model')
      expect(port.dataType).toBe('model')
      expect(port.required).toBe(true)
      expect(port.maxConnections).toBe(1)
    })

    it('context 端口: json 类型', () => {
      const port = findPort(agentType.inputPorts, 'context')
      expect(port.dataType).toBe('json')
    })

    it('system-prompt 端口: text 类型', () => {
      const port = findPort(agentType.inputPorts, 'system-prompt')
      expect(port.dataType).toBe('text')
    })

    it('tool-results 端口: json 类型, multiple, 无连接上限', () => {
      const port = findPort(agentType.inputPorts, 'tool-results')
      expect(port.dataType).toBe('json')
      expect(port.multiple).toBe(true)
      expect(port.maxConnections).toBeNull()
    })

    it('trigger-payload 端口: json 类型', () => {
      const port = findPort(agentType.inputPorts, 'trigger-payload')
      expect(port.dataType).toBe('json')
    })

    it('memory 端口: json 类型', () => {
      const port = findPort(agentType.inputPorts, 'memory')
      expect(port.dataType).toBe('json')
    })
  })

  describe('输出端口', () => {
    it('final-output 端口: text 类型, multiple, 无连接上限', () => {
      const port = findPort(agentType.outputPorts, 'final-output')
      expect(port.dataType).toBe('text')
      expect(port.multiple).toBe(true)
      expect(port.maxConnections).toBeNull()
    })

    it('structured-output 端口: json 类型, multiple, 无连接上限', () => {
      const port = findPort(agentType.outputPorts, 'structured-output')
      expect(port.dataType).toBe('json')
      expect(port.multiple).toBe(true)
      expect(port.maxConnections).toBeNull()
    })

    it('telemetry 端口: json 类型, multiple, 无连接上限', () => {
      const port = findPort(agentType.outputPorts, 'telemetry')
      expect(port.dataType).toBe('json')
      expect(port.multiple).toBe(true)
      expect(port.maxConnections).toBeNull()
    })

    it('evidence-requests 端口: json 类型, multiple, 无连接上限', () => {
      const port = findPort(agentType.outputPorts, 'evidence-requests')
      expect(port.dataType).toBe('json')
      expect(port.multiple).toBe(true)
      expect(port.maxConnections).toBeNull()
    })
  })

  describe('端口 schema 定义', () => {
    it('所有端口均定义了 schema', () => {
      const allPorts = [...agentType.inputPorts, ...agentType.outputPorts]
      for (const port of allPorts) {
        expect(port.schema, `port '${port.id}' 缺少 schema`).toBeDefined()
      }
    })

    it('json 类型端口使用 object schema', () => {
      const jsonPorts = [...agentType.inputPorts, ...agentType.outputPorts].filter(
        (p) => p.dataType === 'json',
      )
      for (const port of jsonPorts) {
        expect(port.schema?.kind, `port '${port.id}'`).toBe('json')
        if (port.schema?.kind === 'json') {
          expect(port.schema.shape).toBe('object')
        }
      }
    })

    it('非 json 类型端口使用标量 schema', () => {
      const scalarPorts = [...agentType.inputPorts, ...agentType.outputPorts].filter(
        (p) => p.dataType !== 'json',
      )
      for (const port of scalarPorts) {
        expect(port.schema?.kind, `port '${port.id}'`).not.toBe('json')
      }
    })
  })
})
