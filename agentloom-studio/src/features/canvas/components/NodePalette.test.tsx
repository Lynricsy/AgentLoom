import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { getAllNodeTypes } from '../types/nodeTypeRegistry'
import { PALETTE_GROUPS } from './nodeCategories'
import { DRAG_TRANSFER_TYPE, NodePalette } from './NodePalette'

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
    const registryTypes = getAllNodeTypes().map((config) => config.type)

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
})
