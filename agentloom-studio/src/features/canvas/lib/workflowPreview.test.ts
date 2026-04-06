import { describe, expect, it } from 'vitest'
import { buildWorkflowPreviewGraph } from './workflowPreview'

describe('buildWorkflowPreviewGraph', () => {
  it('按 nodeType 归一化预览节点并为只读预览边补齐 smart type', () => {
    const preview = buildWorkflowPreviewGraph({
      nodes: [
        {
          id: 'node-1',
          type: 'workflow-node',
          position: { x: 24, y: 48 },
          data: {
            nodeType: 'chat-agent',
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
        nodeType: 'chat-agent',
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

  it('对未知节点类型回退为默认节点而不是渲染坏壳子', () => {
    const preview = buildWorkflowPreviewGraph({
      nodes: [
        {
          id: 'node-1',
          type: 'workflow-node',
          position: { x: 0, y: 0 },
          data: {
            nodeType: 'unknown-node',
            label: '未知节点',
          },
        },
      ],
      edges: [],
    })

    expect(preview.nodes[0]).toMatchObject({
      id: 'node-1',
      type: 'default',
      data: {
        label: '未知节点',
      },
    })
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

    const inputPorts = (preview.nodes[0]?.data as { inputPorts?: Array<{ id: string }> }).inputPorts ?? []
    const inputPortIds = inputPorts.map((port) => port.id)

    expect(inputPortIds).toContain('system-prompt-in')
    expect(inputPortIds).not.toContain('sandbox-in')
  })
})
