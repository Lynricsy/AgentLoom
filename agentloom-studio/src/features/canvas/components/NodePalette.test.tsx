import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { DYNAMIC_ONLY_NODE_TYPES, getAllNodeTypes } from '../types/nodeTypeRegistry'
import { PALETTE_GROUPS } from './nodeCategories'
import { DRAG_TRANSFER_TYPE, NodePalette } from './NodePalette'

const mcpQueryMock = vi.hoisted(() => {
  return {
    useMcpTools: vi.fn<(source?: string) => { data: unknown[] | undefined }>(() => ({
      data: undefined,
    })),
  }
})

vi.mock('../api/mcpToolQueries', () => ({
  useMcpTools: mcpQueryMock.useMcpTools,
}))

vi.mock('../types/mcpToolMapping', () => ({
  buildMcpToolPorts: vi.fn(() => ({
    inputPorts: [
      {
        id: 'mock-in',
        label: 'Mock Input',
        direction: 'input' as const,
        dataType: 'text' as const,
        required: false,
        multiple: false,
        maxConnections: 1,
        schema: { kind: 'text' as const, title: 'Mock Input' },
      },
    ],
    outputPorts: [
      {
        id: 'mock-out',
        label: 'Mock Output',
        direction: 'output' as const,
        dataType: 'json' as const,
        required: false,
        multiple: false,
        maxConnections: 1,
        schema: {
          kind: 'json' as const,
          shape: 'object' as const,
          title: 'Mock Output',
          properties: {},
          additionalProperties: true,
        },
      },
    ],
  })),
}))

const mockMcpTools = [
  {
    id: 'tool-1',
    name: 'search-tool',
    title: 'Search Tool',
    description: 'Searches for things',
    inputSchema: { type: 'object' },
    outputSchema: null,
    portMappingMetadata: {},
    source: 'mcp',
    mcpServerConfigId: 'server-1',
    isActive: true,
    annotations: null,
  },
  {
    id: 'tool-2',
    name: 'inactive-tool',
    title: 'Inactive Tool',
    description: 'This tool is inactive',
    inputSchema: null,
    outputSchema: null,
    portMappingMetadata: {},
    source: 'mcp',
    mcpServerConfigId: 'server-1',
    isActive: false,
    annotations: null,
  },
]

describe('NodePalette', () => {
  it('renders all palette groups', () => {
    render(<NodePalette />)

    expect(screen.getByText('Agent')).toBeInTheDocument()
    expect(screen.getByText('Tool')).toBeInTheDocument()
    expect(screen.getByText('Trigger')).toBeInTheDocument()
    expect(screen.getByText('Knowledge')).toBeInTheDocument()
    expect(screen.getByText('Output')).toBeInTheDocument()
    expect(screen.getByText('Control')).toBeInTheDocument()
  })

  it('derives palette items from the node type registry', () => {
    const paletteTypes = PALETTE_GROUPS.flatMap((group) => group.items.map((item) => item.type))
    const registryTypes = getAllNodeTypes()
      .filter((config) => !DYNAMIC_ONLY_NODE_TYPES.has(config.type))
      .map((config) => config.type)

    expect(paletteTypes).toEqual(registryTypes)
  })

  it('filters items by search query', async () => {
    const user = userEvent.setup()
    render(<NodePalette />)

    await user.type(screen.getByPlaceholderText('搜索节点...'), 'schedule')

    expect(screen.getByText('Schedule')).toBeInTheDocument()
    expect(screen.queryByText('LLM Agent')).not.toBeInTheDocument()
  })

  it('collapses and expands groups', async () => {
    const user = userEvent.setup()
    render(<NodePalette />)

    const agentHeader = screen.getByText('Agent').closest('button')

    if (!agentHeader) {
      throw new Error('Expected Agent group toggle to exist')
    }

    await user.click(agentHeader)
    expect(screen.queryByText('LLM Agent')).not.toBeInTheDocument()

    await user.click(agentHeader)
    expect(screen.getByText('LLM Agent')).toBeInTheDocument()
  })

  it('writes drag payloads using the expected transfer type', async () => {
    render(<NodePalette />)

    const setData = vi.fn()
    const dragTarget = screen.getByText('LLM Agent').closest('button')

    if (!dragTarget) {
      throw new Error('Expected draggable palette item to exist')
    }

    fireEvent.dragStart(dragTarget, {
      dataTransfer: {
        setData,
        effectAllowed: 'none',
      } as unknown as DataTransfer,
    })

    expect(setData).toHaveBeenCalledWith(DRAG_TRANSFER_TYPE, expect.stringContaining('llm-agent'))
  })

  describe('MCP tool integration', () => {
    it('renders "Imported Tools" group when active MCP tools exist', () => {
      mcpQueryMock.useMcpTools.mockReturnValue({ data: mockMcpTools })
      render(<NodePalette />)
      expect(screen.getByText('Imported Tools')).toBeInTheDocument()
      expect(screen.getByText('Search Tool')).toBeInTheDocument()
    })

    it('hides "Imported Tools" group when no MCP tools exist', () => {
      mcpQueryMock.useMcpTools.mockReturnValue({ data: [] })
      render(<NodePalette />)
      expect(screen.queryByText('Imported Tools')).not.toBeInTheDocument()
    })

    it('only shows active MCP tools', () => {
      mcpQueryMock.useMcpTools.mockReturnValue({ data: mockMcpTools })
      render(<NodePalette />)
      expect(screen.getByText('Search Tool')).toBeInTheDocument()
      expect(screen.queryByText('Inactive Tool')).not.toBeInTheDocument()
    })

    it('MCP drag payload includes mcpToolDefinitionId', () => {
      mcpQueryMock.useMcpTools.mockReturnValue({ data: mockMcpTools })
      render(<NodePalette />)

      const setData = vi.fn()
      const dragTarget = screen.getByText('Search Tool').closest('button')

      if (!dragTarget) {
        throw new Error('Expected draggable MCP palette item to exist')
      }

      fireEvent.dragStart(dragTarget, {
        dataTransfer: {
          setData,
          effectAllowed: 'none',
        } as unknown as DataTransfer,
      })

      expect(setData).toHaveBeenCalledWith(
        DRAG_TRANSFER_TYPE,
        expect.stringContaining('tool-1'),
      )
    })

    it('filters MCP tools by search query', async () => {
      mcpQueryMock.useMcpTools.mockReturnValue({ data: mockMcpTools })
      const user = userEvent.setup()
      render(<NodePalette />)

      await user.type(screen.getByPlaceholderText('搜索节点...'), 'search')

      expect(screen.getByText('Search Tool')).toBeInTheDocument()
      expect(screen.queryByText('LLM Agent')).not.toBeInTheDocument()
    })
  })
})
