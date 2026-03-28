import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { CanvasNodeData } from '../../types'
import { McpToolConfigPanel } from './McpToolConfigPanel'

const mockUseMcpTools = vi.fn()
const mockUseMcpServerConfigs = vi.fn()

vi.mock('../../api/mcpToolQueries', () => ({
  useMcpTools: (...args: unknown[]) => mockUseMcpTools(...args),
}))

vi.mock('@/features/mcp', () => ({
  useMcpServerConfigs: (...args: unknown[]) => mockUseMcpServerConfigs(...args),
}))

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

function setupHookDefaults(overrides?: {
  tools?: unknown[]
  toolsLoading?: boolean
  servers?: unknown[]
  serversLoading?: boolean
}) {
  mockUseMcpTools.mockReturnValue({
    data: overrides?.tools ?? [],
    isLoading: overrides?.toolsLoading ?? false,
  })
  mockUseMcpServerConfigs.mockReturnValue({
    data: overrides?.servers != null ? { data: overrides.servers } : { data: [] },
    isLoading: overrides?.serversLoading ?? false,
  })
}

describe('McpToolConfigPanel', () => {
  it('renders MCP Tool badge', () => {
    setupHookDefaults()
    render(
      <McpToolConfigPanel
        data={createMcpNodeData()}
        config={createMcpNodeData().config}
        onApply={vi.fn()}
      />,
    )
    expect(screen.getByText('MCP Tool')).toBeInTheDocument()
  })

  it('renders tool selector label', () => {
    setupHookDefaults()
    render(
      <McpToolConfigPanel
        data={createMcpNodeData()}
        config={createMcpNodeData().config}
        onApply={vi.fn()}
      />,
    )
    expect(screen.getByText('选择工具')).toBeInTheDocument()
  })

  it('shows loading state while tools are loading', () => {
    setupHookDefaults({ toolsLoading: true })
    render(
      <McpToolConfigPanel
        data={createMcpNodeData()}
        config={createMcpNodeData().config}
        onApply={vi.fn()}
      />,
    )
    expect(screen.getByText('加载中...')).toBeInTheDocument()
  })

  it('shows missing tool warning when ID is set but tool not found', () => {
    setupHookDefaults({ tools: [] })
    render(
      <McpToolConfigPanel
        data={createMcpNodeData({ mcpToolDefinitionId: 'nonexistent-id' })}
        config={{}}
        onApply={vi.fn()}
      />,
    )
    expect(screen.getByTestId('mcp-tool-missing-warning')).toBeInTheDocument()
  })

  it('shows tool details when selected tool is found', () => {
    setupHookDefaults({
      tools: [
        {
          id: 'tool-def-abc',
          name: 'my-tool',
          title: 'My Tool',
          description: 'Tool description',
          isActive: true,
          mcpServerConfigId: 'server-1',
          inputSchema: { type: 'object' },
          portMappingMetadata: null,
        },
      ],
      servers: [{ id: 'server-1', name: 'Test Server' }],
    })
    render(
      <McpToolConfigPanel
        data={createMcpNodeData()}
        config={createMcpNodeData().config}
        onApply={vi.fn()}
      />,
    )
    // Tool name appears in both select option and detail card
    expect(screen.getAllByText('My Tool').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Tool description')).toBeInTheDocument()
  })

  it('renders input ports when tool is selected and ports exist', () => {
    setupHookDefaults({
      tools: [
        {
          id: 'tool-def-abc',
          name: 'my-tool',
          title: 'My Tool',
          isActive: true,
          mcpServerConfigId: 'server-1',
          inputSchema: null,
          portMappingMetadata: null,
        },
      ],
    })
    render(
      <McpToolConfigPanel
        data={createMcpNodeData()}
        config={createMcpNodeData().config}
        onApply={vi.fn()}
      />,
    )
    expect(screen.getByText('输入端口')).toBeInTheDocument()
    expect(screen.getByText('Prompt')).toBeInTheDocument()
  })

  it('does not show missing warning when no tool ID is set', () => {
    setupHookDefaults({ tools: [] })
    render(
      <McpToolConfigPanel
        data={createMcpNodeData({ mcpToolDefinitionId: '' })}
        config={{}}
        onApply={vi.fn()}
      />,
    )
    expect(screen.queryByTestId('mcp-tool-missing-warning')).not.toBeInTheDocument()
  })
})
