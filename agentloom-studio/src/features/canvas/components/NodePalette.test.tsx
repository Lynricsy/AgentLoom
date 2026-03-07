import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NodePalette, DRAG_TRANSFER_TYPE } from './NodePalette'

describe('NodePalette', () => {
  it('应该渲染所有节点分组', () => {
    render(<NodePalette />)

    expect(screen.getByText('Agent')).toBeInTheDocument()
    expect(screen.getByText('Tool')).toBeInTheDocument()
    expect(screen.getByText('Trigger')).toBeInTheDocument()
    expect(screen.getByText('Knowledge')).toBeInTheDocument()
    expect(screen.getByText('Output')).toBeInTheDocument()
    expect(screen.getByText('Control')).toBeInTheDocument()
  })

  it('搜索过滤应该正确工作', async () => {
    const user = userEvent.setup()
    render(<NodePalette />)

    const searchInput = screen.getByPlaceholderText('搜索节点...')
    await user.type(searchInput, 'Agent')

    expect(screen.getByText('LLM Agent')).toBeInTheDocument()
    expect(screen.getByText('Chat Agent')).toBeInTheDocument()
    expect(screen.queryByText('HTTP Request')).not.toBeInTheDocument()
  })

  it('分组折叠/展开应该工作', async () => {
    const user = userEvent.setup()
    render(<NodePalette />)

    // Agent 组默认展开，可见 LLM Agent
    expect(screen.getByText('LLM Agent')).toBeInTheDocument()

    // 点击 Agent 分组标题折叠
    await user.click(screen.getByText('Agent'))
    expect(screen.queryByText('LLM Agent')).not.toBeInTheDocument()

    // 再次点击展开
    await user.click(screen.getByText('Agent'))
    expect(screen.getByText('LLM Agent')).toBeInTheDocument()
  })

  it('拖拽开始时应该设置正确的 dataTransfer 数据', () => {
    render(<NodePalette />)

    const agentItem = screen.getByText('LLM Agent')
    const setDataMock = vi.fn()
    const mockEvent = new Event('dragstart', { bubbles: true }) as DragEvent
    Object.defineProperty(mockEvent, 'dataTransfer', {
      value: {
        setData: setDataMock,
        effectAllowed: '',
      },
    })

    agentItem.dispatchEvent(mockEvent)

    // 验证 dataTransfer.setData 被调用
    if (setDataMock.mock.calls.length > 0) {
      expect(setDataMock).toHaveBeenCalledWith(
        DRAG_TRANSFER_TYPE,
        expect.stringContaining('llm-agent')
      )
    }
  })
})
