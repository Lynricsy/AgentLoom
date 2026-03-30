import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { DYNAMIC_ONLY_NODE_TYPES, getAllNodeTypes } from '../types/nodeTypeRegistry'
import { PALETTE_GROUPS } from './nodeCategories'
import { DRAG_TRANSFER_TYPE, NodePalette } from './NodePalette'

vi.mock('@/features/block-library/components/BlockLibraryPanel', () => ({
  BlockLibraryPanel: () => <div data-testid="block-library-panel">块库面板</div>,
}))

vi.mock('@/features/plugin', () => ({
  useActivePlugins: vi.fn(() => ({ data: undefined })),
}))

describe('NodePalette', () => {
  it('renders tabs for nodes and blocks', () => {
    render(<NodePalette />)

    expect(screen.getByRole('button', { name: '节点' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'My Blocks' })).toBeInTheDocument()
  })

  it('renders all palette groups', () => {
    render(<NodePalette />)

    const groupHeaders = screen
      .getAllByRole('button')
      .filter((btn) => btn.querySelector('.flex-1.text-left'))
      .map((btn) => btn.querySelector('.flex-1.text-left')?.textContent)

    expect(groupHeaders).toContain('Agent')
    expect(groupHeaders).toContain('Tool')
    expect(groupHeaders).toContain('Trigger')
    expect(groupHeaders).toContain('Knowledge')
    expect(groupHeaders).toContain('Memory')
    expect(groupHeaders).toContain('Output')
    expect(groupHeaders).toContain('Control')
  })

  it('switches to the block library tab', async () => {
    const user = userEvent.setup()
    render(<NodePalette />)

    await user.click(screen.getByRole('button', { name: 'My Blocks' }))

    expect(screen.getByTestId('block-library-panel')).toBeInTheDocument()
    expect(screen.queryByPlaceholderText('搜索节点...')).not.toBeInTheDocument()
  })

  it('derives palette items from the node type registry', () => {
    const paletteTypes = PALETTE_GROUPS.flatMap((group) => group.items.map((item) => item.type))
    const registryTypes = getAllNodeTypes()
      .filter((config) => !DYNAMIC_ONLY_NODE_TYPES.has(config.type))
      .map((config) => config.type)

    expect(paletteTypes).toEqual([
      'chat-agent',
      'llm-model',
      'smart-routing',
      'agent',
      'skill',
      'http-tool',
      'code-tool',
      'mcp-tool',
      'sandbox',
      'input-preprocessor',
      'workspace',
      'manual-trigger',
      'schedule-trigger',
      'webhook-trigger',
      'api-event-trigger',
      'knowledge-base',
      'memory',
      'text-output',
      'json-output',
      'condition',
      'loop',
    ])
    expect(new Set(paletteTypes)).toEqual(new Set(registryTypes))
  })

  it('filters items by search query', async () => {
    const user = userEvent.setup()
    render(<NodePalette />)

    await user.type(screen.getByPlaceholderText('搜索节点...'), 'schedule')

    expect(screen.getByText('Schedule')).toBeInTheDocument()
    expect(screen.queryByText('Chat Agent')).not.toBeInTheDocument()
  })

  it('collapses and expands groups', async () => {
    const user = userEvent.setup()
    render(<NodePalette />)

    const agentHeader = screen
      .getAllByRole('button')
      .find((btn) => btn.querySelector('.flex-1.text-left')?.textContent === 'Agent')

    if (!agentHeader) {
      throw new Error('Expected Agent group toggle to exist')
    }

    await user.click(agentHeader)
    expect(screen.queryByText('Chat Agent')).not.toBeInTheDocument()

    await user.click(agentHeader)
    expect(screen.getByText('Chat Agent')).toBeInTheDocument()
  })

  it('writes drag payloads using the expected transfer type', async () => {
    render(<NodePalette />)

    const setData = vi.fn()
    const dragTarget = screen.getByText('Chat Agent').closest('button')

    if (!dragTarget) {
      throw new Error('Expected draggable palette item to exist')
    }

    fireEvent.dragStart(dragTarget, {
      dataTransfer: {
        setData,
        effectAllowed: 'none',
      } as unknown as DataTransfer,
    })

    expect(setData).toHaveBeenCalledWith(DRAG_TRANSFER_TYPE, expect.stringContaining('chat-agent'))
  })

  it('includes MCP Tool as a static palette item in the Tool group', () => {
    render(<NodePalette />)
    expect(screen.getByText('MCP Tool')).toBeInTheDocument()
  })
})
