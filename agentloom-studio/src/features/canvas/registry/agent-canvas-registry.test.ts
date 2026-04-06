import { describe, expect, it } from 'vitest'
import {
  AGENT_CANVAS_NODE_TYPES,
  getAgentNodeTypeConfig,
} from './agent-canvas-registry'

describe('agent-canvas-registry', () => {
  it('registers text as an agent-canvas source node for system prompts', () => {
    expect(AGENT_CANVAS_NODE_TYPES).toContain('text')

    const textNode = getAgentNodeTypeConfig('text')

    expect(textNode).toMatchObject({
      type: 'text',
      category: 'output',
      label: 'Text',
    })
    expect(textNode?.inputPorts).toEqual([])
    expect(textNode?.outputPorts).toMatchObject([
      {
        id: 'text-out',
        dataType: 'text',
        direction: 'output',
        multiple: true,
        maxConnections: null,
      },
    ])
  })

  it('registers memory as a first-class agent canvas node', () => {
    expect(AGENT_CANVAS_NODE_TYPES).toContain('memory')

    const memoryNode = getAgentNodeTypeConfig('memory')

    expect(memoryNode).toMatchObject({
      type: 'memory',
      category: 'memory',
      label: 'Memory',
    })
    expect(memoryNode?.outputPorts).toHaveLength(1)
    expect(memoryNode?.outputPorts[0]).toMatchObject({
      id: 'memory-out',
      dataType: 'memory',
      direction: 'output',
    })
    expect(memoryNode?.configSchema.required).toContain('memoryInstanceId')
  })

  it('keeps agent-main memory input compatible with memory outputs', () => {
    const memoryNode = getAgentNodeTypeConfig('memory')
    const agentMainNode = getAgentNodeTypeConfig('agent-main')
    const memoryInput = agentMainNode?.inputPorts.find((port) => port.id === 'memory-in')

    expect(memoryNode?.outputPorts[0]?.dataType).toBe('memory')
    expect(memoryInput).toMatchObject({
      id: 'memory-in',
      dataType: 'memory',
      multiple: true,
      maxConnections: null,
    })
  })

  it('defines sub-agent with override and extension ports instead of legacy text/json inputs', () => {
    const subAgentNode = getAgentNodeTypeConfig('sub-agent')
    const inputPortIds = subAgentNode?.inputPorts.map((port) => port.id)

    expect(inputPortIds).toEqual([
      'system-prompt-in',
      'model-in',
      'schema-in',
      'tools-in',
      'skills-in',
      'sub-agents-in',
      'knowledge-in',
      'memory-in',
    ])
    expect(inputPortIds).not.toContain('text-in')
    expect(inputPortIds).not.toContain('json-in')
    expect(subAgentNode?.outputPorts).toMatchObject([
      {
        id: 'agent-out',
        dataType: 'agent',
        direction: 'output',
      },
    ])
  })
})
