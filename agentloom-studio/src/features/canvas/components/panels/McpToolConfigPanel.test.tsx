import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { CanvasNodeData } from '../../types'
import { McpToolConfigPanel } from './McpToolConfigPanel'

const mockUseMcpServerConfigs = vi.fn()
const mockUseMcpServerConfig = vi.fn()

vi.mock('@/features/mcp', () => ({
  useMcpServerConfigs: (...args: unknown[]) => mockUseMcpServerConfigs(...args),
  useMcpServerConfig: (...args: unknown[]) => mockUseMcpServerConfig(...args),
}))

function createMcpNodeData(overrides: Partial<CanvasNodeData> = {}): CanvasNodeData {
  return {
    label: 'Test MCP Server',
    nodeType: 'mcp-tool',
    category: 'tool',
    config: {
      mcpServerConfigId: 'server-1',
      mcpServerName: 'Test Server',
      enabledToolIds: ['tool-1', 'tool-2'],
      tools: [
        {
          id: 'tool-1',
          name: 'search',
          title: 'Search Tool',
          description: 'Search the web',
          inputSchema: null,
          outputSchema: null,
          portMappingMetadata: null,
          source: 'mcp',
          mcpServerConfigId: 'server-1',
          isActive: true,
          annotations: null,
        },
        {
          id: 'tool-2',
          name: 'read',
          title: 'Read Tool',
          description: 'Read a file',
          inputSchema: null,
          outputSchema: null,
          portMappingMetadata: null,
          source: 'mcp',
          mcpServerConfigId: 'server-1',
          isActive: true,
          annotations: null,
        },
      ],
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
    description: 'A test MCP server',
    ...overrides,
  }
}

function setupHookDefaults(overrides?: {
  servers?: unknown[]
  serversLoading?: boolean
  serverDetail?: unknown
  detailLoading?: boolean
}) {
  mockUseMcpServerConfigs.mockReturnValue({
    data: overrides?.servers != null ? { data: overrides.servers } : { data: [] },
    isLoading: overrides?.serversLoading ?? false,
  })
  mockUseMcpServerConfig.mockReturnValue({
    data: overrides?.serverDetail ?? null,
    isLoading: overrides?.detailLoading ?? false,
  })
}

describe('McpToolConfigPanel', () => {
  it('renders MCP Server badge', () => {
    setupHookDefaults()
    render(
      <McpToolConfigPanel
        data={createMcpNodeData()}
        onApply={vi.fn()}
      />,
    )
    expect(screen.getByText('MCP Server')).toBeInTheDocument()
  })

  it('renders server selection label when not configured', () => {
    setupHookDefaults()
    render(
      <McpToolConfigPanel
        data={createMcpNodeData({ config: {} })}
        onApply={vi.fn()}
      />,
    )
    expect(screen.getByText('选择 MCP Server')).toBeInTheDocument()
  })

  it('shows loading state while servers are loading', () => {
    setupHookDefaults({ serversLoading: true })
    render(
      <McpToolConfigPanel
        data={createMcpNodeData({ config: {} })}
        onApply={vi.fn()}
      />,
    )
    expect(screen.getByText('加载中...')).toBeInTheDocument()
  })

  it('shows configured server info when server is selected', () => {
    setupHookDefaults()
    render(
      <McpToolConfigPanel
        data={createMcpNodeData()}
        onApply={vi.fn()}
      />,
    )
    expect(screen.getByText('Test Server')).toBeInTheDocument()
    expect(screen.getByText('2 / 2 个工具已启用')).toBeInTheDocument()
  })

  it('shows tool list toggle for configured server', () => {
    setupHookDefaults()
    render(
      <McpToolConfigPanel
        data={createMcpNodeData()}
        onApply={vi.fn()}
      />,
    )
    expect(screen.getByText('查看工具列表')).toBeInTheDocument()
  })

  it('shows clear button for configured server', () => {
    setupHookDefaults()
    render(
      <McpToolConfigPanel
        data={createMcpNodeData()}
        onApply={vi.fn()}
      />,
    )
    expect(screen.getByText('清除')).toBeInTheDocument()
  })

  it('does not render input ports section', () => {
    setupHookDefaults()
    render(
      <McpToolConfigPanel
        data={createMcpNodeData()}
        onApply={vi.fn()}
      />,
    )
    expect(screen.queryByText('输入端口')).not.toBeInTheDocument()
  })
})
