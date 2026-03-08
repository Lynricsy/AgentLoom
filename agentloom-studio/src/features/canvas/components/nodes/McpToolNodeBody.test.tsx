import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { CanvasNodeData } from '../../types'
import { McpToolNodeBody } from './McpToolNodeBody'

function createMcpNodeData(overrides: Partial<CanvasNodeData> = {}): CanvasNodeData {
  return {
    label: 'Test MCP Tool',
    nodeType: 'mcp-tool',
    category: 'tool',
    config: {},
    inputPorts: [
      {
        id: 'p1',
        label: 'Prompt',
        direction: 'input' as const,
        dataType: 'text' as const,
        required: false,
        multiple: false,
        maxConnections: 1,
        schema: { kind: 'text' as const, title: 'Prompt' },
      },
    ],
    outputPorts: [
      {
        id: 'p2',
        label: 'Result',
        direction: 'output' as const,
        dataType: 'json' as const,
        required: false,
        multiple: false,
        maxConnections: 1,
        schema: {
          kind: 'json' as const,
          shape: 'object' as const,
          title: 'Result',
          properties: {},
          additionalProperties: true,
        },
      },
    ],
    description: 'A test MCP tool description',
    ...overrides,
  }
}

describe('McpToolNodeBody', () => {
  it('renders MCP badge', () => {
    render(<McpToolNodeBody data={createMcpNodeData()} />)
    expect(screen.getByText('MCP')).toBeInTheDocument()
  })

  it('renders description when present', () => {
    render(<McpToolNodeBody data={createMcpNodeData({ description: 'My tool description' })} />)
    expect(screen.getByText('My tool description')).toBeInTheDocument()
  })

  it('hides description when absent', () => {
    render(<McpToolNodeBody data={createMcpNodeData({ description: undefined })} />)
    expect(screen.queryByText('A test MCP tool description')).not.toBeInTheDocument()
  })

  it('shows port counts when ports exist', () => {
    render(<McpToolNodeBody data={createMcpNodeData()} />)
    expect(screen.getByText('1入 / 1出')).toBeInTheDocument()
  })

  it('hides port counts when no ports', () => {
    render(<McpToolNodeBody data={createMcpNodeData({ inputPorts: [], outputPorts: [] })} />)
    expect(screen.queryByText(/入/)).not.toBeInTheDocument()
  })
})
