import { describe, it, expect } from 'vitest'
import {
  DEFAULT_AUTONOMY_CONFIG,
  DEFAULT_OUTPUT_FORMAT_STRATEGY,
} from '../../autonomy.types'
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

    expect(defaults.autonomyConfig).toEqual(DEFAULT_AUTONOMY_CONFIG)
    expect(defaults.outputFormatStrategy).toEqual(DEFAULT_OUTPUT_FORMAT_STRATEGY)

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

  it('autonomyConfig 与 outputFormatStrategy 均遵循强类型契约', () => {
    const defaults = createDefaultAgentNodeData()

    const extended: AgentNodeData['autonomyConfig'] = {
      ...defaults.autonomyConfig,
      mode: 'RULE_BASED',
      allowedInferenceFields: ['model'],
    }
    expect(extended).toMatchObject({
      mode: 'RULE_BASED',
      allowedInferenceFields: ['model'],
    })

    const format: AgentNodeData['outputFormatStrategy'] = {
      ...defaults.outputFormatStrategy,
      outputSchema: '{"type":"object"}',
      strictness: 'strict',
      allowDegrade: false,
      repairPolicy: 'manual',
    }
    expect(format).toEqual({
      outputSchema: '{"type":"object"}',
      strictness: 'strict',
      allowDegrade: false,
      repairPolicy: 'manual',
    })
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

describe('chat-agent 端口定义', () => {
  const agentType = getNodeTypeConfig('chat-agent')

  it('包含 2 个输入端口和 2 个输出端口', () => {
    expect(agentType.inputPorts).toHaveLength(2)
    expect(agentType.outputPorts).toHaveLength(2)
  })

  describe('输入端口', () => {
    it('messages-in 端口: json 类型, 单连接', () => {
      const port = findPort(agentType.inputPorts, 'messages-in')
      expect(port.dataType).toBe('json')
      expect(port.multiple).toBe(false)
      expect(port.maxConnections).toBe(1)
      expect(port.required).toBe(false)
    })

    it('model-in 端口: model 类型, 单连接', () => {
      const port = findPort(agentType.inputPorts, 'model-in')
      expect(port.dataType).toBe('model')
      expect(port.multiple).toBe(false)
      expect(port.maxConnections).toBe(1)
      expect(port.required).toBe(false)
    })
  })

  describe('输出端口', () => {
    it('reply-out 端口: text 类型, 单连接', () => {
      const port = findPort(agentType.outputPorts, 'reply-out')
      expect(port.dataType).toBe('text')
      expect(port.multiple).toBe(false)
      expect(port.maxConnections).toBe(1)
    })

    it('structured-out 端口: json 类型, 单连接', () => {
      const port = findPort(agentType.outputPorts, 'structured-out')
      expect(port.dataType).toBe('json')
      expect(port.multiple).toBe(false)
      expect(port.maxConnections).toBe(1)
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
