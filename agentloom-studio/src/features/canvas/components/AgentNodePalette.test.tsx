import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { AgentNodePalette } from './AgentNodePalette'

describe('AgentNodePalette', () => {
  it('shows text nodes for prompt composition', () => {
    render(<AgentNodePalette />)

    expect(screen.getByText('提示')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /Text提供可复用的文本常量/i }),
    ).toBeInTheDocument()
  })

  it('shows memory nodes in the palette', () => {
    render(<AgentNodePalette />)

    expect(screen.getByText('记忆')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Memory图谱记忆实例节点/i })).toBeInTheDocument()
  })

  it('matches smart-routing by english slug aliases', async () => {
    const user = userEvent.setup()
    render(<AgentNodePalette />)

    await user.type(screen.getByPlaceholderText('搜索节点...'), 'smart routing')

    expect(
      screen.getByRole('button', { name: /智能路由根据策略从多个 LLM 模型中选择最优模型/i }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /Memory图谱记忆实例节点/i }),
    ).not.toBeInTheDocument()
  })
})
