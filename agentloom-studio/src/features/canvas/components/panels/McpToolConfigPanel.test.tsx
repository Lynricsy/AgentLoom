import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { CanvasNodeData } from '../../types'
import { McpToolConfigPanel } from './McpToolConfigPanel'

function createMcpNodeData(overrides: Partial<CanvasNodeData> = {}): CanvasNodeData {
  return {
    label: 'Test MCP Tool',
    nodeType: 'mcp-tool',
    category: 'tool',
    config: {
      inputSchema: { type: 'object', properties: { query: { type: 'string' } } },
    },
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
    mcpToolDefinitionId: 'tool-def-abc',
    ...overrides,
  }
}

describe('McpToolConfigPanel', () => {
  it('renders MCP Tool badge', () => {
    render(<McpToolConfigPanel data={createMcpNodeData()} />)
    expect(screen.getByText('MCP Tool')).toBeInTheDocument()
  })

  it('renders description when present', () => {
    render(<McpToolConfigPanel data={createMcpNodeData()} />)
    expect(screen.getByText('A test MCP tool description')).toBeInTheDocument()
  })

  it('hides description when absent', () => {
    render(<McpToolConfigPanel data={createMcpNodeData({ description: undefined })} />)
    expect(screen.queryByText('A test MCP tool description')).not.toBeInTheDocument()
  })

  it('renders input ports list with labels and types', () => {
    render(<McpToolConfigPanel data={createMcpNodeData()} />)
    expect(screen.getByText('输入端口')).toBeInTheDocument()
    expect(screen.getByText('Prompt')).toBeInTheDocument()
    expect(screen.getByText('text')).toBeInTheDocument()
  })

  it('renders inputSchema as formatted JSON', () => {
    render(<McpToolConfigPanel data={createMcpNodeData()} />)
    expect(screen.getByText('Input Schema')).toBeInTheDocument()
    expect(screen.getByText(/"query"/)).toBeInTheDocument()
  })

  it('renders tool ID when mcpToolDefinitionId is present', () => {
    render(<McpToolConfigPanel data={createMcpNodeData()} />)
    expect(screen.getByText('Tool ID')).toBeInTheDocument()
    expect(screen.getByText('tool-def-abc')).toBeInTheDocument()
  })
})
