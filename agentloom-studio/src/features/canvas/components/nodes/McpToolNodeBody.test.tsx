import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { CanvasNodeData } from '../../types'
import { McpToolNodeBody } from './McpToolNodeBody'

function createMcpNodeData(overrides: Partial<CanvasNodeData> = {}): CanvasNodeData {
  return {
    label: 'Test MCP Server',
    nodeType: 'mcp-tool',
    category: 'tool',
    config: {
      mcpServerConfigId: 'server-1',
      mcpServerName: 'My MCP Server',
      enabledToolIds: ['tool-1', 'tool-2', 'tool-3'],
      tools: [],
    },
    inputPorts: [],
    outputPorts: [
      {
        id: 'tool-output',
        label: 'Tool',
        direction: 'output' as const,
        dataType: 'tool' as const,
        required: false,
        multiple: false,
        maxConnections: null,
        schema: { kind: 'tool' as const },
      },
    ],
    ...overrides,
  }
}

describe('McpToolNodeBody', () => {
  it('renders MCP badge', () => {
    render(<McpToolNodeBody data={createMcpNodeData()} />)
    expect(screen.getByText('MCP')).toBeInTheDocument()
  })

  it('renders server name', () => {
    render(<McpToolNodeBody data={createMcpNodeData()} />)
    expect(screen.getByText('My MCP Server')).toBeInTheDocument()
  })

  it('renders tool count', () => {
    render(<McpToolNodeBody data={createMcpNodeData()} />)
    expect(screen.getByText('3 个工具')).toBeInTheDocument()
  })

  it('shows placeholder when not configured', () => {
    render(<McpToolNodeBody data={createMcpNodeData({ config: {} })} />)
    expect(screen.getByText('选择 MCP Server')).toBeInTheDocument()
  })

  it('falls back to config ID when server name is empty', () => {
    render(
      <McpToolNodeBody
        data={createMcpNodeData({
          config: { mcpServerConfigId: 'srv-abc', enabledToolIds: ['t1'] },
        })}
      />,
    )
    expect(screen.getByText('srv-abc')).toBeInTheDocument()
  })
})
