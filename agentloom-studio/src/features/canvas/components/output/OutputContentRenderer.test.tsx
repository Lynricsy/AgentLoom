import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { OutputContentRenderer } from './OutputContentRenderer'

describe('OutputContentRenderer', () => {
  it('renders valid json output as a structured tree', async () => {
    const user = userEvent.setup()
    render(
      <OutputContentRenderer
        format="json"
        output='{"name":"酒狐","count":2,"nested":{"ready":true}}'
        placeholder="无输出"
      />,
    )

    expect(screen.getByText('name:')).toBeInTheDocument()
    expect(screen.getByText('酒狐')).toBeInTheDocument()
    expect(screen.getByText('count:')).toBeInTheDocument()
    // 第二层默认折叠,展开后才渲染子节点
    const nested = screen.getByRole('button', { name: 'nested {1}' })
    expect(nested).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('ready:')).not.toBeInTheDocument()

    await user.click(nested)
    expect(nested).toHaveAttribute('aria-expanded', 'true')
    expect(await screen.findByText('ready:')).toBeInTheDocument()
    expect(screen.getByText('true')).toBeInTheDocument()
  })

  it('falls back to raw rendering when json output is invalid', () => {
    render(
      <OutputContentRenderer
        format="json"
        output='{"name":'
        placeholder="无输出"
      />,
    )

    expect(
      screen.getByText('当前输出不是合法 JSON，已回退到原文'),
    ).toBeInTheDocument()
    expect(screen.getByText('{"name":')).toBeInTheDocument()
  })
})
