import { describe, expect, it } from 'vitest'
import {
  AGENT_CANVAS_NODE_TYPES,
  getAgentNodeTypeConfig,
} from './agent-canvas-registry'

describe('agent-canvas-registry', () => {
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
      id: 'memory-out-0',
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
})
