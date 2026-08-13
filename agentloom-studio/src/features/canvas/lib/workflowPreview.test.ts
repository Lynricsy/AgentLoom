import { describe, expect, it } from 'vitest'
import { buildWorkflowPreviewGraph } from './workflowPreview'

/** 从归一化结果里安全读出端口 id 列表（预览节点 data 是宽松的 Record） */
function readPortIds(data: unknown, key: 'inputPorts' | 'outputPorts'): string[] {
  if (!data || typeof data !== 'object') {
    return []
  }

  const ports = Reflect.get(data, key)
  if (!Array.isArray(ports)) {
    return []
  }

  return ports.flatMap((port) =>
    port && typeof port === 'object' && 'id' in port && typeof port.id === 'string'
      ? [port.id]
      : [],
  )
}

describe('buildWorkflowPreviewGraph', () => {
  it('按 nodeType 归一化预览节点并为只读预览边补齐 smart type', () => {
    const preview = buildWorkflowPreviewGraph({
      nodes: [
        {
          id: 'node-1',
          type: 'workflow-node',
          position: { x: 24, y: 48 },
          data: {
            nodeType: 'agent',
            label: '聊天 Agent',
          },
        },
      ],
      edges: [
        {
          id: 'edge-1',
          source: 'node-1',
          target: 'node-2',
          source_handle: 'exec-out',
          target_handle: 'exec-in',
        },
      ],
      viewport: { x: 10, y: 20, zoom: 0.8 },
    })

    expect(preview.nodes).toHaveLength(1)
    expect(preview.nodes[0]).toMatchObject({
      id: 'node-1',
      type: 'agent',
      position: { x: 24, y: 48 },
      data: {
        nodeType: 'agent',
        category: 'agent',
        label: '聊天 Agent',
      },
    })
    expect(preview.edges).toHaveLength(1)
    expect(preview.edges[0]).toMatchObject({
      id: 'edge-1',
      type: 'smart',
      source: 'node-1',
      target: 'node-2',
      sourceHandle: 'exec-out',
      targetHandle: 'exec-in',
      data: expect.objectContaining({
        readonlyPreview: true,
      }),
    })
    expect(preview.viewport).toEqual({ x: 10, y: 20, zoom: 0.8 })
  })

  it('清除快照携带的选中态，预览不显示选中描边', () => {
    const preview = buildWorkflowPreviewGraph({
      nodes: [
        {
          id: 'node-1',
          type: 'workflow-node',
          position: { x: 0, y: 0 },
          selected: true,
          data: { nodeType: 'agent', label: '聊天 Agent' },
        },
        {
          id: 'node-2',
          type: 'workflow-node',
          selected: true,
          data: { nodeType: 'future-node-type', label: '未知' },
        },
      ],
      edges: [
        { id: 'edge-1', source: 'node-1', target: 'node-2', selected: true },
      ],
    })

    expect(preview.nodes.map((node) => node.selected)).toEqual([false, false])
    expect(preview.edges[0]?.selected).toBe(false)
  })

  it('未知节点类型回退为可渲染的 control 卡片并保留原始端口', () => {
    const preview = buildWorkflowPreviewGraph({
      nodes: [
        {
          id: 'node-1',
          type: 'workflow-node',
          position: { x: 0, y: 0 },
          data: {
            nodeType: 'unknown-node',
            label: '未知节点',
            inputPorts: [
              { id: 'exec-in', label: '', direction: 'input', dataType: 'exec' },
            ],
          },
        },
      ],
      edges: [],
    })

    expect(preview.nodes[0]).toMatchObject({
      id: 'node-1',
      type: 'control',
      data: {
        label: '未知节点',
        nodeType: 'unknown-node',
        category: 'control',
      },
    })
    expect(readPortIds(preview.nodes[0]?.data, 'inputPorts')).toEqual([
      'exec-in',
    ])
  })

  it('缺 position 的节点排进兜底网格而不是被丢弃', () => {
    const preview = buildWorkflowPreviewGraph({
      nodes: Array.from({ length: 5 }, (_, index) => ({
        id: `node-${index}`,
        type: 'workflow-node',
        data: { nodeType: 'agent', label: `节点 ${index}` },
      })),
      edges: [],
    })

    expect(preview.nodes).toHaveLength(5)
    expect(preview.nodes.map((node) => node.position)).toEqual([
      { x: 0, y: 0 },
      { x: 320, y: 0 },
      { x: 640, y: 0 },
      { x: 0, y: 200 },
      { x: 320, y: 200 },
    ])
  })

  it('缺 id 的节点仍然被丢弃', () => {
    const preview = buildWorkflowPreviewGraph({
      nodes: [{ type: 'workflow-node', position: { x: 0, y: 0 } }],
      edges: [],
    })

    expect(preview.nodes).toHaveLength(0)
  })

  it('为 workflow agent 预览补齐新的 system-prompt-in 端口并保留 no_sandbox 过滤', () => {
    const preview = buildWorkflowPreviewGraph({
      nodes: [
        {
          id: 'agent-1',
          type: 'workflow-node',
          position: { x: 32, y: 48 },
          data: {
            nodeType: 'agent',
            label: '审查 Agent',
            agentRuntimeMode: 'no_sandbox',
          },
        },
      ],
      edges: [],
    })

    const inputPortIds = readPortIds(preview.nodes[0]?.data, 'inputPorts')

    expect(inputPortIds).toContain('system-prompt-in')
    expect(inputPortIds).not.toContain('sandbox-in')
  })
})
